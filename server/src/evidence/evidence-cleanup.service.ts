import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { EVIDENCE_CONFIG as limits } from '../config/app.config'
import { EvidenceStorageService } from './evidence-storage.service'
import { uploadAttempts } from './evidence.service'

@Injectable()
export class EvidenceCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout; private running = false; private cursor?: string
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(EvidenceStorageService) private readonly storage: EvidenceStorageService) {}
  now() { return new Date() }
  onModuleInit() {
    // 시험은 명시적으로 tick을 호출한다. 운영의 미설정/장애를 완료로 간주하지 않는다.
    if (process.env.NODE_ENV !== 'test') this.timer = setInterval(() => { void this.tick().catch(() => {}) }, limits.cleanupMs)
    this.timer?.unref()
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer) }
  async tick() {
    if (this.running || !this.storage.configured()) return
    this.running = true
    try {
      const now = this.now(), cutoff = new Date(now.getTime() - limits.expiryMs)
      const rows = await this.db.evidenceUpload.findMany({ where: { ...(this.cursor ? { id: { gt: this.cursor } } : {}), OR: [
        { state: { in: ['PENDING', 'FAILED', 'CLEANING'] }, lastActivityAt: { lte: cutoff }, leaseExpiresAt: { lte: now } },
        { state: { in: ['READY', 'EXPIRED'] } },
      ] }, orderBy: { id: 'asc' }, take: limits.listMax })
      this.cursor = rows.length === limits.listMax ? rows.at(-1)!.id : undefined
      for (const candidate of rows) await this.clean(candidate.id, now, cutoff)
    } finally { this.running = false }
  }
  private async clean(id: string, now: Date, cutoff: Date) {
    try {
      // [F03 E7] 잠금으로 완료/정리를 직렬화한다. 활성 작업/완료 참조는 원본 삭제 대상으로 잡지 않는다.
      const claimed = await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM evidence_uploads WHERE id=${id}::uuid FOR UPDATE`
        const row = await tx.evidenceUpload.findUniqueOrThrow({ where: { id }, include: { evidence: true } })
        if (row.state !== 'READY' && row.state !== 'EXPIRED') {
          if (row.lastActivityAt > cutoff || row.leaseExpiresAt > now || row.evidence) return null
          await tx.evidenceUpload.update({ where: { id }, data: { state: 'CLEANING', leaseExpiresAt: new Date(now.getTime() + limits.leaseMs) } })
        }
        return row
      })
      if (!claimed) return
      const attempts = uploadAttempts(claimed)
      for (const attempt of attempts) {
        if ((claimed.state === 'READY' && attempt.id === claimed.attemptId) || claimed.lastActivityAt <= cutoff) await this.storage.remove(attempt.tmp)
        // READY의 이전 실패 시도도 원본 후보 정리는24시간 뒤에만 수행한다.
        if (claimed.lastActivityAt <= cutoff) {
          const referenced = await this.db.evidence.findUnique({ where: { originalKey: attempt.original } })
          if (!referenced) await this.storage.remove(attempt.original)
        }
      }
      if (claimed.state !== 'READY' && claimed.state !== 'EXPIRED') {
        await this.db.evidenceUpload.updateMany({ where: { id, state: 'CLEANING', attemptId: claimed.attemptId }, data: { state: 'EXPIRED', failureCode: 'EXPIRED' } })
      }
      // attempts/만료 기록은 지우지 않는다. 시간 초과 뒤 늦은 파일은 후속 tick에서 다시 제거한다.
    } catch { /* 고정 예약 추적을 유지한다. 파일명/키/내용/SDK 예외를 로그하지 않는다. */ }
  }
}
