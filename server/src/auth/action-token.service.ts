import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { AUTH_POLICY } from '../config/app.config'
import type { Prisma } from '../generated/prisma/client'

export type ActionPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET'
export const actionHash = (token: string) => createHash('sha256').update(token).digest('hex')
@Injectable()
export class ActionTokenService {
  // [F01 추가] 호출자의 트랜잭션을 사용한다. 사용자 행을 잠근 뒤 발급/소비해야 한다.
  // 발급 원문은 호출자 메모리와 메일에만 전달한다. DB·파일·감사 기록에는 해시만 남는다.
  async issue(tx: Prisma.TransactionClient, userId: string, purpose: ActionPurpose, now: Date) {
    await tx.userActionToken.updateMany({ where: { userId, purpose, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: now } })
    const raw = randomBytes(32).toString('hex')
    const row = await tx.userActionToken.create({ data: { userId, purpose, tokenHash: actionHash(raw), createdAt: now,
      expiresAt: new Date(now.getTime() + (purpose === 'EMAIL_VERIFICATION' ? AUTH_POLICY.verificationMs : AUTH_POLICY.resetMs)) } })
    return { id: row.id, raw, purpose }
  }
  async consume(tx: Prisma.TransactionClient, id: string, userId: string, purpose: ActionPurpose, now: Date) {
    const changed = await tx.userActionToken.updateMany({ where: { id, userId, purpose, usedAt: null, invalidatedAt: null,
      createdAt: { lte: now }, expiresAt: { gt: now } }, data: { usedAt: now } })
    if (changed.count !== 1) throw new BadRequestException()
  }
  invalidateRemaining(tx: Prisma.TransactionClient, userId: string, now: Date) {
    return tx.userActionToken.updateMany({ where: { userId, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: now } })
  }
}
