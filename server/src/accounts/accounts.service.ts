import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { AuditService } from '../audit/audit.service'
import { hasPermission, type Permission } from '../auth/access-policy'
import type { AuthContext } from '../auth/auth.types'
import { SessionService } from '../auth/session.service'
import type { CompanyAccount, Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import type { AccountListInput, CreateAccountInput, UpdateAccountInput, DeactivateAccountInput } from './accounts.schemas'

// [F04-01 A7 출력] 내부 회사/템플릿/생성 해시는 내보내지 않는다. 자격은 계정의 구조상 조건만 뜻한다.
const view = (row: CompanyAccount) => ({ id: row.id, code: row.code, name: row.name, category: row.category,
  normalBalance: row.normalBalance, active: row.active, version: row.version,
  canUseInJournal: row.active && row.category !== null && row.normalBalance !== null })
const normalizeCode = (code: string) => code.trim().toUpperCase()
const editable = ['name', 'category', 'normalBalance'] as const
type AccountEvent = 'ACCOUNT_CREATED' | 'ACCOUNT_UPDATED' | 'ACCOUNT_DEACTIVATED'

@Injectable()
export class AccountsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService, @Inject(AuditService) private readonly audit: AuditService) {}

  // [A2/A6 쓰기 경계] 기존 잠금 순서 User→세션→회사→소속/역할을 지킨다.
  // guard 뒤 권한 회수/로그아웃도 TX 안에서 재확인하며 회사 행 잠금으로 계정 쓰기 경합을 직렬화한다.
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
  private async beginWrite(tx: Prisma.TransactionClient, companyId: string, context: AuthContext) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${context.user.id}::uuid FOR UPDATE`
    await this.sessions.assertCurrent(tx, context)
    await this.scope(tx, companyId, context.user.id, 'accounts.manage', true)
    // [A4 기존 코드 보호] 기존 코드를 고치지 않고 ASCII 신규 입력과 같은 trim/대문자 규칙으로만 비교한다.
    // 충돌 회사는 계정/감사 쓰기 전에 안전한409로 중단한다. 기존 원문 번호는 응답 오류에 붙이지 않는다.
    const rows = await tx.companyAccount.findMany({ where: { companyId }, select: { code: true } })
    const reserved = new Set<string>()
    for (const row of rows) {
      const code = normalizeCode(row.code)
      if (reserved.has(code)) throw new ConflictException()
      reserved.add(code)
    }
    return reserved
  }
  private async row(tx: Prisma.TransactionClient | PrismaService, companyId: string, id: string) {
    const row = await tx.companyAccount.findUnique({ where: { companyId_id: { companyId, id } } })
    if (!row) throw new NotFoundException()
    return row
  }
  private conflict(error: unknown): never {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException()
    throw error
  }
  async list(companyId: string, userId: string, input: AccountListInput) {
    await this.scope(this.db, companyId, userId, 'accounts.read')
    const where: Prisma.CompanyAccountWhereInput = { companyId,
      ...(input.active === 'all' ? {} : { active: input.active === 'active' }), ...(input.category ? { category: input.category } : {}),
      ...(input.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { code: { contains: input.q, mode: 'insensitive' } }] } : {}) }
    // 다른 회사/현재 필터 밖 커서는400. UUID 오름차순은 명시한 cursor 계약이며 코드 정렬과 구분한다.
    if (input.cursor && !await this.db.companyAccount.findFirst({ where: { AND: [where, { id: input.cursor }] }, select: { id: true } })) throw new BadRequestException()
    const rows = await this.db.companyAccount.findMany({ where: { AND: [where, ...(input.cursor ? [{ id: { gt: input.cursor } }] : [])] }, orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(view)
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  async detail(companyId: string, userId: string, id: string) {
    await this.scope(this.db, companyId, userId, 'accounts.read')
    return view(await this.row(this.db, companyId, id))
  }
  async create(companyId: string, context: AuthContext, input: CreateAccountInput, requestId: string) {
    const data = { code: input.code, name: input.name, category: input.category, normalBalance: input.normalBalance }
    const inputHash = createHash('sha256').update(JSON.stringify(data)).digest('hex')
    try {
      return await this.db.$transaction(async tx => {
        const reserved = await this.beginWrite(tx, companyId, context)
        const existing = await tx.companyAccount.findUnique({ where: { companyId_creationRequestId: { companyId, creationRequestId: input.creationRequestId } } })
        if (existing) {
          if (existing.creationInputHash !== inputHash) throw new ConflictException()
          return view(existing) // 최초 입력 해시로 판별하되 이름/중지 상태는 현재 view를 반환한다.
        }
        if (reserved.has(data.code)) throw new ConflictException()
        const row = await tx.companyAccount.create({ data: { ...data, companyId, creationRequestId: input.creationRequestId, creationInputHash: inputHash } })
        await this.record(tx, context, requestId, row, 'ACCOUNT_CREATED', ['code', ...editable], 0, false)
        return view(row)
      })
    } catch (error) { this.conflict(error) }
  }
  private async record(tx: Prisma.TransactionClient, context: AuthContext, requestId: string, row: CompanyAccount,
    eventType: AccountEvent, changedFields: string[], versionBefore: number, activeBefore: boolean) {
    await this.audit.record(tx, { type: eventType, actorId: context.user.id, companyId: row.companyId, requestId,
      change: { kind: 'account', eventType, accountId: row.id, changedFields, versionBefore, versionAfter: row.version, activeBefore, activeAfter: row.active } })
  }
  async update(companyId: string, context: AuthContext, id: string, input: UpdateAccountInput, requestId: string) {
    return this.change(companyId, context, id, input, requestId, false)
  }
  async deactivate(companyId: string, context: AuthContext, id: string, input: DeactivateAccountInput, requestId: string) {
    return this.change(companyId, context, id, input, requestId, true)
  }
  private async change(companyId: string, context: AuthContext, id: string, input: UpdateAccountInput | DeactivateAccountInput, requestId: string, deactivate: boolean) {
    try {
      return await this.db.$transaction(async tx => {
        await this.beginWrite(tx, companyId, context)
        const before = await this.row(tx, companyId, id), updates = input as UpdateAccountInput
        if (before.version !== input.version || (!deactivate && !before.active)) throw new ConflictException()
        // [A4] 분류는 미분류의 최초 설정만 허용한다. 기존 값과 같아도 재분류 입력 자체를 거부한다.
        if (!deactivate && updates.category !== undefined && (before.category !== null || before.normalBalance !== null)) throw new ConflictException()
        const changedFields = deactivate ? (before.active ? ['active'] : []) : editable.filter(field => updates[field] !== undefined && updates[field] !== before[field])
        if (!changedFields.length) return view(before)
        if (before.version === 2147483647) throw new ConflictException()
        const data: Prisma.CompanyAccountUpdateInput = deactivate ? { active: false } : Object.fromEntries(changedFields.map(field => [field, updates[field as keyof UpdateAccountInput]]))
        const after = await tx.companyAccount.update({ where: { companyId_id: { companyId, id } }, data: { ...data, version: { increment: 1 } } })
        await this.record(tx, context, requestId, after, deactivate ? 'ACCOUNT_DEACTIVATED' : 'ACCOUNT_UPDATED', changedFields, before.version, before.active)
        return view(after)
      })
    } catch (error) { this.conflict(error) }
  }
}
