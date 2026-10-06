import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { companyIdSchema } from '../companies/companies.schemas'
import { RulesService } from './rules.service'
import { ruleApplicationListSchema, type RuleApplicationListInput } from './rules.schemas'

@Controller('companies/:companyId/rule-applications')
export class RulesController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  // [F13-01~03 추가] 첫 API는 조회 전용이다. GET은 세션 활동을 연장하지 않고 응답 캐시를 금지한다.
  @Get() @RequirePermission('company.read')
  list(@Param('companyId', { schema: companyIdSchema }) companyId: string,
    @Query({ schema: ruleApplicationListSchema }) input: RuleApplicationListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    return this.rules.list(companyId, req.auth!.user.id, input)
  }
}
