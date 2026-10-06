import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, UserActivity } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { CounterpartiesService } from './counterparties.service'
import { counterpartyIdSchema, counterpartyListSchema, createCounterpartySchema, deactivateCounterpartySchema, updateCounterpartySchema,
  type CounterpartyListInput, type CreateCounterpartyInput, type DeactivateCounterpartyInput, type UpdateCounterpartyInput } from './counterparties.schemas'

// [F02 HTTP 연결] 기존 전역 세션/Origin/CSRF/회사 guard를 공유한다. GET은 활동을 선언하지 않는다.
@Controller('companies/:companyId/counterparties')
export class CounterpartiesController {
  constructor(@Inject(CounterpartiesService) private readonly service: CounterpartiesService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store') }
  @Get() @RequirePermission('counterparties.read')
  list(@Param('companyId', { schema: counterpartyIdSchema }) companyId: string, @Query({ schema: counterpartyListSchema }) input: CounterpartyListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.list(companyId, req.auth!.user.id, input)
  }
  @Post() @HttpCode(200) @RequirePermission('counterparties.write') @UserActivity()
  create(@Param('companyId', { schema: counterpartyIdSchema }) companyId: string, @Body({ schema: createCounterpartySchema }) input: CreateCounterpartyInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.create(companyId, req.auth!, input, req.requestId)
  }
  @Get(':counterpartyId') @RequirePermission('counterparties.read')
  detail(@Param('companyId', { schema: counterpartyIdSchema }) companyId: string, @Param('counterpartyId', { schema: counterpartyIdSchema }) id: string,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.detail(companyId, req.auth!.user.id, id)
  }
  @Patch(':counterpartyId') @RequirePermission('counterparties.write') @UserActivity()
  update(@Param('companyId', { schema: counterpartyIdSchema }) companyId: string, @Param('counterpartyId', { schema: counterpartyIdSchema }) id: string,
    @Body({ schema: updateCounterpartySchema }) input: UpdateCounterpartyInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.update(companyId, req.auth!, id, input, req.requestId)
  }
  @Post(':counterpartyId/deactivate') @HttpCode(200) @RequirePermission('counterparties.write') @UserActivity()
  deactivate(@Param('companyId', { schema: counterpartyIdSchema }) companyId: string, @Param('counterpartyId', { schema: counterpartyIdSchema }) id: string,
    @Body({ schema: deactivateCounterpartySchema }) input: DeactivateCounterpartyInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.deactivate(companyId, req.auth!, id, input, req.requestId)
  }
}
