import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { z } from 'zod'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { ACTIVITY, PERMISSION } from './auth.decorators'
import { SessionService } from './session.service'
import { hasPermission } from './access-policy'
import type { AuthRequest } from './auth.types'

@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SessionService) private readonly sessions: SessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION, [context.getHandler(), context.getClass()])
    const req = context.switchToHttp().getRequest<AuthRequest>()
    const extend = async () => {
      // 모든 GET은 읽기 전용. 활동 여부는 서버 선언이며 권한이 확인된 변경 요청만 갱신한다.
      if (req.auth && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
          && this.reflector.getAllAndOverride<boolean>(ACTIVITY, [context.getHandler(), context.getClass()])) await this.sessions.extend(req.auth)
    }
    if (!permission) { await extend(); return true }
    const parsed = z.string().uuid().safeParse(req.params.companyId)
    if (!parsed.success) throw new BadRequestException()
    const companyId = parsed.data
    const membership = req.auth && await this.db.companyMembership.findUnique({
      where: { companyId_userId: { companyId, userId: req.auth.user.id } }, include: { roles: true, company: true },
    })
    const reason = !membership?.active ? 'COMPANY' : !hasPermission(membership.roles.map(row => row.role), permission) ? 'ROLE' : null
    if (reason) {
      await this.db.$transaction(tx => this.audit.record(tx, { type: 'ACCESS_DENIED', requestId: req.requestId,
        actorId: req.auth?.user.id, companyId, reason }))
      throw new ForbiddenException()
    }
    if (!membership) throw new ForbiddenException()
    req.companyScope = { id: companyId, membershipId: membership.id,
      roles: membership.roles.map(row => row.role), allowSelfApproval: membership.company.allowSelfApproval }
    await extend()
    return true
  }
}
