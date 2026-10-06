import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { hasPermission } from '../auth/access-policy'
import type { AuthContext } from '../auth/auth.types'
import { SessionService } from '../auth/session.service'
import type { CompanyRole, Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'
import type { CompanyListInput } from './companies.schemas'
import type { ChangeMemberRolesInput, DeactivateMemberInput } from './company-members.schemas'

// [F01 추가] DB 조회 자체에도 최소 사용자 필드를 지정한다. 계정 해시/세션/다른 회사 소속은 읽어서 직렬화하지 않는다.
const includeMember = { roles: { select: { role: true } }, user: { select: { id: true, email: true, emailVerifiedAt: true, disabledAt: true } } } as const
type Member = Prisma.CompanyMembershipGetPayload<{ include: typeof includeMember }>
const rolesOf = (member: Member): CompanyRole[] => member.roles.map(row => row.role).sort()
const memberView = (member: Member) => ({ id: member.id, companyId: member.companyId, active: member.active, version: member.version,
  roles: rolesOf(member), user: { id: member.user.id, email: member.user.email, emailVerified: !!member.user.emailVerifiedAt, disabled: !!member.user.disabledAt } })
const eligible = (member: Member) => member.active && !member.user.disabledAt && !!member.user.emailVerifiedAt

@Injectable()
export class CompanyMembersService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService) {}
  private async administrator(tx: Prisma.TransactionClient | PrismaService, companyId: string, userId: string) {
    const member = await tx.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: includeMember })
    if (!member || !eligible(member) || !hasPermission(rolesOf(member), 'company.members.manage')) throw new ForbiddenException()
    return member
  }
  private async target(tx: Prisma.TransactionClient | PrismaService, companyId: string, membershipId: string) {
    const member = await tx.companyMembership.findFirst({ where: { id: membershipId, companyId }, include: includeMember })
    // 다른 회사 소속 ID와 없는 ID를 같은 404로 처리한다. 회사 밖 사용자/세션을 수정하지 않는다.
    if (!member) throw new NotFoundException()
    return member
  }
  async list(companyId: string, actorId: string, input: CompanyListInput) {
    await this.administrator(this.db, companyId, actorId)
    if (input.cursor && !await this.db.companyMembership.findFirst({ where: { id: input.cursor, companyId }, select: { id: true } })) throw new BadRequestException()
    const rows = await this.db.companyMembership.findMany({ where: { companyId, ...(input.cursor ? { id: { gt: input.cursor } } : {}) },
      include: includeMember, orderBy: { id: 'asc' }, take: input.limit + 1 })
    const items = rows.slice(0, input.limit).map(memberView)
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
  }
  async detail(companyId: string, actorId: string, membershipId: string) {
    await this.administrator(this.db, companyId, actorId)
    return memberView(await this.target(this.db, companyId, membershipId))
  }
  private candidates(tx: Prisma.TransactionClient | PrismaService, companyId: string) {
    // 중지/미확인 계정도 후보 잠금에 포함한다. 실제 관리자 수는 잠금 후 현재 상태로 계산한다.
    return tx.companyMembership.findMany({ where: { companyId, roles: { some: { role: 'COMPANY_ADMIN' } } }, select: { userId: true } })
  }
  private async change(context: AuthContext, companyId: string, membershipId: string, version: number,
    requestedRoles: CompanyRole[] | null, requestId: string) {
    // [F01 잠금 순서] SQL의 여러 User 행은 항상 UUID 순서로 잡는다. 먼저 회사부터 잠그면 로그인/회사 생성과 교착할 수 있다.
    // 후보 조회는 잠글 ID를 수집하는 용도다. 권한/대상 상태 판단은 트랜잭션의 잠금 이후 다시 한다.
    const preview = await this.target(this.db, companyId, membershipId)
    const candidates = await this.candidates(this.db, companyId)
    const users = [...new Set([context.user.id, preview.userId, ...candidates.map(row => row.userId)])].sort()
    return this.db.$transaction(async tx => {
      for (const id of users) await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`
      const current = await this.sessions.assertCurrent(tx, context, true)
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId}::uuid FOR UPDATE`
      // 중간에 새 관리자가 생겼으면 이미 정한 User 잠금 순서를 바꾸지 않는다. 부분 변경 없이 409로 재조회하게 한다.
      const fresh = await this.candidates(tx, companyId)
      if (fresh.some(row => !users.includes(row.userId))) throw new ConflictException()
      await tx.$queryRaw`SELECT id FROM company_memberships WHERE company_id=${companyId}::uuid
        AND (user_id=${current.user.id}::uuid OR id=${membershipId}::uuid) ORDER BY id FOR UPDATE`
      await tx.$queryRaw`SELECT r.membership_id FROM company_member_roles r JOIN company_memberships m ON m.id=r.membership_id AND m.company_id=r.company_id
        WHERE m.company_id=${companyId}::uuid AND (m.user_id=${current.user.id}::uuid OR m.id=${membershipId}::uuid) ORDER BY r.membership_id,r.role FOR UPDATE OF r`
      await this.administrator(tx, companyId, current.user.id)
      const before = await this.target(tx, companyId, membershipId)
      // 소속의 사용자 ID는 이 API에서 불변이다. 다른 쓰기 경로가 바꿨더라도 잠그지 않은 사용자로 진행하지 않는다.
      if (before.userId !== preview.userId || before.version !== version) throw new ConflictException()
      if (requestedRoles && !eligible(before)) throw new ConflictException()
      const rolesBefore = rolesOf(before), rolesAfter = requestedRoles ? [...requestedRoles].sort() : rolesBefore
      const same = requestedRoles ? rolesBefore.join(',') === rolesAfter.join(',') : !before.active
      if (same) return { member: memberView(before), context: null, sessionRevoked: false }
      if (before.version === 2147483647) throw new ConflictException()
      const updated = await tx.companyMembership.updateMany({ where: { id: before.id, companyId, version },
        data: { version: { increment: 1 }, ...(requestedRoles ? {} : { active: false }) } })
      if (updated.count !== 1) throw new ConflictException()
      if (requestedRoles) {
        await tx.companyMemberRole.deleteMany({ where: { companyId, membershipId } })
        await tx.companyMemberRole.createMany({ data: rolesAfter.map(role => ({ companyId, membershipId, role })) })
      }
      // 회사 행 잠금 아래에서 실제 변경 후 관리자 수를 센다. 0이면 역할/버전 변경까지 rollback한다.
      const admins = await tx.companyMembership.count({ where: { companyId, active: true,
        roles: { some: { role: 'COMPANY_ADMIN' } }, user: { disabledAt: null, emailVerifiedAt: { not: null } } } })
      if (admins === 0) throw new ConflictException()
      let rotated: AuthContext | null = null, revokedSessions: number
      const self = before.userId === current.user.id
      if (requestedRoles && self) {
        const rotation = await this.sessions.rotateForNewRole(tx, current)
        rotated = rotation.context; revokedSessions = rotation.otherSessionsRevoked
      } else revokedSessions = await this.sessions.revokeForUser(tx, before.userId)
      const after = await this.target(tx, companyId, membershipId)
      await this.audit.record(tx, { type: requestedRoles ? 'MEMBER_ROLES_CHANGED' : 'MEMBERSHIP_DEACTIVATED', requestId,
        actorId: current.user.id, companyId, change: { kind: requestedRoles ? 'member-roles' : 'member-deactivated',
          membershipId, targetUserId: before.userId, rolesBefore, rolesAfter, activeBefore: before.active, activeAfter: after.active,
          versionBefore: before.version, versionAfter: after.version, revokedSessions } })
      return { member: memberView(after), context: rotated, sessionRevoked: !requestedRoles && self }
    })
  }
  changeRoles(context: AuthContext, companyId: string, membershipId: string, input: ChangeMemberRolesInput, requestId: string) {
    return this.change(context, companyId, membershipId, input.version, input.roles, requestId)
  }
  async deactivate(context: AuthContext, companyId: string, membershipId: string, input: DeactivateMemberInput, requestId: string) {
    const result = await this.change(context, companyId, membershipId, input.version, null, requestId)
    return { member: result.member, sessionRevoked: result.sessionRevoked }
  }
}
