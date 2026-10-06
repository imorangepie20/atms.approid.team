import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma.service'
import type { Evidence, EvidenceUpload, Prisma } from '../generated/prisma/client'
import { AuditService } from '../audit/audit.service'
import { SessionService } from '../auth/session.service'
import type { AuthContext } from '../auth/auth.types'
import { hasPermission, type Permission } from '../auth/access-policy'
import { EVIDENCE_CONFIG as limits } from '../config/app.config'
import type { EvidenceListInput, EvidenceMetadata } from './evidence.schemas'
import type { EvidenceFile } from './evidence-file-validation'
import { EvidenceStorageService, type UploadAttempt } from './evidence-storage.service'
import { EvidenceScannerService } from './evidence-scanner.service'

// [F03 공개 결과]11필드만 반환한다. 내부 예약/키/지문은 외부 view에 없다.
export const evidenceView = (row: Evidence) => ({ id: row.id, companyId: row.companyId, kind: row.kind, title: row.title,
  occurredOn: row.occurredOn?.toISOString().slice(0, 10) ?? null, counterpartyId: row.counterpartyId,
  originalFileName: row.originalFileName, mediaType: row.mediaType, byteSize: row.byteSize, createdById: row.createdById, createdAt: row.createdAt.toISOString() })
export function uploadAttempts(row: EvidenceUpload): UploadAttempt[] {
  if (!Array.isArray(row.attempts)) throw new ServiceUnavailableException()
  return row.attempts.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string'
        || value.tmp !== `tmp/${row.companyId}/${row.id}/${value.id}` || value.original !== `originals/${row.companyId}/${row.id}/${value.id}`
        || !/^[a-f0-9-]{36}$/.test(value.id)) throw new ServiceUnavailableException()
    return { id: value.id, tmp: value.tmp as string, original: value.original as string }
  })
}

@Injectable()
export class EvidenceService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService, @Inject(EvidenceStorageService) private readonly storage: EvidenceStorageService,
    @Inject(EvidenceScannerService) private readonly scanner: EvidenceScannerService) {}
  now() { return new Date() }
  private async scope(tx: Prisma.TransactionClient | PrismaService, companyId: string, userId: string, permission: Permission, lock = false) {
    if (lock) {
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM company_memberships WHERE company_id=${companyId}::uuid AND user_id=${userId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT r.membership_id FROM company_member_roles r JOIN company_memberships m ON m.company_id=r.company_id AND m.id=r.membership_id
        WHERE m.company_id=${companyId}::uuid AND m.user_id=${userId}::uuid FOR UPDATE OF r`
    }
    const member = await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { roles: true } })
    if (!member?.active || !hasPermission(member.roles.map(row => row.role), permission)) throw new ForbiddenException()
  }
  private async current(tx: Prisma.TransactionClient, companyId: string, context: AuthContext, counterpartyId: string | null) {
    // [F03 E4] 기존 User→현재 세션→회사→소속/역할→거래처 순서. 외부 I/O와 TX를 분리한다.
    await tx.$queryRaw`SELECT id FROM users WHERE id=${context.user.id}::uuid FOR UPDATE`
    await this.sessions.assertCurrent(tx, context)
    await this.scope(tx, companyId, context.user.id, 'evidence.create', true)
    if (counterpartyId) {
      await tx.$queryRaw`SELECT id FROM counterparties WHERE company_id=${companyId}::uuid AND id=${counterpartyId}::uuid FOR UPDATE`
      const party = await tx.counterparty.findUnique({ where: { companyId_id: { companyId, id: counterpartyId } } })
      if (!party?.active) throw new UnprocessableEntityException()
    }
  }
  private async row(companyId: string, id: string) {
    const row = await this.db.evidence.findUnique({ where: { companyId_id: { companyId, id } } })
    if (!row) throw new NotFoundException(); return row
  }
  async list(companyId: string, userId: string, input: EvidenceListInput) {
    await this.scope(this.db, companyId, userId, 'evidence.read')
    const where: Prisma.EvidenceWhereInput = { companyId, ...(input.kind ? { kind: input.kind } : {}),
      ...(input.counterpartyId ? { counterpartyId: input.counterpartyId } : {}), ...(input.q ? { title: { contains: input.q, mode: 'insensitive' } } : {}) }
    if (input.cursor && !await this.db.evidence.findFirst({ where: { AND: [where, { id: input.cursor }] } })) throw new BadRequestException()
    const rows = await this.db.evidence.findMany({ where: { AND: [where, ...(input.cursor ? [{ id: { gt: input.cursor } }] : [])] }, orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(evidenceView)
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  async detail(companyId: string, userId: string, id: string) {
    await this.scope(this.db, companyId, userId, 'evidence.read'); return evidenceView(await this.row(companyId, id))
  }
  async status(companyId: string, userId: string, creationRequestId: string) {
    await this.scope(this.db, companyId, userId, 'evidence.create')
    const row = await this.db.evidenceUpload.findUnique({ where: { companyId_creationRequestId: { companyId, creationRequestId } }, include: { evidence: true } })
    if (!row || row.ownerId !== userId) throw new NotFoundException()
    return { creationRequestId, state: row.state, evidenceId: row.evidence?.id ?? null, retryable: row.state === 'FAILED', failureCode: row.failureCode }
  }
  async original(companyId: string, context: AuthContext, id: string) {
    await this.scope(this.db, companyId, context.user.id, 'evidence.read')
    const row = await this.row(companyId, id), bytes = await this.storage.read(row.originalKey, row.byteSize, row.sha256)
    // 원본 I/O가 끝난 시점에도 현재 세션/회사 권한을 확인한다. 회수 후 바이트 응답을 하지 않는다.
    await this.sessions.assertCurrent(this.db, context); await this.scope(this.db, companyId, context.user.id, 'evidence.read')
    return { row: evidenceView(row), bytes }
  }
  private async renew(upload: EvidenceUpload) {
    const now = this.now()
    const result = await this.db.evidenceUpload.updateMany({ where: { id: upload.id, state: 'PENDING', attemptId: upload.attemptId, leaseExpiresAt: { gt: now } },
      data: { leaseExpiresAt: new Date(now.getTime() + limits.leaseMs), lastActivityAt: now } })
    if (result.count !== 1) throw new ConflictException()
  }
  async register(companyId: string, context: AuthContext, input: EvidenceMetadata, file: EvidenceFile, requestId: string) {
    if (!this.storage.configured()) throw new ServiceUnavailableException()
    const data = { kind: input.kind, title: input.title, occurredOn: input.occurredOn, counterpartyId: input.counterpartyId }
    const inputHash = createHash('sha256').update(JSON.stringify({ ...data, name: file.name, mediaType: file.mediaType, sha256: file.sha256 })).digest('hex')
    let reserved: { upload: EvidenceUpload; replay?: Evidence }
    try {
      reserved = await this.db.$transaction(async tx => {
        await this.current(tx, companyId, context, null)
        let upload = await tx.evidenceUpload.findUnique({ where: { companyId_creationRequestId: { companyId, creationRequestId: input.creationRequestId } }, include: { evidence: true } })
        if (upload) {
          await tx.$queryRaw`SELECT id FROM evidence_uploads WHERE id=${upload.id}::uuid FOR UPDATE`
          upload = await tx.evidenceUpload.findUniqueOrThrow({ where: { id: upload.id }, include: { evidence: true } })
          if (upload.ownerId !== context.user.id || upload.inputHash !== inputHash) throw new ConflictException()
          if (upload.state === 'READY' && upload.evidence) return { upload, replay: upload.evidence }
          if (upload.state !== 'FAILED') throw new ConflictException()
        }
        // 재전송한 완료 자료는 비활성 거래처라도 재사용 가능하다. 새 완료 때만 현재 활성 상태를 검사한다.
        await this.current(tx, companyId, context, input.counterpartyId)
        const id = upload?.id ?? randomUUID(), attemptId = randomUUID(), now = this.now()
        const attempt = { id: attemptId, tmp: `tmp/${companyId}/${id}/${attemptId}`, original: `originals/${companyId}/${id}/${attemptId}` }
        const values = { attemptId, attempts: [...(upload ? uploadAttempts(upload) : []), attempt].map(item => ({ id: item.id, tmp: item.tmp, original: item.original })), state: 'PENDING' as const,
          failureCode: null, lastActivityAt: now, leaseExpiresAt: new Date(now.getTime() + limits.leaseMs) }
        const row = upload ? await tx.evidenceUpload.update({ where: { id }, data: values })
          : await tx.evidenceUpload.create({ data: { id, companyId, ownerId: context.user.id, creationRequestId: input.creationRequestId, inputHash, ...values } })
        return { upload: row }
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException()
      throw error
    }
    if (reserved.replay) return { evidence: evidenceView(reserved.replay), created: false }
    const upload = reserved.upload, attempt = uploadAttempts(upload).find(item => item.id === upload.attemptId)!
    let phase: 'SCAN' | 'STORAGE' | 'COMMIT' = 'SCAN'
    try {
      await this.renew(upload); await this.scanner.scan(file.bytes)
      phase = 'STORAGE'; await this.renew(upload); await this.storage.put(attempt.tmp, file.bytes, file.mediaType, file.sha256)
      await this.renew(upload); await this.storage.copy(attempt.tmp, attempt.original)
      await this.renew(upload); await this.storage.verify(attempt.original, file.bytes.length, file.sha256)
      // 사본 제거 실패는 완료 원본을 무효화하지 않는다. 예약에 남겨 cleanup이 tmp 키만 재시도한다.
      await this.renew(upload); try { await this.storage.remove(attempt.tmp) } catch { /* 추적 유지 */ }
      phase = 'COMMIT'
      const row = await this.db.$transaction(async tx => {
        await this.current(tx, companyId, context, input.counterpartyId)
        await tx.$queryRaw`SELECT id FROM evidence_uploads WHERE id=${upload.id}::uuid FOR UPDATE`
        const current = await tx.evidenceUpload.findUniqueOrThrow({ where: { id: upload.id } })
        if (current.state !== 'PENDING' || current.attemptId !== upload.attemptId || current.leaseExpiresAt <= this.now()) throw new ConflictException()
        const row = await tx.evidence.create({ data: { companyId, uploadId: upload.id, kind: input.kind, title: input.title,
          occurredOn: input.occurredOn ? new Date(input.occurredOn + 'T00:00:00Z') : null, counterpartyId: input.counterpartyId,
          originalFileName: file.name, mediaType: file.mediaType, byteSize: file.bytes.length, sha256: file.sha256, originalKey: attempt.original, createdById: context.user.id } })
        await tx.evidenceUpload.update({ where: { id: upload.id }, data: { state: 'READY', lastActivityAt: this.now() } })
        await this.audit.record(tx, { type: 'EVIDENCE_REGISTERED', actorId: context.user.id, companyId, requestId,
          change: { kind: 'evidence', evidenceId: row.id, evidenceKind: row.kind } })
        return row
      })
      return { evidence: evidenceView(row), created: true }
    } catch (error) {
      const failureCode = phase === 'SCAN' ? (error instanceof UnprocessableEntityException ? 'SCAN_REJECTED' : 'SCAN_UNAVAILABLE')
        : phase === 'STORAGE' ? 'STORAGE_UNAVAILABLE' : 'COMMIT_FAILED'
      // 후속 DB 장애여도 선행 예약은 남는다. 잠금/시도 일치 때만 실패로 바꾸고 원문 예외는 로그하지 않는다.
      try { await this.db.evidenceUpload.updateMany({ where: { id: upload.id, state: 'PENDING', attemptId: upload.attemptId }, data: { state: 'FAILED', failureCode } }) } catch { /* 다음 정리에서 예약 추적 */ }
      if (phase === 'COMMIT' && (error instanceof UnauthorizedException || error instanceof ForbiddenException || error instanceof ConflictException || error instanceof UnprocessableEntityException)) throw error
      if (error instanceof UnprocessableEntityException || error instanceof ConflictException) throw error
      throw new ServiceUnavailableException()
    }
  }
}
