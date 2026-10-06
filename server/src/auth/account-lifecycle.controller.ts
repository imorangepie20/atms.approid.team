import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { AccountLifecycleService } from './account-lifecycle.service'
import { SessionService } from './session.service'
import { Public, RequireReauthentication } from './auth.decorators'
import { emailRequestSchema, passwordChangeSchema, registerSchema, tokenConfirmSchema, type RegisterInput, type TokenConfirmInput } from './auth.schemas'
import type { AuthRequest } from './auth.types'

@Controller('auth')
export class AccountLifecycleController {
  constructor(@Inject(AccountLifecycleService) private readonly lifecycle: AccountLifecycleService,
    @Inject(SessionService) private readonly sessions: SessionService) {}
  // [F01 추가] 메일은 접수만 응답한다. 계정 ID/사용자 상태/토큰/전송 결과를 공개 응답에 넣지 않는다.
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }
  private clearCookie(res: Response) {
    res.clearCookie(this.sessions.config.cookieName, { httpOnly: true, secure: this.sessions.config.secure, sameSite: 'strict', path: '/' })
  }
  @Public() @Post('register') @HttpCode(202)
  async register(@Body({ schema: registerSchema }) input: RegisterInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res)
    return this.lifecycle.register(input.email, input.password, req.requestId)
  }
  @Public() @Post('email-verification/request') @HttpCode(202)
  async verificationRequest(@Body({ schema: emailRequestSchema }) input: { email: string }, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res)
    return this.lifecycle.requestEmail(input.email, 'EMAIL_VERIFICATION', req.requestId)
  }
  @Public() @Post('email-verification/confirm') @HttpCode(200)
  async verificationConfirm(@Body({ schema: tokenConfirmSchema }) input: TokenConfirmInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res)
    return this.lifecycle.confirm(input.token, input.newPassword, 'EMAIL_VERIFICATION', req.requestId)
  }
  @Public() @Post('password-reset/request') @HttpCode(202)
  async resetRequest(@Body({ schema: emailRequestSchema }) input: { email: string }, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res)
    return this.lifecycle.requestEmail(input.email, 'PASSWORD_RESET', req.requestId)
  }
  @Public() @Post('password-reset/confirm') @HttpCode(200)
  async resetConfirm(@Body({ schema: tokenConfirmSchema }) input: TokenConfirmInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res)
    const result = await this.lifecycle.confirm(input.token, input.newPassword, 'PASSWORD_RESET', req.requestId)
    this.clearCookie(res)
    return result
  }
  @Post('password/change') @HttpCode(200) @RequireReauthentication()
  async change(@Body({ schema: passwordChangeSchema }) input: { newPassword: string }, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res)
    const result = await this.lifecycle.change(req.auth!, input.newPassword, req.requestId)
    this.clearCookie(res)
    return result
  }
}
