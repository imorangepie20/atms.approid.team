import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { performance } from 'node:perf_hooks'
import { AUTH_POLICY } from '../config/app.config'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { MailService } from '../mail/mail.service'
import { actionMessage, passwordChangedMessage, type MailMessage } from '../mail/mail.templates'
import { SessionService } from './session.service'
import { LoginRateLimitService } from './login-rate-limit.service'
import { PasswordPolicyService } from './password-policy.service'
import { ActionTokenService, actionHash, type ActionPurpose } from './action-token.service'
import type { AuthContext } from './auth.types'
import type { Prisma } from '../generated/prisma/client'

@Injectable()
export class AccountLifecycleService implements OnModuleDestroy {
  private readonly logger = new Logger(AccountLifecycleService.name)
  private readonly pending = new Set<Promise<void>>()
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(LoginRateLimitService) private readonly rate: LoginRateLimitService,
    @Inject(PasswordPolicyService) private readonly passwords: PasswordPolicyService,
    @Inject(ActionTokenService) private readonly tokens: ActionTokenService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AuditService) private readonly audit: AuditService) {}

  // [F01 전체 흐름] 가입/발송 예약은 DB commit → 메모리의 메일 작업 시작 → 동일 접수 응답 순서다.
  // SMTP 처리 시간/오류로 계정 유무가 응답에 드러나지 않는다. 대기는 DB 경로의 짧은 차이를 완화할 뿐
  // 임의의 부하에서 완전한 일정 시간을 보장하지 않는다. 비밀번호/조회 실패는 계정 조회 전에 반환한다.
  private async acceptedSince(started: number) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, AUTH_POLICY.emailResponseMinMs - (performance.now() - started))))
    return { accepted: true }
  }
  private lockUser(tx: Prisma.TransactionClient, userId: string) {
    return tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
  }
  private dispatch(message: MailMessage, userId: string, requestId: string, tokenId?: string) {
    const task = (async () => {
      if (await this.mail.send(message)) return
      // 전송 실패는 해당 미소비 토큰만 무효화한다. 이미 사용한 토큰/더 새로 발급한 토큰은 건드리지 않는다.
      await this.db.$transaction(async tx => {
        await this.lockUser(tx, userId)
        const now = this.sessions.now()
        if (tokenId) await tx.userActionToken.updateMany({ where: { id: tokenId, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: now } })
        await this.audit.record(tx, { type: 'MAIL_FAILED', actorId: userId, requestId })
      })
    })().catch(() => { this.logger.error('Account mail processing failed.') })
    this.pending.add(task)
    void task.then(() => this.pending.delete(task))
  }
  // 정상 종료에는 진행 중 전송/실패 기록을 기다린다. 강제 종료 시 원문을 디스크에 복원하지 않고 재발송한다.
  async flushMail(): Promise<void> { await Promise.all([...this.pending]) }
  onModuleDestroy() { return this.flushMail() }

  async register(emailInput: string, password: string, requestId: string) {
    const started = performance.now(), email = emailInput.toLowerCase()
    await this.rate.reserveEmailAccount(email, this.sessions.now())
    const passwordHash = await this.passwords.hash(password, email)
    const issued = await this.db.$transaction(async tx => {
      // 아직 행이 없는 동시 가입은 이메일 advisory lock으로 직렬화한다. 원본은 SQL 파라미터로만 사용한다.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`registration:${email}`}, 0))`
      await tx.$queryRaw`SELECT id FROM users WHERE email_normalized = ${email} FOR UPDATE`
      let user = await tx.user.findUnique({ where: { emailNormalized: email } })
      if (!user) {
        user = await tx.user.create({ data: { email: emailInput, emailNormalized: email, passwordHash } })
        await this.audit.record(tx, { type: 'ACCOUNT_REGISTERED', requestId, actorId: user.id })
      }
      if (user.disabledAt || user.emailVerifiedAt) return null
      const token = await this.tokens.issue(tx, user.id, 'EMAIL_VERIFICATION', this.sessions.now())
      return { user, token }
    })
    if (issued) this.dispatch(actionMessage(issued.user.email, this.sessions.config.origin, issued.token.purpose, issued.token.raw), issued.user.id, requestId, issued.token.id)
    return this.acceptedSince(started)
  }
  async requestEmail(emailInput: string, purpose: ActionPurpose, requestId: string) {
    const started = performance.now(), email = emailInput.toLowerCase()
    await this.rate.reserveEmailAccount(email, this.sessions.now())
    const issued = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE email_normalized = ${email} FOR UPDATE`
      const user = await tx.user.findUnique({ where: { emailNormalized: email } })
      const eligible = user && !user.disabledAt && (purpose === 'EMAIL_VERIFICATION' ? !user.emailVerifiedAt : !!user.emailVerifiedAt)
      if (!eligible) return null
      return { user, token: await this.tokens.issue(tx, user.id, purpose, this.sessions.now()) }
    })
    if (issued) this.dispatch(actionMessage(issued.user.email, this.sessions.config.origin, purpose, issued.token.raw), issued.user.id, requestId, issued.token.id)
    return this.acceptedSince(started)
  }
  async confirm(raw: string, password: string, purpose: ActionPurpose, requestId: string) {
    if (!/^[0-9a-f]{64}$/.test(raw)) throw new BadRequestException()
    const candidate = await this.db.userActionToken.findUnique({ where: { tokenHash: actionHash(raw) }, include: { user: true } })
    if (!candidate || candidate.purpose !== purpose) throw new BadRequestException()
    // 네트워크/Argon2를 DB 잠금 밖에서 처리한다. 이후 잠금 안에서 상태/시간/토큰을 다시 검사한다.
    const passwordHash = await this.passwords.hash(password, candidate.user.emailNormalized)
    const user = await this.db.$transaction(async tx => {
      await this.lockUser(tx, candidate.userId)
      const now = this.sessions.now()
      const current = await tx.user.findUniqueOrThrow({ where: { id: candidate.userId } })
      if (current.disabledAt || (purpose === 'EMAIL_VERIFICATION' ? !!current.emailVerifiedAt : !current.emailVerifiedAt)) throw new BadRequestException()
      await this.tokens.consume(tx, candidate.id, current.id, purpose, now)
      await tx.user.update({ where: { id: current.id }, data: { passwordHash, ...(purpose === 'EMAIL_VERIFICATION' ? { emailVerifiedAt: now } : {}) } })
      await this.tokens.invalidateRemaining(tx, current.id, now)
      await tx.userSession.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: now } })
      await this.audit.record(tx, { type: purpose === 'EMAIL_VERIFICATION' ? 'EMAIL_VERIFIED' : 'PASSWORD_RESET', actorId: current.id, requestId })
      return current
    })
    this.dispatch(passwordChangedMessage(user.email), user.id, requestId)
    return { success: true }
  }
  async change(context: AuthContext, password: string, requestId: string) {
    const passwordHash = await this.passwords.hash(password, context.user.email.toLowerCase())
    const user = await this.db.$transaction(async tx => {
      await this.lockUser(tx, context.user.id)
      const now = this.sessions.now()
      const current = await tx.user.findUniqueOrThrow({ where: { id: context.user.id } })
      // guard 검사 뒤 조회/해시 중 시간이 지나거나 다른 복구가 세션을 폐기했을 수 있어 DB에서 다시 확인한다.
      const valid = await tx.userSession.findFirst({ where: { id: context.session.id, userId: current.id, revokedAt: null,
        idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now },
        reauthenticatedAt: { gt: new Date(now.getTime() - AUTH_POLICY.reauthMs), lte: now } } })
      if (!valid || current.disabledAt || !current.emailVerifiedAt) throw new ForbiddenException()
      await tx.user.update({ where: { id: current.id }, data: { passwordHash } })
      await this.tokens.invalidateRemaining(tx, current.id, now)
      await tx.userSession.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: now } })
      await this.audit.record(tx, { type: 'PASSWORD_CHANGED', actorId: current.id, requestId })
      return current
    })
    this.dispatch(passwordChangedMessage(user.email), user.id, requestId)
    return { success: true }
  }
}
