import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { journalIdSchema } from './journals.schemas'
import { LedgerService } from './ledger.service'
import { accountLedgerSchema, journalBookSchema, type AccountLedgerInput, type JournalBookInput } from './ledger.schemas'

// [F04-08~10 원장] 읽기 전용 API도 세션·현재 소속·회사 경계를 적용하고 캐시 저장을 금지한다.
@Controller('companies/:companyId/ledger')
export class LedgerController {
  constructor(@Inject(LedgerService) private readonly service: LedgerService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }

  @Get('journal-book') @RequirePermission('journal.read')
  journalBook(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Query({ schema: journalBookSchema }) input: JournalBookInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.journalBook(companyId, req.auth!.user.id, input)
  }

  @Get('accounts/:accountId') @RequirePermission('journal.read')
  accountLedger(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('accountId', { schema: journalIdSchema }) accountId: string,
    @Query({ schema: accountLedgerSchema }) input: AccountLedgerInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.accountLedger(companyId, accountId, req.auth!.user.id, input)
  }
}
