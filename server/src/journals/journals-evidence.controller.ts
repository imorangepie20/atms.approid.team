import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { JournalsService } from './journals.service'
import { evidenceJournalListSchema, journalIdSchema, type EvidenceJournalListInput } from './journals.schemas'

// [J4 API5] 완료 원본을 바꾸지 않고 연결된 초안만 역조회한다. 증빙 권한은 서비스에서도 확인한다.
@Controller('companies/:companyId/evidence/:evidenceId/journals')
export class JournalsEvidenceController {
  constructor(@Inject(JournalsService) private readonly service: JournalsService) {}
  @Get() @RequirePermission('journal.read')
  list(@Param('companyId', { schema: journalIdSchema }) companyId: string, @Param('evidenceId', { schema: journalIdSchema }) evidenceId: string,
    @Query({ schema: evidenceJournalListSchema }) input: EvidenceJournalListInput, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store'); return this.service.forEvidence(companyId, req.auth!.user.id, evidenceId, input)
  }
}
