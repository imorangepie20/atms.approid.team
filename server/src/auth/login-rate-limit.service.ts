import { Inject, Injectable, HttpException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { AUTH_POLICY } from '../config/app.config'
import { PrismaService } from '../prisma.service'
import type { Prisma } from '../generated/prisma/client'

@Injectable()
export class LoginRateLimitService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private key(kind: 'account' | 'ip' | 'email-account' | 'email-ip', value: string) { return createHash('sha256').update(`${kind}:${value}`).digest('hex') }
  private async bucket(tx: Prisma.TransactionClient, id: string) {
    // [F01 추가] 같은 키의 읽기/수정 전체를 DB advisory lock으로 직렬화한다. 값은 SQL 파라미터로 전달한다.
    // 프로세스별 메모리 카운터가 아니므로 재시작·복수 서버에도 DB에 남은 최근 시도를 사용한다.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`
    return tx.loginRateBucket.upsert({ where: { id }, create: { id, attempts: [] }, update: {} })
  }
  async reserveIp(ip: string, now: Date): Promise<void> {
    const allowed = await this.db.$transaction(async tx => {
      const row = await this.bucket(tx, this.key('ip', ip))
      const attempts = row.attempts.filter(at => at.getTime() > now.getTime() - AUTH_POLICY.loginWindowMs)
      if (attempts.length >= AUTH_POLICY.ipRequests) return false
      await tx.loginRateBucket.update({ where: { id: row.id }, data: { attempts: [...attempts, now] } })
      return true
    }, { maxWait: 10000, timeout: 15000 })
    if (!allowed) throw new HttpException('Login rate limit', 429)
  }
  async account<T>(email: string, now: Date, verify: (tx: Prisma.TransactionClient) => Promise<{ success: boolean; value: T }>): Promise<T> {
    const result = await this.db.$transaction(async tx => {
      const row = await this.bucket(tx, this.key('account', email))
      if (row.blockedUntil && row.blockedUntil > now) return { blocked: true as const }
      const attempts = row.attempts.filter(at => at.getTime() > now.getTime() - AUTH_POLICY.loginWindowMs)
      const verified = await verify(tx)
      if (!verified.success) attempts.push(now)
      await tx.loginRateBucket.update({ where: { id: row.id }, data: { attempts,
        blockedUntil: attempts.length >= AUTH_POLICY.accountFailures ? new Date(now.getTime() + AUTH_POLICY.accountWaitMs) : null } })
      return { blocked: false as const, value: verified.value }
    }, { maxWait: 10000, timeout: 15000 })
    // 제한/인증 실패 예외는 트랜잭션 commit 이후 던진다. 실패 횟수를 예외로 롤백하지 않는다.
    if (result.blocked) throw new HttpException('Login rate limit', 429)
    return result.value
  }
  // [F01 이메일 제한 추가] IP는 파이프 전에, 정규화 이메일은 입력 검증 뒤에 예약한다.
  // 존재하지 않는 계정도 똑같이 카운트하며 확인/복구/가입이 같은 이메일 버킷을 사용한다.
  private async reserveEmail(kind: 'email-account' | 'email-ip', value: string, maximum: number, now: Date): Promise<void> {
    const allowed = await this.db.$transaction(async tx => {
      const row = await this.bucket(tx, this.key(kind, value))
      const attempts = row.attempts.filter(at => at.getTime() > now.getTime() - AUTH_POLICY.emailWindowMs)
      if (attempts.length >= maximum) return false
      await tx.loginRateBucket.update({ where: { id: row.id }, data: { attempts: [...attempts, now] } })
      return true
    })
    if (!allowed) throw new HttpException('Email rate limit', 429)
  }
  reserveEmailIp(ip: string, now: Date) { return this.reserveEmail('email-ip', ip, AUTH_POLICY.emailIpRequests, now) }
  reserveEmailAccount(email: string, now: Date) { return this.reserveEmail('email-account', email, AUTH_POLICY.emailAccountRequests, now) }
}
