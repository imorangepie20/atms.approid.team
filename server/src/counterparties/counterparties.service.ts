import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { AuditService } from '../audit/audit.service'
import { hasPermission, type Permission } from '../auth/access-policy'
import type { AuthContext } from '../auth/auth.types'
import { SessionService } from '../auth/session.service'
import type { Counterparty, Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import type { CounterpartyListInput, CreateCounterpartyInput, UpdateCounterpartyInput, DeactivateCounterpartyInput } from './counterparties.schemas'

// [F02 출력 경계] 내부 생성 요청/해시는 응답하지 않는다. 날짜는 기존 API와 같은 ISO 시각이다.
const view = (row: Counterparty) => ({ id: row.id, companyId: row.companyId, name: row.name, kind: row.kind,
  businessNumber: row.businessNumber, contactName: row.contactName, email: row.email, phone: row.phone, address: row.address, memo: row.memo,
  active: row.active, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })
const editable = ['name', 'kind', 'businessNumber', 'contactName', 'email', 'phone', 'address', 'memo'] as const
const normalized = (input: CreateCounterpartyInput) => ({ name: input.name, kind: input.kind, businessNumber: input.businessNumber ?? null,
  contactName: input.contactName ?? null, email: input.email ?? null, phone: input.phone ?? null, address: input.address ?? null, memo: input.memo ?? null })

@Injectable()
export class CounterpartiesService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService, @Inject(AuditService) private readonly audit: AuditService) {}

  // [F02 C4] 기존 User→세션→회사→소속/역할 순서다. guard 뒤의 권한 회수도 재검사한다.
  private async lockUser(tx: Prisma.TransactionClient, context: AuthContext) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${context.user.id}::uuid FOR UPDATE`
    await this.sessions.assertCurrent(tx, context)
  }
  private async scope(tx: Prisma.TransactionClient | PrismaService, companyId: string, userId: string, permission: Permission, lock = false) {
    if (lock) {
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM company_memberships WHERE company_id=${companyId}::uuid AND user_id=${userId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT r.membership_id FROM company_member_roles r JOIN company_memberships m ON m.id=r.membership_id AND m.company_id=r.company_id
        WHERE m.company_id=${companyId}::uuid AND m.user_id=${userId}::uuid FOR UPDATE OF r`
    }
    const member = await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { roles: true } })
    if (!member?.active || !hasPermission(member.roles.map(row => row.role), permission)) throw new ForbiddenException()
  }
  private async row(tx: Prisma.TransactionClient | PrismaService, companyId: string, id: string) {
    const row = await tx.counterparty.findUnique({ where: { companyId_id: { companyId, id } } })
    if (!row) throw new NotFoundException()
    return row
  }
  private conflict(error: unknown): never {
    // DB unique의 원문/다른 행 상세는 공통 HTTP 오류에 복사하지 않는다.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException()
    throw error
  }
  async list(companyId: string, userId: string, input: CounterpartyListInput) {
    await this.scope(this.db, companyId, userId, 'counterparties.read')
    const numberQuery = input.q?.replaceAll('-', '')
    const where: Prisma.CounterpartyWhereInput = { companyId,
      ...(input.active === 'all' ? {} : { active: input.active === 'active' }),
      ...(input.kind ? { kind: { in: input.kind === 'BOTH' ? ['BOTH'] : [input.kind, 'BOTH'] } } : {}),
      ...(input.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } },
        ...(numberQuery && /^[0-9]+$/.test(numberQuery) ? [{ businessNumber: { contains: numberQuery } }] : [])] } : {}),
    }
    // 커서도 현재 회사/필터에 속해야 한다. 다른 회사 ID를 페이지 경계로 쓰지 않는다.
    if (input.cursor && !await this.db.counterparty.findFirst({ where: { AND: [where, { id: input.cursor }] }, select: { id: true } })) throw new BadRequestException()
    const rows = await this.db.counterparty.findMany({ where: { AND: [where, ...(input.cursor ? [{ id: { gt: input.cursor } }] : [])] }, orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(view)
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  async detail(companyId: string, userId: string, id: string) {
    await this.scope(this.db, companyId, userId, 'counterparties.read')
    return view(await this.row(this.db, companyId, id))
  }
  async create(companyId: string, context: AuthContext, input: CreateCounterpartyInput, requestId: string) {
    const data = normalized(input), inputHash = createHash('sha256').update(JSON.stringify(data)).digest('hex')
    try {
      return await this.db.$transaction(async tx => {
        await this.lockUser(tx, context); await this.scope(tx, companyId, context.user.id, 'counterparties.write', true)
        const existing = await tx.counterparty.findUnique({ where: { companyId_creationRequestId: { companyId, creationRequestId: input.creationRequestId } } })
        if (existing) {
          if (existing.creationInputHash !== inputHash) throw new ConflictException()
          return { counterparty: view(existing), created: false }
        }
        const row = await tx.counterparty.create({ data: { ...data, companyId, creationRequestId: input.creationRequestId, creationInputHash: inputHash } })
        await this.record(tx, context, requestId, row, 'COUNTERPARTY_CREATED', [...editable], 0, false)
        return { counterparty: view(row), created: true }
      })
    } catch (error) { this.conflict(error) }
  }
  private async record(tx: Prisma.TransactionClient, context: AuthContext, requestId: string, row: Counterparty,
    eventType: 'COUNTERPARTY_CREATED' | 'COUNTERPARTY_UPDATED' | 'COUNTERPARTY_DEACTIVATED', changedFields: string[], versionBefore: number, activeBefore: boolean) {
    await this.audit.record(tx, { type: eventType, actorId: context.user.id, companyId: row.companyId, requestId,
      change: { kind: 'counterparty', eventType, counterpartyId: row.id, changedFields, versionBefore, versionAfter: row.version, activeBefore, activeAfter: row.active } })
  }
  async update(companyId: string, context: AuthContext, id: string, input: UpdateCounterpartyInput, requestId: string) {
    return this.change(companyId, context, id, input, requestId, false)
  }
  async deactivate(companyId: string, context: AuthContext, id: string, input: DeactivateCounterpartyInput, requestId: string) {
    return this.change(companyId, context, id, input, requestId, true)
  }
  private async change(companyId: string, context: AuthContext, id: string, input: UpdateCounterpartyInput | DeactivateCounterpartyInput, requestId: string, deactivate: boolean) {
    try {
      return await this.db.$transaction(async tx => {
        await this.lockUser(tx, context); await this.scope(tx, companyId, context.user.id, 'counterparties.write', true)
        const before = await this.row(tx, companyId, id)
        if (before.version !== input.version || (!deactivate && !before.active)) throw new ConflictException()
        const updates = input as UpdateCounterpartyInput
        const changedFields = deactivate ? (before.active ? ['active'] : []) : editable.filter(field => updates[field] !== undefined && updates[field] !== before[field])
        // stale 검사 뒤에만 no-op를 반환한다. INTEGER 최댓값도 실제 변경만 거부한다.
        if (!changedFields.length) return view(before)
        if (before.version === 2147483647) throw new ConflictException()
        const data: Prisma.CounterpartyUpdateInput = deactivate ? { active: false } : Object.fromEntries(changedFields.map(field => [field, updates[field as keyof UpdateCounterpartyInput]]))
        const after = await tx.counterparty.update({ where: { companyId_id: { companyId, id } }, data: { ...data, version: { increment: 1 } } })
        await this.record(tx, context, requestId, after, deactivate ? 'COUNTERPARTY_DEACTIVATED' : 'COUNTERPARTY_UPDATED', changedFields, before.version, before.active)
        return view(after)
      })
    } catch (error) { this.conflict(error) }
  }
}
