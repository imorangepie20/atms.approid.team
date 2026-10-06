import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { AuditService, type AuditType } from '../audit/audit.service'
import { hasPermission } from '../auth/access-policy'
import type { AuthContext } from '../auth/auth.types'
import { LoginRateLimitService } from '../auth/login-rate-limit.service'
import { SessionService, hashToken } from '../auth/session.service'
import { COMPANY_ACCESS_POLICY } from '../config/app.config'
import type { CompanyAccessRequest, CompanyInvitation, CompanyRole, Prisma } from '../generated/prisma/client'
import { MailService } from '../mail/mail.service'
import { invitationMessage } from '../mail/mail.templates'
import { PrismaService } from '../prisma.service'
import type { CompanyListInput } from './companies.schemas'
import type { InvitationCreateInput } from './company-access-flows.schemas'

type Tx = Prisma.TransactionClient
type Flow = CompanyInvitation | CompanyAccessRequest
const requesterSelect = { id: true, email: true, emailVerifiedAt: true, disabledAt: true } as const
const entityOf = (row: Flow) => 'emailNormalized' in row ? 'invitation' as const : 'request' as const

@Injectable()
export class CompanyAccessFlowsService implements OnModuleDestroy {
  private readonly logger = new Logger(CompanyAccessFlowsService.name)
  private readonly pending = new Set<Promise<void>>()
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService, @Inject(LoginRateLimitService) private readonly rate: LoginRateLimitService,
    @Inject(MailService) private readonly mail: MailService) {}

  // [F01 응답 경계] 명시한 필드만 출력한다. GET의 만료 표시는 계산값이고 저장 상태/version은 그대로다.
  private state(row: Flow) { return row.status === 'PENDING' && row.expiresAt <= this.sessions.now() ? 'EXPIRED' : row.status }
  private invitationView(row: CompanyInvitation) {
    return { id: row.id, companyId: row.companyId, email: row.email, roles: [...row.roles].sort(), issuerId: row.issuerId,
      status: this.state(row), version: row.version, expiresAt: row.expiresAt.toISOString() }
  }
  private requestView(row: CompanyAccessRequest) {
    return { id: row.id, companyId: row.companyId, requesterId: row.requesterId, status: this.state(row), version: row.version,
      expiresAt: row.expiresAt.toISOString() }
  }
  private async administrator(tx: Tx | PrismaService, companyId: string, userId: string) {
    const member = await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { roles: true, user: true } })
    if (!member?.active || member.user.disabledAt || !member.user.emailVerifiedAt
        || !hasPermission(member.roles.map(row => row.role), 'company.members.manage')) throw new ForbiddenException()
  }
  private async eligible(tx: Tx, id: string) {
    const user = await tx.user.findUnique({ where: { id }, select: { ...requesterSelect, emailNormalized: true } })
    if (!user || user.disabledAt || !user.emailVerifiedAt) throw new ConflictException()
    return user
  }
  private async noMembership(tx: Tx, companyId: string, userId: string) {
    if (await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } } })) throw new ConflictException()
  }
  private async invitation(tx: Tx | PrismaService, companyId: string, id: string) {
    const row = await tx.companyInvitation.findFirst({ where: { id, companyId } })
    if (!row) throw new NotFoundException()
    return row
  }
  private async accessRequest(tx: Tx | PrismaService, id: string, companyId?: string, requesterId?: string) {
    const row = await tx.companyAccessRequest.findFirst({ where: { id, ...(companyId ? { companyId } : {}), ...(requesterId ? { requesterId } : {}) } })
    if (!row) throw new NotFoundException()
    return row
  }
  // [F01 잠금 순서] 없던 이메일 계정/바뀐 발행자를 회사 잠금 뒤 뒤늦게 잡지 않는다. 각 메서드가 수집한 ID를 재검사한다.
  private transact<T>(context: AuthContext, companyId: string, users: string[], reauth: boolean,
    operation: (tx: Tx, current: AuthContext) => Promise<T>): Promise<T> {
    return this.db.$transaction(async tx => {
      for (const id of [...new Set([context.user.id, ...users])].sort()) await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`
      const current = await this.sessions.assertCurrent(tx, context, reauth)
      const company = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`
      if (!company.length) throw new NotFoundException()
      return operation(tx, current)
    })
  }
  private validPending(row: Flow, version: number) {
    if (row.version !== version || row.version === 2147483647 || row.status !== 'PENDING' || row.expiresAt <= this.sessions.now()) throw new ConflictException()
  }
  private async record(tx: Tx, type: AuditType, actorId: string, requestId: string, row: Flow, before: Flow | null,
    targetUserId: string | null, revokedSessions = 0) {
    const roles = entityOf(row) === 'invitation' ? (row as CompanyInvitation).roles : ['EXTERNAL_TAX']
    await this.audit.record(tx, { type, actorId, companyId: row.companyId, requestId, change: {
      kind: 'access-flow', eventType: type, entity: entityOf(row), flowId: row.id, targetUserId,
      rolesBefore: before ? [...roles] : [], rolesAfter: [...roles], statusBefore: before?.status ?? null, statusAfter: row.status,
      versionBefore: before?.version ?? 0, versionAfter: row.version, expiresAt: row.expiresAt.toISOString(), revokedSessions,
    } })
  }
  // [F01 만료 정리] 신규 접수의 회사 잠금 아래에만 저장한다. 실패한 수락/GET은 만료 상태를 쓰지 않는다.
  private async expire(tx: Tx, companyId: string, email: string, userId: string | null, actorId: string, requestId: string) {
    const now = this.sessions.now()
    const invites = await tx.companyInvitation.findMany({ where: { companyId, emailNormalized: email, status: 'PENDING', expiresAt: { lte: now } } })
    for (const before of invites) {
      if (before.version === 2147483647) throw new ConflictException()
      const row = await tx.companyInvitation.update({ where: { id: before.id }, data: { status: 'EXPIRED', processedAt: now,
        tokenInvalidatedAt: now, updatedAt: now, version: { increment: 1 } } })
      await this.record(tx, 'COMPANY_ACCESS_EXPIRED', actorId, requestId, row, before, userId)
    }
    if (userId) {
      const requests = await tx.companyAccessRequest.findMany({ where: { companyId, requesterId: userId, status: 'PENDING', expiresAt: { lte: now } } })
      for (const before of requests) {
        if (before.version === 2147483647) throw new ConflictException()
        const row = await tx.companyAccessRequest.update({ where: { id: before.id }, data: { status: 'EXPIRED', processedAt: now,
          updatedAt: now, version: { increment: 1 } } })
        await this.record(tx, 'COMPANY_ACCESS_EXPIRED', actorId, requestId, row, before, userId)
      }
    }
  }
  // [F01 발송] 원문은 메모리/메일만. DB commit 후 전송하며 예전 전송 실패는 tokenHash 조건으로 새 링크와 구분한다.
  private dispatch(row: CompanyInvitation, raw: string, actorId: string, requestId: string) {
    const task = (async () => {
      if (await this.mail.send(invitationMessage(row.email, this.sessions.config.origin, raw))) return
      await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM companies WHERE id=${row.companyId}::uuid FOR UPDATE`
        const before = await tx.companyInvitation.findUnique({ where: { id: row.id } })
        if (!before || before.status !== 'PENDING' || before.tokenHash !== hashToken(raw) || before.tokenInvalidatedAt) return
        const after = await tx.companyInvitation.update({ where: { id: row.id }, data: { tokenInvalidatedAt: this.sessions.now(), updatedAt: this.sessions.now() } })
        await this.record(tx, 'INVITATION_MAIL_FAILED', actorId, requestId, after, before, null)
      })
    })().catch(() => { this.logger.error('Company invitation mail processing failed.') })
    this.pending.add(task); void task.then(() => this.pending.delete(task))
  }
  async flushMail() { await Promise.all([...this.pending]) }
  onModuleDestroy() { return this.flushMail() }
  private async mailLimit(email: string, ip: string) {
    await this.rate.reserveEmailIp(ip, this.sessions.now())
    await this.rate.reserveEmailAccount(email, this.sessions.now())
  }
  // [F01 요청 제한] 발송과 별도 해시 버킷. 예약은 업무 TX 밖에서 commit하여 충돌/실패로 한도를 되살리지 않는다.
  private async requestLimit(kind: 'user' | 'ip', value: string, maximum: number) {
    const id = createHash('sha256').update(`company-request:${kind}:${value}`).digest('hex'), now = this.sessions.now()
    const allowed = await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`
      const row = await tx.loginRateBucket.upsert({ where: { id }, create: { id, attempts: [] }, update: {} })
      const attempts = row.attempts.filter(at => at.getTime() > now.getTime() - COMPANY_ACCESS_POLICY.requestWindowMs)
      if (attempts.length >= maximum) return false
      await tx.loginRateBucket.update({ where: { id }, data: { attempts: [...attempts, now] } }); return true
    })
    if (!allowed) throw new HttpException('Company request rate limit', 429)
  }
  async listInvitations(companyId: string, actorId: string, input: CompanyListInput) {
    await this.administrator(this.db, companyId, actorId)
    if (input.cursor && !await this.db.companyInvitation.findFirst({ where: { id: input.cursor, companyId } })) throw new BadRequestException()
    const rows = await this.db.companyInvitation.findMany({ where: { companyId, ...(input.cursor ? { id: { gt: input.cursor } } : {}) }, orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(row => this.invitationView(row))
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  async listRequests(actorId: string, input: CompanyListInput, companyId?: string) {
    if (companyId) await this.administrator(this.db, companyId, actorId)
    const scope = companyId ? { companyId } : { requesterId: actorId }
    if (input.cursor && !await this.db.companyAccessRequest.findFirst({ where: { id: input.cursor, ...scope } })) throw new BadRequestException()
    const rows = await this.db.companyAccessRequest.findMany({ where: { ...scope, ...(input.cursor ? { id: { gt: input.cursor } } : {}) },
      include: { requester: { select: requesterSelect } }, orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(row => ({ ...this.requestView(row), ...(companyId ? {
      requester: { id: row.requester.id, email: row.requester.email, emailVerified: !!row.requester.emailVerifiedAt, disabled: !!row.requester.disabledAt },
    } : {}) }))
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  async createInvitation(context: AuthContext, companyId: string, input: InvitationCreateInput, ip: string, requestId: string) {
    const email = input.email.toLowerCase(), preview = await this.db.user.findUnique({ where: { emailNormalized: email }, select: { id: true } })
    await this.mailLimit(email, ip)
    const issued = await this.transact(context, companyId, preview ? [preview.id] : [], true, async (tx, current) => {
      await this.administrator(tx, companyId, current.user.id)
      const target = await tx.user.findUnique({ where: { emailNormalized: email }, select: { id: true } })
      if ((target?.id ?? null) !== (preview?.id ?? null)) throw new ConflictException()
      if (target) await this.noMembership(tx, companyId, target.id)
      await this.expire(tx, companyId, email, target?.id ?? null, current.user.id, requestId)
      if (target && await tx.companyAccessRequest.findFirst({ where: { companyId, requesterId: target.id, status: 'PENDING' } })) throw new ConflictException()
      const before = await tx.companyInvitation.findFirst({ where: { companyId, emailNormalized: email, status: 'PENDING' } })
      if (before) {
        if ([...before.roles].sort().join(',') !== [...input.roles].sort().join(',')) throw new ConflictException()
        return { row: before, raw: null }
      }
      const now = this.sessions.now(), raw = randomBytes(32).toString('hex')
      const row = await tx.companyInvitation.create({ data: { companyId, email: input.email, emailNormalized: email, roles: input.roles,
        issuerId: current.user.id, tokenHash: hashToken(raw), createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + COMPANY_ACCESS_POLICY.invitationMs) } })
      await this.record(tx, 'INVITATION_CREATED', current.user.id, requestId, row, null, target?.id ?? null)
      return { row, raw }
    })
    if (issued.raw) this.dispatch(issued.row, issued.raw, context.user.id, requestId)
    return { invitation: this.invitationView(issued.row), accepted: true }
  }
  async changeInvitation(context: AuthContext, companyId: string, id: string, version: number, resend: boolean, ip: string, requestId: string) {
    const preview = await this.invitation(this.db, companyId, id)
    if (resend) await this.mailLimit(preview.emailNormalized, ip)
    const result = await this.transact(context, companyId, [], true, async (tx, current) => {
      await this.administrator(tx, companyId, current.user.id)
      await tx.$queryRaw`SELECT id FROM company_invitations WHERE id=${id}::uuid AND company_id=${companyId}::uuid FOR UPDATE`
      const before = await this.invitation(tx, companyId, id); this.validPending(before, version)
      const now = this.sessions.now(), raw = resend ? randomBytes(32).toString('hex') : null
      const row = await tx.companyInvitation.update({ where: { id }, data: { version: { increment: 1 }, updatedAt: now,
        ...(raw ? { issuerId: current.user.id, tokenHash: hashToken(raw), tokenInvalidatedAt: null, expiresAt: new Date(now.getTime() + COMPANY_ACCESS_POLICY.invitationMs) }
          : { status: 'CANCELLED', processedAt: now, tokenInvalidatedAt: now }) } })
      await this.record(tx, resend ? 'INVITATION_RESENT' : 'INVITATION_CANCELLED', current.user.id, requestId, row, before, null)
      return { row, raw }
    })
    if (result.raw) this.dispatch(result.row, result.raw, context.user.id, requestId)
    return { invitation: this.invitationView(result.row), accepted: true }
  }
  async acceptInvitation(context: AuthContext, token: string, requestId: string) {
    const preview = await this.db.companyInvitation.findUnique({ where: { tokenHash: hashToken(token) } })
    if (!preview) throw new BadRequestException()
    return this.transact(context, preview.companyId, [preview.issuerId], true, async (tx, current) => {
      await tx.$queryRaw`SELECT id FROM company_invitations WHERE id=${preview.id}::uuid FOR UPDATE`
      const before = await tx.companyInvitation.findUnique({ where: { id: preview.id } }), now = this.sessions.now()
      const user = await this.eligible(tx, current.user.id)
      if (!before || before.tokenHash !== hashToken(token) || before.tokenInvalidatedAt || before.status !== 'PENDING'
          || before.expiresAt <= now || before.emailNormalized !== user.emailNormalized) throw new BadRequestException()
      if (before.issuerId !== preview.issuerId || before.version === 2147483647) throw new ConflictException()
      try { await this.administrator(tx, before.companyId, before.issuerId) } catch (error) {
        if (error instanceof ForbiddenException) throw new ConflictException(); throw error
      }
      await this.noMembership(tx, before.companyId, user.id)
      if (await tx.companyAccessRequest.findFirst({ where: { companyId: before.companyId, requesterId: user.id, status: 'PENDING', expiresAt: { gt: now } } })) throw new ConflictException()
      // [F01 근본 원인 수정] 중첩 create의 회사/소속 키는 부모 소속 관계에서 Prisma가 전달한다.
      // 생성 타입은 role만 허용한다. 회사 키를 다시 보내지 않아도 기존 복합 FK가 회사 분리를 보장한다.
      const member = await tx.companyMembership.create({ data: { companyId: before.companyId, userId: user.id,
        roles: { create: before.roles.map(role => ({ role })) } } })
      const row = await tx.companyInvitation.update({ where: { id: before.id }, data: { status: 'ACCEPTED', processedAt: now,
        tokenInvalidatedAt: now, updatedAt: now, version: { increment: 1 } } })
      const rotated = await this.sessions.rotateForNewRole(tx, current)
      await this.record(tx, 'INVITATION_ACCEPTED', current.user.id, requestId, row, before, user.id, rotated.otherSessionsRevoked)
      return { invitation: this.invitationView(row), member: { id: member.id, companyId: member.companyId, active: member.active, version: member.version, roles: [...before.roles].sort() }, context: rotated.context }
    })
  }
  async createRequest(context: AuthContext, companyId: string, ip: string, requestId: string) {
    await this.requestLimit('ip', ip, COMPANY_ACCESS_POLICY.requestIpRequests)
    await this.requestLimit('user', context.user.id, COMPANY_ACCESS_POLICY.requestUserRequests)
    return this.transact(context, companyId, [], false, async (tx, current) => {
      const user = await this.eligible(tx, current.user.id); await this.noMembership(tx, companyId, user.id)
      await this.expire(tx, companyId, user.emailNormalized, user.id, user.id, requestId)
      if (await tx.companyInvitation.findFirst({ where: { companyId, emailNormalized: user.emailNormalized, status: 'PENDING' } })) throw new ConflictException()
      const before = await tx.companyAccessRequest.findFirst({ where: { companyId, requesterId: user.id, status: 'PENDING' } })
      if (before) return { accessRequest: this.requestView(before) }
      const now = this.sessions.now()
      const row = await tx.companyAccessRequest.create({ data: { companyId, requesterId: user.id, createdAt: now, updatedAt: now,
        expiresAt: new Date(now.getTime() + COMPANY_ACCESS_POLICY.requestMs) } })
      await this.record(tx, 'ACCESS_REQUEST_CREATED', user.id, requestId, row, null, user.id)
      return { accessRequest: this.requestView(row) }
    })
  }
  async changeRequest(context: AuthContext, id: string, version: number, action: 'cancel' | 'approve' | 'reject', requestId: string, companyId?: string) {
    const preview = await this.accessRequest(this.db, id, companyId, action === 'cancel' ? context.user.id : undefined)
    return this.transact(context, preview.companyId, [preview.requesterId], action !== 'cancel', async (tx, current) => {
      if (action !== 'cancel') await this.administrator(tx, preview.companyId, current.user.id)
      await tx.$queryRaw`SELECT id FROM company_access_requests WHERE id=${id}::uuid AND company_id=${preview.companyId}::uuid FOR UPDATE`
      const before = await this.accessRequest(tx, id, companyId, action === 'cancel' ? current.user.id : undefined)
      if (before.requesterId !== preview.requesterId || before.companyId !== preview.companyId) throw new ConflictException()
      this.validPending(before, version)
      const now = this.sessions.now(); let revokedSessions = 0
      if (action === 'approve') {
        const user = await this.eligible(tx, before.requesterId); await this.noMembership(tx, before.companyId, user.id)
        if (await tx.companyInvitation.findFirst({ where: { companyId: before.companyId, emailNormalized: user.emailNormalized, status: 'PENDING', expiresAt: { gt: now } } })) throw new ConflictException()
        // [F01 근본 원인 수정] 부모가 회사/소속 키를 제공한다. 승인에서 직접 지정하는 값은 확정한 역할뿐이다.
        await tx.companyMembership.create({ data: { companyId: before.companyId, userId: user.id,
          roles: { create: { role: 'EXTERNAL_TAX' } } } })
        revokedSessions = await this.sessions.revokeForUser(tx, user.id)
      }
      const status = action === 'cancel' ? 'CANCELLED' : action === 'approve' ? 'APPROVED' : 'REJECTED'
      const row = await tx.companyAccessRequest.update({ where: { id }, data: { status, version: { increment: 1 }, processedAt: now,
        updatedAt: now, processorId: action === 'cancel' ? null : current.user.id } })
      const type = action === 'cancel' ? 'ACCESS_REQUEST_CANCELLED' : action === 'approve' ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_REJECTED'
      await this.record(tx, type, current.user.id, requestId, row, before, before.requesterId, revokedSessions)
      return { accessRequest: this.requestView(row) }
    })
  }
}
