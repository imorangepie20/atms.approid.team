import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, UserActivity } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { JournalsService } from './journals.service'
import { createJournalSchema, journalIdSchema, journalListSchema, updateJournalSchema,
  type CreateJournalInput, type JournalListInput, type UpdateJournalInput } from './journals.schemas'

// [J1/J5] 기존 전역 guard→입력 파이프→서비스 순서. 권한 있는 쓰기만 사용자 활동을 연장한다.
@Controller('companies/:companyId/journals')
export class JournalsController {
  constructor(@Inject(JournalsService) private readonly service: JournalsService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }
  @Get() @RequirePermission('journal.read')
  list(@Param('companyId', { schema: journalIdSchema }) companyId: string, @Query({ schema: journalListSchema }) input: JournalListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.list(companyId, req.auth!.user.id, input)
  }
  @Get(':journalId') @RequirePermission('journal.read')
  detail(@Param('companyId', { schema: journalIdSchema }) companyId: string, @Param('journalId', { schema: journalIdSchema }) id: string,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.detail(companyId, req.auth!.user.id, id)
  }
  @Post() @HttpCode(200) @RequirePermission('journal.draft') @UserActivity()
  create(@Param('companyId', { schema: journalIdSchema }) companyId: string, @Body({ schema: createJournalSchema }) input: CreateJournalInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.create(companyId, req.auth!, input, req.requestId)
  }
  @Patch(':journalId') @RequirePermission('journal.draft') @UserActivity()
  update(@Param('companyId', { schema: journalIdSchema }) companyId: string, @Param('journalId', { schema: journalIdSchema }) id: string,
    @Body({ schema: updateJournalSchema }) input: UpdateJournalInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.update(companyId, req.auth!, id, input, req.requestId)
  }
}
