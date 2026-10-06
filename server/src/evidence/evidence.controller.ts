import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission, UserActivity } from '../auth/auth.decorators'
import type { AuthRequest } from '../auth/auth.types'
import { EvidenceService } from './evidence.service'
import { evidenceIdSchema, evidenceListSchema, type EvidenceListInput } from './evidence.schemas'
import { readEvidenceMultipart } from './evidence-file-validation'

// [F03 HTTP] guard 뒤에 multipart를 읽는다. 정적 requests 경로는 UUID 경로보다 먼저 등록한다.
@Controller('companies/:companyId/evidence')
export class EvidenceController {
  constructor(@Inject(EvidenceService) private readonly service: EvidenceService) {}
  private noStore(res: Response) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff') }
  @Post() @HttpCode(201) @RequirePermission('evidence.create') @UserActivity()
  async register(@Param('companyId', { schema: evidenceIdSchema }) companyId: string, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); const { metadata, file } = await readEvidenceMultipart(req)
    const result = await this.service.register(companyId, req.auth!, metadata, file, req.requestId)
    res.status(result.created ? 201 : 200); return result
  }
  @Get() @RequirePermission('evidence.read')
  list(@Param('companyId', { schema: evidenceIdSchema }) companyId: string, @Query({ schema: evidenceListSchema }) input: EvidenceListInput,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.list(companyId, req.auth!.user.id, input)
  }
  @Get('requests/:creationRequestId') @RequirePermission('evidence.create')
  status(@Param('companyId', { schema: evidenceIdSchema }) companyId: string, @Param('creationRequestId', { schema: evidenceIdSchema }) id: string,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.noStore(res); return this.service.status(companyId, req.auth!.user.id, id)
  }
  @Get(':evidenceId') @RequirePermission('evidence.read')
  async detail(@Param('companyId', { schema: evidenceIdSchema }) companyId: string, @Param('evidenceId', { schema: evidenceIdSchema }) id: string,
    @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    // [F03 상세 응답 수리] 현재 회사 권한/증빙 조회 성공 뒤 승인된 { evidence } 계약으로 감싼다.
    // await로 실제 11필드 결과를 받는다. 조회 실패는 기존 공통 오류 응답으로 전달한다.
    this.noStore(res); return { evidence: await this.service.detail(companyId, req.auth!.user.id, id) }
  }
  @Get(':evidenceId/original') @RequirePermission('evidence.read')
  async original(@Param('companyId', { schema: evidenceIdSchema }) companyId: string, @Param('evidenceId', { schema: evidenceIdSchema }) id: string,
    @Req() req: AuthRequest, @Res() res: Response) {
    this.noStore(res); const result = await this.service.original(companyId, req.auth!, id)
    // RFC5987 filename*는 UTF-8 파일명을 헤더 값에 안전하게 인코딩한다. inline 렌더링은 하지 않는다.
    const name = encodeURIComponent(result.row.originalFileName).replace(/['()*]/g, value => '%' + value.charCodeAt(0).toString(16).toUpperCase())
    res.setHeader('Content-Type', result.row.mediaType); res.setHeader('Content-Disposition', `attachment; filename="evidence"; filename*=UTF-8''${name}`)
    res.setHeader('Content-Length', result.bytes.length); res.send(result.bytes)
  }
}
