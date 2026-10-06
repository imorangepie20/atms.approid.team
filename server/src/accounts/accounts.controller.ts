import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, UserActivity } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { AccountsService } from './accounts.service'
import { accountIdSchema, accountListSchema, createAccountSchema, deactivateAccountSchema, updateAccountSchema,
  type AccountListInput, type CreateAccountInput, type DeactivateAccountInput, type UpdateAccountInput } from './accounts.schemas'

// [F04-01 승인 A1/A2] 5경로의 입력은 공통 파이프가 먼저 검증한다. GET은 활동 연장을 선언하지 않는다.
@Controller('companies/:companyId/accounts')
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly service: AccountsService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }
  @Get() @RequirePermission('accounts.read')
  list(@Param('companyId', { schema: accountIdSchema }) companyId: string, @Query({ schema: accountListSchema }) input: AccountListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.list(companyId, req.auth!.user.id, input)
  }
  @Get(':accountId') @RequirePermission('accounts.read')
  detail(@Param('companyId', { schema: accountIdSchema }) companyId: string, @Param('accountId', { schema: accountIdSchema }) id: string,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.detail(companyId, req.auth!.user.id, id)
  }
  @Post() @HttpCode(200) @RequirePermission('accounts.manage') @UserActivity()
  create(@Param('companyId', { schema: accountIdSchema }) companyId: string, @Body({ schema: createAccountSchema }) input: CreateAccountInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.create(companyId, req.auth!, input, req.requestId)
  }
  @Patch(':accountId') @RequirePermission('accounts.manage') @UserActivity()
  update(@Param('companyId', { schema: accountIdSchema }) companyId: string, @Param('accountId', { schema: accountIdSchema }) id: string,
    @Body({ schema: updateAccountSchema }) input: UpdateAccountInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.update(companyId, req.auth!, id, input, req.requestId)
  }
  @Post(':accountId/deactivate') @HttpCode(200) @RequirePermission('accounts.manage') @UserActivity()
  deactivate(@Param('companyId', { schema: accountIdSchema }) companyId: string, @Param('accountId', { schema: accountIdSchema }) id: string,
    @Body({ schema: deactivateAccountSchema }) input: DeactivateAccountInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.deactivate(companyId, req.auth!, id, input, req.requestId)
  }
}
