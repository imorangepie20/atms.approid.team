import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, UserActivity } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { journalIdSchema } from './journals.schemas'
import { JournalWorkflowService } from './journal-workflow.service'
import { workflowActionSchema, workflowConfirmSchema, workflowHistorySchema, workflowListSchema, workflowRejectSchema,
  type WorkflowActionInput, type WorkflowHistoryInput, type WorkflowListInput, type WorkflowRejectInput } from './journal-workflow.schemas'

// [F05 W2/W7] 읽기는 활동 연장 없이, 쓰기는 기존 Origin/CSRF와 활동 선언을 사용한다.
@Controller('companies/:companyId')
export class JournalWorkflowController {
  constructor(@Inject(JournalWorkflowService) private readonly service: JournalWorkflowService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }

  @Get('journal-approval-requests') @RequirePermission('journal.read')
  list(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Query({ schema: workflowListSchema }) input: WorkflowListInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.list(companyId, req.auth!.user.id, input)
  }

  @Get('journals/:journalId/workflow') @RequirePermission('journal.read')
  detail(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('journalId', { schema: journalIdSchema }) journalId: string,
    @Query({ schema: workflowHistorySchema }) input: WorkflowHistoryInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.detail(companyId, journalId, req.auth!.user.id, input)
  }

  @Post('journals/:journalId/submit') @HttpCode(200) @RequirePermission('journal.request') @UserActivity()
  submit(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('journalId', { schema: journalIdSchema }) journalId: string,
    @Body({ schema: workflowActionSchema }) input: WorkflowActionInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.transition(companyId, journalId, req.auth!, 'SUBMIT', input, req.requestId)
  }

  @Post('journals/:journalId/approve') @HttpCode(200) @RequirePermission('journal.approve') @UserActivity()
  approve(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('journalId', { schema: journalIdSchema }) journalId: string,
    @Body({ schema: workflowActionSchema }) input: WorkflowActionInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.transition(companyId, journalId, req.auth!, 'APPROVE', input, req.requestId)
  }

  @Post('journals/:journalId/confirm') @HttpCode(200) @RequirePermission('journal.confirm') @UserActivity()
  confirm(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('journalId', { schema: journalIdSchema }) journalId: string,
    @Body({ schema: workflowConfirmSchema }) input: WorkflowActionInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.transition(companyId, journalId, req.auth!, 'CONFIRM', input, req.requestId)
  }

  @Post('journals/:journalId/reject') @HttpCode(200) @RequirePermission('journal.approve') @UserActivity()
  reject(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('journalId', { schema: journalIdSchema }) journalId: string,
    @Body({ schema: workflowRejectSchema }) input: WorkflowRejectInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.transition(companyId, journalId, req.auth!, 'REJECT', input, req.requestId)
  }

  @Post('journals/:journalId/return-to-draft') @HttpCode(200) @RequirePermission('journal.draft') @UserActivity()
  returnToDraft(@Param('companyId', { schema: journalIdSchema }) companyId: string,
    @Param('journalId', { schema: journalIdSchema }) journalId: string,
    @Body({ schema: workflowActionSchema }) input: WorkflowActionInput, @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.transition(companyId, journalId, req.auth!, 'RETURN_TO_DRAFT', input, req.requestId)
  }
}
