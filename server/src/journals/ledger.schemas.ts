import { z } from 'zod'
import { dateOnlySchema } from '../companies/companies.schemas'
import { journalIdSchema } from './journals.schemas'

// [F04-08~10 원장] cursor는 서버 발급 base64url만 받고, 해석과 필터 지문 검사는 서비스가 수행한다.
const cursor = z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional()
const limit = z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number).refine(value => value <= 100).optional().default(20)
const postedThrough = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  // Date.parse는 2월 30일을 자동 보정할 수 있으므로 ISO 재직렬화가 원문과 정확히 같은지도 확인한다.
  .refine(value => { const parsed = new Date(value); return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value }).optional()
const queryText = z.string().transform(value => value.trim()).refine(value =>
  [...value].length >= 1 && [...value].length <= 100 && !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value).optional()
const filters = { fiscalYearId: journalIdSchema.optional(), from: dateOnlySchema.optional(), to: dateOnlySchema.optional(),
  postedThrough, q: queryText, cursor, limit }
const ordered = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape)
  .refine(value => !('from' in value) || !('to' in value) || !value.from || !value.to || value.from <= value.to)

export const journalBookSchema = ordered({ ...filters, accountId: journalIdSchema.optional() })
// [F04-02 O8] 기초·이월·당기 경계를 계산하려면 계정 원장의 회계연도가 반드시 필요하다.
export const accountLedgerSchema = ordered({ ...filters, fiscalYearId: journalIdSchema })
export type JournalBookInput = z.infer<typeof journalBookSchema>
export type AccountLedgerInput = z.infer<typeof accountLedgerSchema>
