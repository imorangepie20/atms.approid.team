import { z } from 'zod'
import { companyIdSchema, dateOnlySchema } from '../companies/companies.schemas'
import { wonStringSchema } from '../common/money.schema'

// [F04 J3/J4] UTF-16 단위가 아닌 코드 포인트 길이와 올바른 UTF-8을 확인한다.
// 모든 업무 필드는 명시한다. 생략으로 거래처/증빙을 자동 선택하지 않는다.
export const journalIdSchema = companyIdSchema
const text = (max: number) => z.string().transform(value => value.trim()).refine(value =>
  [...value].length >= 1 && [...value].length <= max && !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value)
const line = z.strictObject({ accountId: journalIdSchema, debit: wonStringSchema, credit: wonStringSchema,
  memo: text(500).nullable().optional().default(null) })
const fields = { accountingDate: dateOnlySchema, memo: text(500), counterpartyId: journalIdSchema.nullable(),
  evidenceIds: z.array(journalIdSchema).max(20).refine(ids => new Set(ids).size === ids.length), lines: z.array(line).min(2).max(100) }
export const createJournalSchema = z.strictObject({ creationRequestId: journalIdSchema, fiscalYearId: journalIdSchema, ...fields })
// [J6] 전체 내용을 교체하되 번호/회계연도/작성자/상태는 요청에 받지 않는다.
export const updateJournalSchema = z.strictObject({ version: z.number().int().positive().max(2147483647), ...fields })
const page = { cursor: journalIdSchema.optional(), limit: z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number)
  .refine(value => value <= 100).optional().default(20) }
export const journalListSchema = z.strictObject({ ...page, q: text(100).optional(), fiscalYearId: journalIdSchema.optional(),
  from: dateOnlySchema.optional(), to: dateOnlySchema.optional() }).refine(value => !value.from || !value.to || value.from <= value.to)
export const evidenceJournalListSchema = z.strictObject(page)
export type JournalContentInput = Pick<z.infer<typeof createJournalSchema>, keyof typeof fields>
export type CreateJournalInput = z.infer<typeof createJournalSchema>
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>
export type JournalListInput = z.infer<typeof journalListSchema>
export type EvidenceJournalListInput = z.infer<typeof evidenceJournalListSchema>
