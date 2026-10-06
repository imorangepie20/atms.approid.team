import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { AUTH_POLICY, readAuthConfig } from '../config/app.config'
import { PrismaService } from '../prisma.service'
import type { Prisma } from '../generated/prisma/client'
import type { AuthContext } from './auth.types'

export const hashToken = (value: string): string => createHash('sha256').update(value).digest('hex')
export const csrfFor = (raw: string): string => createHmac('sha256', raw).update('ATMS-CSRF-v1').digest('hex')
const tokenPattern = /^[a-f0-9]{64}$/
@Injectable()
export class SessionService {
  readonly config = readAuthConfig()
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  // [F01 추가] 서버 시각을 한 곳에서 읽는다. 테스트는 이 메서드만 제어하며 운영용 시각 우회 환경변수는 없다.
  now(): Date { return new Date() }
  async create(tx: Prisma.TransactionClient, user: { id: string; email: string }, now: Date) {
    const rawToken = randomBytes(32).toString('hex')
    const session = await tx.userSession.create({ data: {
      userId: user.id, tokenHash: hashToken(rawToken), csrfTokenHash: hashToken(csrfFor(rawToken)),
      createdAt: now, lastActivityAt: now, idleExpiresAt: new Date(now.getTime() + AUTH_POLICY.idleMs),
      absoluteExpiresAt: new Date(now.getTime() + AUTH_POLICY.absoluteMs),
    } })
    return { user: { id: user.id, email: user.email }, session, rawToken }
  }
  async resolve(raw: unknown): Promise<AuthContext> {
    if (typeof raw !== 'string' || !tokenPattern.test(raw)) throw new UnauthorizedException()
    const row = await this.db.userSession.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } })
    const now = this.now().getTime()
    // 만료 경계와 계정 상태는 매 요청마다 다시 읽는다. 쿠키가 남아 있어도 만료 세션을 되살리지 않는다.
    if (!row || row.revokedAt || !row.csrfTokenHash || row.user.disabledAt || !row.user.emailVerifiedAt
        || row.createdAt.getTime() > now || row.lastActivityAt.getTime() > now
        || now >= row.idleExpiresAt.getTime() || now >= row.absoluteExpiresAt.getTime()) throw new UnauthorizedException()
    const { user, ...session } = row
    return { user: { id: user.id, email: user.email }, session, rawToken: raw }
  }
  validCsrf(context: AuthContext, input: unknown): boolean {
    if (typeof input !== 'string' || !tokenPattern.test(input) || !context.session.csrfTokenHash) return false
    return timingSafeEqual(Buffer.from(hashToken(input), 'hex'), Buffer.from(context.session.csrfTokenHash, 'hex'))
  }
  recentlyConfirmed(context: AuthContext): boolean {
    const at = context.session.reauthenticatedAt?.getTime()
    const elapsed = at === undefined ? Infinity : this.now().getTime() - at
    return elapsed >= 0 && elapsed < AUTH_POLICY.reauthMs
  }
  // [F01 회사 기반 추가] guard 이후의 로그아웃/복구/식별자 교체와 경합해도 오래된 인증으로 쓰지 않는다.
  // 호출자는 먼저 User 행을 잠근다. 다음 세션 행 잠금은 로그아웃의 UPDATE와도 직렬화된다.
  // 모든 조건은 잠금 이후 새 DB 값과 서버 시각으로 재검사하며 외부 컨텍스트의 만료값을 신뢰하지 않는다.
  async assertCurrent(tx: Prisma.TransactionClient, context: AuthContext, requireReauth = false): Promise<AuthContext> {
    await tx.$queryRaw`SELECT id FROM user_sessions WHERE id=${context.session.id}::uuid FOR UPDATE`
    const row = await tx.userSession.findUnique({ where: { id: context.session.id }, include: { user: true } })
    const now = this.now().getTime()
    if (!row || row.userId !== context.user.id || row.tokenHash !== hashToken(context.rawToken)
        || row.revokedAt || !row.csrfTokenHash || row.user.disabledAt || !row.user.emailVerifiedAt
        || row.createdAt.getTime() > now || row.lastActivityAt.getTime() > now
        || now >= row.idleExpiresAt.getTime() || now >= row.absoluteExpiresAt.getTime()) throw new UnauthorizedException()
    const { user, ...session } = row
    const current = { user: { id: user.id, email: user.email }, session, rawToken: context.rawToken }
    if (requireReauth && !this.recentlyConfirmed(current)) throw new ForbiddenException()
    return current
  }
  async rotateForNewRole(tx: Prisma.TransactionClient, context: AuthContext) {
    const current = await this.assertCurrent(tx, context, true)
    const now = this.now(), rawToken = randomBytes(32).toString('hex')
    // 같은 UUID 행을 갱신한다. createdAt/absoluteExpiresAt/재확인 시각을 다시 시작하지 않는다.
    const session = await tx.userSession.update({ where: { id: current.session.id }, data: {
      tokenHash: hashToken(rawToken), csrfTokenHash: hashToken(csrfFor(rawToken)), lastActivityAt: now,
      idleExpiresAt: new Date(Math.min(now.getTime() + AUTH_POLICY.idleMs, current.session.absoluteExpiresAt.getTime())),
    } })
    const revoked = await tx.userSession.updateMany({ where: { userId: current.user.id, id: { not: session.id }, revokedAt: null }, data: { revokedAt: now } })
    return { context: { user: current.user, session, rawToken }, otherSessionsRevoked: revoked.count }
  }
  // [F01 구성원 변경 추가] 호출자는 대상 User 행을 먼저 잠근 뒤 검증한 DB 사용자 ID만 전달한다.
  // 로그인/복구도 같은 User 잠금을 쓰므로 폐기와 동시에 새 로그인이 끼어들어 오래된 권한 세션을 남기지 않는다.
  // 세션은 회사별로 나뉘지 않아 대상의 모든 기기를 폐기한다. 다른 회사 소속/역할과 다른 계정은 수정하지 않는다.
  async revokeForUser(tx: Prisma.TransactionClient, userId: string): Promise<number> {
    const result = await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: this.now() } })
    return result.count
  }
  async extend(context: AuthContext): Promise<void> {
    const now = this.now()
    const idle = new Date(Math.min(now.getTime() + AUTH_POLICY.idleMs, context.session.absoluteExpiresAt.getTime()))
    // 조건부 갱신으로 동시 로그아웃·만료 세션을 되살리지 않는다. GET에서는 호출하지 않는다.
    const result = await this.db.userSession.updateMany({ where: { id: context.session.id, tokenHash: hashToken(context.rawToken), revokedAt: null,
      idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now }, lastActivityAt: { lte: now } },
      data: { lastActivityAt: now, idleExpiresAt: idle } })
    if (result.count !== 1) throw new UnauthorizedException()
  }
  view(context: AuthContext) {
    // 응답 허용 필드를 직접 만든다. 세션 전체·해시·원문 쿠키를 JSON으로 직렬화하지 않는다.
    return { user: context.user, csrfToken: csrfFor(context.rawToken),
      idleExpiresAt: context.session.idleExpiresAt.toISOString(), absoluteExpiresAt: context.session.absoluteExpiresAt.toISOString() }
  }
}
