import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, UserActivity } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { journalIdSchema } from './journals.schemas'
import { OpeningBalanceService } from './opening-balance.service'
import { createOpeningBalanceSchema, updateOpeningBalanceSchema,
  type CreateOpeningBalanceInput, type UpdateOpeningBalanceInput } from './opening-balance.schemas'

// [F04-02 O2/O7] singleton 경로만 기초 잔액을 만들며 상태 전이는 기존 journal workflow 경로를 사용한다.
@Controller('companies/:companyId/fiscal-years/:fiscalYearId/opening-balance')
export class OpeningBalanceController {
  constructor(@Inject(OpeningBalanceService) private readonly service: OpeningBalanceService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }

  @Get() @RequirePermission('journal.read')
  get(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('fiscalYearId', { schema: journalIdSchema }) fiscalYearId: string,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.get(companyId, fiscalYearId, req.auth!.user.id)
  }

  @Post() @HttpCode(200) @RequirePermission('journal.draft') @UserActivity()
  create(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('fiscalYearId', { schema: journalIdSchema }) fiscalYearId: string,
    @Body({ schema: createOpeningBalanceSchema }) input: CreateOpeningBalanceInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.create(companyId, fiscalYearId, req.auth!, input, req.requestId)
  }

  @Patch() @RequirePermission('journal.draft') @UserActivity()
  update(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('fiscalYearId', { schema: journalIdSchema }) fiscalYearId: string,
    @Body({ schema: updateOpeningBalanceSchema }) input: UpdateOpeningBalanceInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.update(companyId, fiscalYearId, req.auth!, input, req.requestId)
  }
}
