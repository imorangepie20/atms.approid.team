import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import * as argon2 from 'argon2'
import { randomBytes } from 'node:crypto'
import { AUTH_POLICY } from '../config/app.config'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { LoginRateLimitService } from './login-rate-limit.service'
import { SessionService } from './session.service'
import type { AuthContext } from './auth.types'
import type { LoginInput } from './auth.schemas'

@Injectable()
export class AuthService {
  // 없는 계정도 실제 Argon2 비용의 검증을 거친다. 계정 존재 여부를 빠른 실패로 구별하지 않는다.
  private readonly dummy = argon2.hash(randomBytes(32).toString('hex'), { type: argon2.argon2id,
    memoryCost: AUTH_POLICY.argonMemoryKiB, timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(LoginRateLimitService) private readonly rate: LoginRateLimitService,
    @Inject(AuditService) private readonly audit: AuditService) {}
  private async matches(hash: string | null | undefined, password: string): Promise<boolean> {
    const validFormat = typeof hash === 'string' && hash.startsWith('$argon2id$')
    try { const ok = await argon2.verify(validFormat ? hash : await this.dummy, password); return validFormat && ok }
    catch { return false }
  }
  async login(input: LoginInput, requestId: string): Promise<AuthContext> {
    const now = this.sessions.now()
    const email = input.email.trim().toLowerCase()
    const context = await this.rate.account<AuthContext | null>(email, now, async tx => {
      // [F01 복구 연결 수정] 비밀번호 변경/확인/복구와 같은 사용자 행을 잠근 뒤 현재 해시를 읽는다.
      // 변경이 먼저 끝나면 새 해시로 검사하고, 로그인이 먼저 끝나면 변경이 방금 발급한 세션까지 폐기한다.
      await tx.$queryRaw`SELECT id FROM users WHERE email_normalized = ${email} FOR UPDATE`
      const user = await tx.user.findUnique({ where: { emailNormalized: email } })
      const passwordMatches = await this.matches(user?.passwordHash, input.password)
      if (!user || !passwordMatches || user.disabledAt || !user.emailVerifiedAt) {
        await this.audit.record(tx, { type: 'LOGIN_FAILED', requestId })
        return { success: false, value: null }
      }
      // [F01/F08-13 추가] 로그인 세션 생성과 성공 감사가 함께 commit하거나 함께 rollback한다.
      const result = await this.sessions.create(tx, user, now)
      await this.audit.record(tx, { type: 'LOGIN_SUCCEEDED', requestId, actorId: user.id })
      return { success: true, value: result }
    })
    if (!context) throw new UnauthorizedException()
    return context
  }
  async logout(context: AuthContext, all: boolean, requestId: string): Promise<void> {
    const now = this.sessions.now()
    await this.db.$transaction(async tx => {
      const changed = await tx.userSession.updateMany({ where: { ...(all ? { userId: context.user.id } : { id: context.session.id }), revokedAt: null }, data: { revokedAt: now } })
      if (!all && changed.count !== 1) throw new UnauthorizedException()
      await this.audit.record(tx, { type: all ? 'LOGOUT_ALL' : 'LOGOUT', requestId, actorId: context.user.id })
    })
  }
  async reauthenticate(context: AuthContext, password: string, requestId: string): Promise<void> {
    const now = this.sessions.now()
    // 같은 비밀번호 추측 제한을 재확인에도 적용한다. 반복 재확인이 무제한 검증 우회가 되지 않게 한다.
    const success = await this.rate.account(context.user.email.toLowerCase(), now, async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${context.user.id}::uuid FOR UPDATE`
      const user = await tx.user.findUnique({ where: { id: context.user.id } })
      const matches = await this.matches(user?.passwordHash, password)
      if (!user || user.disabledAt || !user.emailVerifiedAt || !matches) {
        await this.audit.record(tx, { type: 'REAUTH_FAILED', requestId, actorId: context.user.id })
        return { success: false, value: false }
      }
      const changed = await tx.userSession.updateMany({ where: { id: context.session.id, revokedAt: null,
        idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } }, data: { reauthenticatedAt: now } })
      if (changed.count !== 1) throw new UnauthorizedException()
      await this.audit.record(tx, { type: 'REAUTH_SUCCEEDED', requestId, actorId: context.user.id })
      return { success: true, value: true }
    })
    if (!success) throw new UnauthorizedException()
  }
}
