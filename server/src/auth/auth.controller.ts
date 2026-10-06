import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'
import { Public } from './auth.decorators'
import { loginSchema, reauthSchema, type LoginInput, type ReauthInput } from './auth.schemas'
import type { AuthRequest } from './auth.types'

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService) {}
  private cookieOptions() {
    return { httpOnly: true, secure: this.sessions.config.secure, sameSite: 'strict' as const, path: '/' }
  }
  @Public() @Post('login') @HttpCode(200)
  async login(@Body({ schema: loginSchema }) input: LoginInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const context = await this.auth.login(input, req.requestId)
    // [F01 추가] 원문 식별자는 HttpOnly 쿠키로만 전달한다. 쿠키 만료와 별개로 매 요청 DB 만료를 검사한다.
    res.cookie(this.sessions.config.cookieName, context.rawToken, { ...this.cookieOptions(), expires: context.session.absoluteExpiresAt })
    res.setHeader('Cache-Control', 'no-store')
    return this.sessions.view(context)
  }
  @Get('session')
  session(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    return this.sessions.view(req.auth!)
  }
  @Post('logout') @HttpCode(200)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.auth!, false, req.requestId)
    res.clearCookie(this.sessions.config.cookieName, this.cookieOptions())
    return { success: true }
  }
  @Post('logout-all') @HttpCode(200)
  async logoutAll(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.auth!, true, req.requestId)
    res.clearCookie(this.sessions.config.cookieName, this.cookieOptions())
    return { success: true }
  }
  @Post('reauthenticate') @HttpCode(200)
  async reauthenticate(@Body({ schema: reauthSchema }) input: ReauthInput, @Req() req: AuthRequest) {
    await this.auth.reauthenticate(req.auth!, input.password, req.requestId)
    return { success: true }
  }
}
