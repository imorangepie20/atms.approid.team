import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, RequireReauthentication, UserActivity } from '../auth/auth.decorators'
import { SessionService } from '../auth/session.service'
import type { AuthRequest } from '../auth/auth.types'
import { COMPANY_CONFIG } from '../config/app.config'
import { CompaniesService } from './companies.service'
import { addFiscalYearSchema, changeSelfApprovalSchema, companyIdSchema, companyListSchema, createCompanySchema, renameCompanySchema, selectCompanySchema,
  type AddFiscalYearInput, type ChangeSelfApprovalInput, type CompanyListInput, type CreateCompanyInput, type RenameCompanyInput } from './companies.schemas'

// [F01 추가] 全 경로는 기존 전역 guard로 인증한다. GET은 활동 선언이 없고 선택값도 저장하지 않는다.
// 경로 권한/활동/재확인 메타데이터는 서버 선언이다. 본문의 역할 플래그로 바꿀 수 없다.
@Controller('companies')
export class CompaniesController {
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService,
    @Inject(SessionService) private readonly sessions: SessionService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }

  @Get('options')
  options(@Res({ passthrough: true }) res: Response) { this.noStore(res); return COMPANY_CONFIG }
  @Get()
  list(@Query({ schema: companyListSchema }) input: CompanyListInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.companies.list(req.auth!.user.id, input)
  }
  @Post() @HttpCode(200) @RequireReauthentication() @UserActivity()
  async create(@Body({ schema: createCompanySchema }) input: CreateCompanyInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.companies.create(req.auth!, input, req.requestId)
    // TX commit 후에만 새 식별자를 HttpOnly 쿠키에 쓴다. JSON에는 CSRF/만료/최소 사용자만 반환한다.
    if (result.created) res.cookie(this.sessions.config.cookieName, result.context.rawToken, {
      httpOnly: true, secure: this.sessions.config.secure, sameSite: 'strict', path: '/', expires: result.context.session.absoluteExpiresAt,
    })
    this.noStore(res)
    return { company: result.company, created: result.created, session: this.sessions.view(result.context) }
  }
  @Get(':companyId') @RequirePermission('company.read')
  detail(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.companies.detail(companyId, req.auth!.user.id)
  }
  @Post(':companyId/select') @HttpCode(200) @RequirePermission('company.read') @UserActivity()
  select(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Body({ schema: selectCompanySchema }) _input: Record<string, never>,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.companies.select(companyId, req.auth!.user.id)
  }
  @Patch(':companyId') @RequirePermission('company.manage') @UserActivity()
  rename(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Body({ schema: renameCompanySchema }) input: RenameCompanyInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.companies.rename(req.auth!, companyId, input, req.requestId)
  }
  @Get(':companyId/fiscal-years') @RequirePermission('company.read')
  fiscalYears(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Query({ schema: companyListSchema }) input: CompanyListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.companies.fiscalYears(companyId, req.auth!.user.id, input)
  }
  // [F01 본인 승인 설정 추가] 관리자만 변경한다. Origin/CSRF는 기존 전역 인증 guard가 검사한다.
  // 5분 재확인/사용자 활동은 서버 메타데이터로 선언하고, 응답은 기존 회사 view뿐이다. 쿠키를 교체하지 않는다.
  @Patch(':companyId/settings/self-approval') @RequirePermission('company.manage') @RequireReauthentication() @UserActivity()
  selfApproval(@Param('companyId', { schema: companyIdSchema }) companyId: string,
    @Body({ schema: changeSelfApprovalSchema }) input: ChangeSelfApprovalInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.companies.changeSelfApproval(req.auth!, companyId, input, req.requestId)
  }
  @Post(':companyId/fiscal-years') @HttpCode(200) @RequirePermission('company.manage') @UserActivity()
  addFiscalYear(@Param('companyId', { schema: companyIdSchema }) companyId: string, @Body({ schema: addFiscalYearSchema }) input: AddFiscalYearInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.companies.addFiscalYear(req.auth!, companyId, input, req.requestId)
  }
}
