import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, RequireReauthentication, UserActivity } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { SessionService } from '../auth/session.service'
import { companyIdSchema, type CompanyListInput } from './companies.schemas'
import { accessFlowIdSchema, accessFlowListSchema, accessFlowVersionSchema, accessRequestCreateSchema,
  invitationAcceptSchema, invitationCreateSchema, type AccessFlowVersionInput, type InvitationCreateInput } from './company-access-flows.schemas'
import { CompanyAccessFlowsService } from './company-access-flows.service'

// [F01 추가] 클래스 전체에 회사 소속 권한을 붙이지 않는다. 소속 없는 계정도 본인 신청/초대 수락은 가능하다.
// 관리 메서드에만 현재 company.members.manage를 요구하며 공개(Public) 경로는 없다.
@Controller()
export class CompanyAccessFlowsController {
  constructor(@Inject(CompanyAccessFlowsService) private readonly flows: CompanyAccessFlowsService,
    @Inject(SessionService) private readonly sessions: SessionService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }
  private ip(req: AuthRequest) { return req.ip ?? req.socket.remoteAddress ?? 'unknown' }
  @Get('companies/:companyId/invitations') @RequirePermission('company.members.manage')
  invitations(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Query({ schema: accessFlowListSchema }) input: CompanyListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.listInvitations(companyId, req.auth!.user.id, input)
  }
  @Post('companies/:companyId/invitations') @HttpCode(200) @RequirePermission('company.members.manage') @RequireReauthentication() @UserActivity()
  createInvitation(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Body({ schema: invitationCreateSchema }) input: InvitationCreateInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.createInvitation(req.auth!, companyId, input, this.ip(req), req.requestId)
  }
  @Post('companies/:companyId/invitations/:invitationId/cancel') @HttpCode(200) @RequirePermission('company.members.manage') @RequireReauthentication() @UserActivity()
  cancelInvitation(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Param('invitationId', { schema: accessFlowIdSchema }) id: string,
    @Body({ schema: accessFlowVersionSchema }) input: AccessFlowVersionInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.changeInvitation(req.auth!, companyId, id, input.version, false, this.ip(req), req.requestId)
  }
  @Post('companies/:companyId/invitations/:invitationId/resend') @HttpCode(200) @RequirePermission('company.members.manage') @RequireReauthentication() @UserActivity()
  resendInvitation(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Param('invitationId', { schema: accessFlowIdSchema }) id: string,
    @Body({ schema: accessFlowVersionSchema }) input: AccessFlowVersionInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.changeInvitation(req.auth!, companyId, id, input.version, true, this.ip(req), req.requestId)
  }
  @Post('company-invitations/accept') @HttpCode(200) @RequireReauthentication() @UserActivity()
  async accept(@Body({ schema: invitationAcceptSchema }) input: { token: string }, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.flows.acceptInvitation(req.auth!, input.token, req.requestId)
    // [F01 쿠키 경계] commit 성공 뒤 본인에게만 새 식별자를 전달한다. 초기 절대 만료는 그대로다.
    res.cookie(this.sessions.config.cookieName, result.context.rawToken, { httpOnly: true, secure: this.sessions.config.secure,
      sameSite: 'strict', path: '/', expires: result.context.session.absoluteExpiresAt })
    this.noStore(res); return { invitation: result.invitation, member: result.member, session: this.sessions.view(result.context) }
  }
  @Post('companies/:companyId/access-requests') @HttpCode(200) @UserActivity()
  createRequest(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Body({ schema: accessRequestCreateSchema }) _input: Record<string, never>,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.createRequest(req.auth!, companyId, this.ip(req), req.requestId)
  }
  @Get('me/company-access-requests')
  ownRequests(@Query({ schema: accessFlowListSchema }) input: CompanyListInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.listRequests(req.auth!.user.id, input)
  }
  @Post('me/company-access-requests/:accessRequestId/cancel') @HttpCode(200) @UserActivity()
  cancelRequest(@Param('accessRequestId', { schema: accessFlowIdSchema }) id: string, @Body({ schema: accessFlowVersionSchema }) input: AccessFlowVersionInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.changeRequest(req.auth!, id, input.version, 'cancel', req.requestId)
  }
  @Get('companies/:companyId/access-requests') @RequirePermission('company.members.manage')
  requests(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Query({ schema: accessFlowListSchema }) input: CompanyListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.listRequests(req.auth!.user.id, input, companyId)
  }
  @Post('companies/:companyId/access-requests/:accessRequestId/approve') @HttpCode(200) @RequirePermission('company.members.manage') @RequireReauthentication() @UserActivity()
  approveRequest(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Param('accessRequestId', { schema: accessFlowIdSchema }) id: string,
    @Body({ schema: accessFlowVersionSchema }) input: AccessFlowVersionInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.changeRequest(req.auth!, id, input.version, 'approve', req.requestId, companyId)
  }
  @Post('companies/:companyId/access-requests/:accessRequestId/reject') @HttpCode(200) @RequirePermission('company.members.manage') @RequireReauthentication() @UserActivity()
  rejectRequest(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Param('accessRequestId', { schema: accessFlowIdSchema }) id: string,
    @Body({ schema: accessFlowVersionSchema }) input: AccessFlowVersionInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.flows.changeRequest(req.auth!, id, input.version, 'reject', req.requestId, companyId)
  }
}
