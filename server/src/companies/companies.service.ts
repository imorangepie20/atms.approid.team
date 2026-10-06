import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { AuditService } from '../audit/audit.service'
import { hasPermission, permissions, type Permission } from '../auth/access-policy'
import { SessionService } from '../auth/session.service'
import type { AuthContext } from '../auth/auth.types'
import { COMPANY_CONFIG } from '../config/app.config'
import type { Company, Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import { toDateOnly, type AddFiscalYearInput, type ChangeSelfApprovalInput, type CompanyListInput, type CreateCompanyInput, type RenameCompanyInput } from './companies.schemas'

// [F01 추가] DB 내부 생성자/해시는 항상 제외한다. 회계 기준은 지원 범위 표시이며 승인 규칙 버전은 F13에서 연결한다.
const companyView = (company: Company) => ({ id: company.id, name: company.name, currency: company.currency,
  accountingStandard: COMPANY_CONFIG.accountingStandard, allowSelfApproval: company.allowSelfApproval, version: company.version })
const fiscalView = (year: { id: string; startDate: Date; endDate: Date }) => ({ id: year.id,
  startDate: year.startDate.toISOString().slice(0, 10), endDate: year.endDate.toISOString().slice(0, 10) })

@Injectable()
export class CompaniesService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService, @Inject(AuditService) private readonly audit: AuditService) {}

  // 생성/수정의 잠금 순서: User → 현재 세션 → 회사 → 소속/역할. 로그인/복구와 같은 User 잠금을 사용한다.
  private async lockUser(tx: Prisma.TransactionClient, context: AuthContext, reauth = false) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${context.user.id}::uuid FOR UPDATE`
    return this.sessions.assertCurrent(tx, context, reauth)
  }
  private async scope(tx: Prisma.TransactionClient | PrismaService, companyId: string, userId: string, permission: Permission, lock = false) {
    if (lock) {
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM company_memberships WHERE company_id=${companyId}::uuid AND user_id=${userId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT r.membership_id FROM company_member_roles r JOIN company_memberships m ON m.id=r.membership_id
        AND m.company_id=r.company_id WHERE m.company_id=${companyId}::uuid AND m.user_id=${userId}::uuid FOR UPDATE OF r`
    }
    const member = await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { company: true, roles: true } })
    if (!member?.active || !hasPermission(member.roles.map(role => role.role), permission)) throw new ForbiddenException()
    return member
  }
  async list(userId: string, input: CompanyListInput) {
    // 1 SQL 관계 조건으로 활성 소속/조회 가능 역할을 적용한다. 관리자 전역 목록을 제공하지 않는다.
    const allowedRoles = ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as const
    const where: Prisma.CompanyWhereInput = { memberships: { some: { userId, active: true, roles: { some: { role: { in: [...allowedRoles] } } } } } }
    if (input.cursor && !await this.db.company.findFirst({ where: { AND: [where, { id: input.cursor }] }, select: { id: true } })) throw new BadRequestException()
    const rows = await this.db.company.findMany({ where: { AND: [where, ...(input.cursor ? [{ id: { gt: input.cursor } }] : [])] },
      orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(companyView)
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  async detail(companyId: string, userId: string) { return companyView((await this.scope(this.db, companyId, userId, 'company.read')).company) }
  async select(companyId: string, userId: string) {
    const member = await this.scope(this.db, companyId, userId, 'company.read'), roles = member.roles.map(row => row.role)
    // 선택은 조회 권한 확인의 결과만 돌려준다. 세션/사용자 전역에 companyId를 쓰지 않는다.
    return { company: companyView(member.company), roles, permissions: permissions.filter(permission => hasPermission(roles, permission)) }
  }
  async create(context: AuthContext, input: CreateCompanyInput, requestId: string) {
    // JSON 배열의 필드 순서 고정 + 스키마가 정규화한 입력만 해시. 이름 동일성/접근 권한으로 쓰지 않는다.
    const fingerprint = createHash('sha256').update(JSON.stringify([input.name, input.startDate, input.endDate])).digest('hex')
    return this.db.$transaction(async tx => {
      const current = await this.lockUser(tx, context, true)
      const existing = await tx.company.findUnique({ where: { createdById_creationRequestId: { createdById: current.user.id, creationRequestId: input.creationRequestId } } })
      if (existing) {
        // 현재 권한도 재검사한다. 요청 ID를 안다고 회수된 관리자 역할을 복원하지 않는다.
        await this.scope(tx, existing.id, current.user.id, 'company.manage', true)
        if (existing.creationInputHash !== fingerprint) throw new ConflictException()
        return { company: companyView(existing), context: current, created: false }
      }
      const company = await tx.company.create({ data: { name: input.name, createdById: current.user.id,
        creationRequestId: input.creationRequestId, creationInputHash: fingerprint,
        currency: COMPANY_CONFIG.currency, allowSelfApproval: false } })
      const member = await tx.companyMembership.create({ data: { companyId: company.id, userId: current.user.id } })
      await tx.companyMemberRole.create({ data: { companyId: company.id, membershipId: member.id, role: 'COMPANY_ADMIN' } })
      const year = await tx.fiscalYear.create({ data: { companyId: company.id, startDate: toDateOnly(input.startDate), endDate: toDateOnly(input.endDate) } })
      const rotated = await this.sessions.rotateForNewRole(tx, current)
      await this.audit.record(tx, { type: 'COMPANY_CREATED', requestId, actorId: current.user.id, companyId: company.id,
        change: { kind: 'created', name: company.name, fiscalYearId: year.id, startDate: input.startDate, endDate: input.endDate,
          version: company.version, otherSessionsRevoked: rotated.otherSessionsRevoked } })
      return { company: companyView(company), context: rotated.context, created: true }
    })
  }
  private checkVersion(company: Company, version: number) {
    if (company.version !== version) throw new ConflictException()
  }
  private async increment(tx: Prisma.TransactionClient, company: Company, data: Prisma.CompanyUpdateManyMutationInput = {}) {
    if (company.version === 2147483647) throw new ConflictException()
    const result = await tx.company.updateMany({ where: { id: company.id, version: company.version }, data: { ...data, version: { increment: 1 } } })
    if (result.count !== 1) throw new ConflictException()
    return tx.company.findUniqueOrThrow({ where: { id: company.id } })
  }
  async rename(context: AuthContext, companyId: string, input: RenameCompanyInput, requestId: string) {
    return this.db.$transaction(async tx => {
      const current = await this.lockUser(tx, context)
      const member = await this.scope(tx, companyId, current.user.id, 'company.manage', true)
      this.checkVersion(member.company, input.version)
      if (member.company.name === input.name) return companyView(member.company)
      const company = await this.increment(tx, member.company, { name: input.name })
      await this.audit.record(tx, { type: 'COMPANY_RENAMED', requestId, actorId: current.user.id, companyId,
        change: { kind: 'renamed', nameBefore: member.company.name, nameAfter: company.name, versionBefore: input.version, versionAfter: company.version } })
      return companyView(company)
    })
  }
  async fiscalYears(companyId: string, userId: string, input: CompanyListInput) {
    await this.scope(this.db, companyId, userId, 'company.read')
    const cursor = input.cursor ? await this.db.fiscalYear.findFirst({ where: { id: input.cursor, companyId } }) : null
    if (input.cursor && !cursor) throw new BadRequestException()
    const rows = await this.db.fiscalYear.findMany({ where: { companyId, ...(cursor ? { startDate: { gt: cursor.startDate } } : {}) },
      orderBy: { startDate: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(fiscalView)
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  // [F01 본인 승인 설정 추가] 입력은 Boolean과 회사의 현재 version이다. 역할 부여/전표 승인 실행은 하지 않는다.
  // 잠금 순서는 기존 User → 현재 세션 → 회사/소속/역할이다. guard를 통과했어도 현재 상태를 다시 검사한다.
  async changeSelfApproval(context: AuthContext, companyId: string, input: ChangeSelfApprovalInput, requestId: string) {
    return this.db.$transaction(async tx => {
      const current = await this.lockUser(tx, context, true) // 공통 설정의 최근 5분 재확인을 TX 안에서 다시 확인한다.
      const member = await this.scope(tx, companyId, current.user.id, 'company.manage', true)
      this.checkVersion(member.company, input.version)
      // 오래된 version은 같은 값이어도 위에서 거부한다. 최신 같은 값은 저장/증가/성공 감사 없이 반환한다.
      if (member.company.allowSelfApproval === input.allowSelfApproval) return companyView(member.company)
      // increment는 INTEGER 최대값/조건부 갱신 충돌을 409로 처리한다. 이름/기간 변경과 company.version을 공유한다.
      const company = await this.increment(tx, member.company, { allowSelfApproval: input.allowSelfApproval })
      await this.audit.record(tx, { type: 'COMPANY_SELF_APPROVAL_CHANGED', actorId: current.user.id, companyId, requestId,
        change: { kind: 'self-approval', allowSelfApprovalBefore: member.company.allowSelfApproval,
          allowSelfApprovalAfter: company.allowSelfApproval, versionBefore: input.version, versionAfter: company.version } })
      // 감사/DB 예외는 TX 전체를 rollback한다. 설정은 역할 변경이 아니므로 식별자/CSRF/다른 기기를 유지한다.
      return companyView(company)
    })
  }
  async addFiscalYear(context: AuthContext, companyId: string, input: AddFiscalYearInput, requestId: string) {
    return this.db.$transaction(async tx => {
      const current = await this.lockUser(tx, context)
      const member = await this.scope(tx, companyId, current.user.id, 'company.manage', true)
      this.checkVersion(member.company, input.version)
      const startDate = toDateOnly(input.startDate), endDate = toDateOnly(input.endDate)
      // 회사 행 잠금으로 이 API의 동시 추가를 직렬화한다. DB exclusion은 다른 쓰기 경로도 최종 차단한다.
      if (await tx.fiscalYear.findFirst({ where: { companyId, startDate: { lte: endDate }, endDate: { gte: startDate } } })) throw new ConflictException()
      const company = await this.increment(tx, member.company)
      const year = await tx.fiscalYear.create({ data: { companyId, startDate, endDate } })
      await this.audit.record(tx, { type: 'FISCAL_YEAR_CREATED', requestId, actorId: current.user.id, companyId,
        change: { kind: 'fiscal-year', fiscalYearId: year.id, startDate: input.startDate, endDate: input.endDate, versionBefore: input.version, versionAfter: company.version } })
      return { fiscalYear: fiscalView(year), company: companyView(company) }
    })
  }
}
