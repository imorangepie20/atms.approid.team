import { z } from 'zod'
import { EVIDENCE_CONFIG as limits } from '../config/app.config'

// [F03 E2] 공백 정규화/코드 포인트 길이. 발생일은 회계일자나 적격 판정이 아니다.
const text = z.string().transform(value => value.trim()).refine(value => [...value].length > 0
  && [...value].length <= limits.titleMax && !/[\x00-\x1f\x7f]/.test(value) && Buffer.from(value).toString('utf8') === value)
export const evidenceIdSchema = z.string().uuid().transform(value => value.toLowerCase())
export const evidenceKindSchema = z.enum(['RECEIPT', 'TAX_INVOICE', 'OTHER'])
const date = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00.000Z')
  return value.slice(0, 4) !== '0000' && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
})
export const evidenceMetadataSchema = z.strictObject({
  creationRequestId: evidenceIdSchema, kind: evidenceKindSchema, title: text,
  occurredOn: date.nullable().optional().default(null), counterpartyId: evidenceIdSchema.nullable().optional().default(null),
})
export const evidenceListSchema = z.strictObject({
  q: text.optional(), kind: evidenceKindSchema.optional(), counterpartyId: evidenceIdSchema.optional(), cursor: evidenceIdSchema.optional(),
  limit: z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number).refine(value => value <= limits.listMax).optional().default(limits.listDefault),
})
export type EvidenceMetadata = z.infer<typeof evidenceMetadataSchema>
export type EvidenceListInput = z.infer<typeof evidenceListSchema>
