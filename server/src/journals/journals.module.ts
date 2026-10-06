import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database.module'
import { JournalsController } from './journals.controller'
import { JournalsEvidenceController } from './journals-evidence.controller'
import { JournalsService } from './journals.service'
import { JournalWorkflowController } from './journal-workflow.controller'
import { JournalWorkflowService } from './journal-workflow.service'
import { LedgerController } from './ledger.controller'
import { LedgerService } from './ledger.service'
import { OpeningBalanceController } from './opening-balance.controller'
import { OpeningBalanceService } from './opening-balance.service'

// [F04 J8] 기존 DB/세션/감사와 guard를 공유한다. 별도 서버·포트·인증 체계를 만들지 않는다.
@Module({ imports: [AuthModule, DatabaseModule],
  controllers: [JournalsController, JournalsEvidenceController, JournalWorkflowController, LedgerController, OpeningBalanceController],
  providers: [JournalsService, JournalWorkflowService, LedgerService, OpeningBalanceService] })
export class JournalsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // [J1 HTTP 캐시] guard/입력 파이프에서 거부된 응답도 초안 경로에서는 저장하지 않는다.
    consumer.apply((_req: Request, res: Response, next: NextFunction) => { res.setHeader('Cache-Control', 'no-store'); next() })
      .forRoutes(JournalsController, JournalsEvidenceController, JournalWorkflowController, LedgerController, OpeningBalanceController)
  }
}
