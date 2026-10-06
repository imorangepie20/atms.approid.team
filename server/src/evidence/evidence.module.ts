import { Inject, Module, RequestMethod, ServiceUnavailableException, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database.module'
import { EvidenceController } from './evidence.controller'
import { EvidenceService } from './evidence.service'
import { EvidenceStorageService } from './evidence-storage.service'
import { EvidenceScannerService } from './evidence-scanner.service'
import { EvidenceCleanupService } from './evidence-cleanup.service'
import type { NextFunction, Request, Response } from 'express'

// [F03 연결] 기존 DB/세션/감사를 공유한다. 저장/검사 비밀값을 새 모듈 밖으로 전달하지 않는다.
@Module({ imports: [DatabaseModule, AuthModule], controllers: [EvidenceController],
  providers: [EvidenceService, EvidenceStorageService, EvidenceScannerService, EvidenceCleanupService] })
export class EvidenceModule implements NestModule {
  constructor(@Inject(EvidenceScannerService) private readonly scanner: EvidenceScannerService) {}
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(async (_req: Request, _res: Response, next: NextFunction) => {
      // 개발 헬스 응답은 보존한다. 운영 readiness는 현재 검사 가용성도 필요하다.
      if (process.env.NODE_ENV !== 'production') { next(); return }
      try { await this.scanner.ready(); next() } catch { next(new ServiceUnavailableException()) }
    }).forRoutes({ path: 'health/ready', method: RequestMethod.GET })
  }
}
