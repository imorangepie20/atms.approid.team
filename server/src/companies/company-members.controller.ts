import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, RequireReauthentication, UserActivity } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { SessionService } from '../auth/session.service'
import { companyIdSchema, type CompanyListInput } from './companies.schemas'
import { changeMemberRolesSchema, deactivateMemberSchema, membershipIdSchema, memberListSchema,
  type ChangeMemberRolesInput, type DeactivateMemberInput } from './company-members.schemas'
import { CompanyMembersService } from './company-members.service'

// [F01 네 번째 묶음] 관리자만 조회/변경한다. 기존 전역 guard는 회사 범위를 먼저 검사하고 입력 pipe가 뒤따른다.
@Controller('companies/:companyId/members') @RequirePermission('company.members.manage')
export class CompanyMembersController {
  constructor(@Inject(CompanyMembersService) private readonly members: CompanyMembersService,
    @Inject(SessionService) private readonly sessions: SessionService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }
  private cookieOptions() { return { httpOnly: true, secure: this.sessions.config.secure, sameSite: 'strict' as const, path: '/' } }
  @Get()
  list(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Query({ schema: memberListSchema }) input: CompanyListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.members.list(companyId, req.auth!.user.id, input)
  }
  @Get(':membershipId')
  detail(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Param('membershipId', { schema: membershipIdSchema }) membershipId: string,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.members.detail(companyId, req.auth!.user.id, membershipId)
  }
  @Patch(':membershipId/roles') @RequireReauthentication() @UserActivity()
  async roles(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Param('membershipId', { schema: membershipIdSchema }) membershipId: string,
    @Body({ schema: changeMemberRolesSchema }) input: ChangeMemberRolesInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.members.changeRoles(req.auth!, companyId, membershipId, input, req.requestId)
    // 업무 commit 후 본인의 식별자만 바꾼다. 다른 사용자의 원문 쿠키를 관리자에게 반환하지 않는다.
    if (result.context) res.cookie(this.sessions.config.cookieName, result.context.rawToken,
      { ...this.cookieOptions(), expires: result.context.session.absoluteExpiresAt })
    this.noStore(res)
    return { member: result.member, session: result.context ? this.sessions.view(result.context) : null }
  }
  @Post(':membershipId/deactivate') @HttpCode(200) @RequireReauthentication() @UserActivity()
  async deactivate(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Param('membershipId', { schema: membershipIdSchema }) membershipId: string,
    @Body({ schema: deactivateMemberSchema }) input: DeactivateMemberInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.members.deactivate(req.auth!, companyId, membershipId, input, req.requestId)
    // 본인 소속 중지는 현재 세션까지 폐기한다. commit 전에는 브라우저 쿠키를 지우지 않는다.
    if (result.sessionRevoked) res.clearCookie(this.sessions.config.cookieName, this.cookieOptions())
    this.noStore(res); return result
  }
}
