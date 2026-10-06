import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { SessionService } from './session.service'
import { LoginRateLimitService } from './login-rate-limit.service'
import { PUBLIC, REAUTH } from './auth.decorators'
import type { AuthRequest } from './auth.types'
import type { AuditType } from '../audit/audit.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LoginRateLimitService) private readonly rate: LoginRateLimitService) {}
  private async denied(request: AuthRequest, reason: 'SESSION' | 'ORIGIN' | 'CSRF' | 'REAUTH' | 'RATE') {
    await this.db.$transaction(tx => this.audit.record(tx, { type: 'ACCESS_DENIED' as AuditType,
      requestId: request.requestId, actorId: request.auth?.user.id, reason }))
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>()
    req.requestId = randomUUID()
    const path = req.path
    // [F08-13 추가] 공개 헬스 두 경로는 DB 장애 때도 인증 계층을 호출하지 않는다. 그 외 공개는 서버 선언만 허용한다.
    if (req.method === 'GET' && ['/api/health/live', '/api/health/ready'].includes(path)) return true
    const targets = [context.getHandler(), context.getClass()]
    const publicRoute = this.reflector.getAllAndOverride<boolean>(PUBLIC, targets) === true
    const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    if (!safe && req.headers.origin !== this.sessions.config.origin) {
      await this.denied(req, 'ORIGIN'); throw new ForbiddenException()
    }
    if (path === '/api/auth/login' || path === '/api/auth/reauthenticate') {
      try { await this.rate.reserveIp(req.ip ?? req.socket.remoteAddress ?? 'unknown', this.sessions.now()) }
      catch (error) { await this.denied(req, 'RATE'); throw error }
    }
    // [F01 이메일 제한] 잘못된 스키마를 반복 제출해도 IP 한도를 우회하지 못한다. 로그인 한도와는 별도다.
    if (req.method === 'POST' && ['/api/auth/register', '/api/auth/email-verification/request', '/api/auth/password-reset/request'].includes(path)) {
      try { await this.rate.reserveEmailIp(req.ip ?? req.socket.remoteAddress ?? 'unknown', this.sessions.now()) }
      catch (error) { await this.denied(req, 'RATE'); throw error }
    }
    if (publicRoute) return true
    try { req.auth = await this.sessions.resolve(req.cookies?.[this.sessions.config.cookieName]) }
    catch (error) { await this.denied(req, 'SESSION'); throw error }
    if (!safe && !this.sessions.validCsrf(req.auth, req.headers['x-csrf-token'])) {
      await this.denied(req, 'CSRF'); throw new ForbiddenException()
    }
    if (this.reflector.getAllAndOverride<boolean>(REAUTH, targets) && !this.sessions.recentlyConfirmed(req.auth)) {
      await this.denied(req, 'REAUTH'); throw new ForbiddenException()
    }
    // 활동 갱신은 다음 회사 guard가 권한을 확인한 후 수행한다. 거부 요청으로 세션을 연장하지 않는다.
    return true
  }
}
