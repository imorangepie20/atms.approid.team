import { z } from 'zod'
import { wonStringSchema } from '../common/money.schema'
import { journalIdSchema } from './journals.schemas'

// [F04-02 O3/O4] 회계일자·통화·거래처는 서버가 고정한다. 요청자는 출처·근거·계정별 잔액만 보낸다.
const memo = z.string().transform(value => value.trim()).refine(value =>
  [...value].length >= 1 && [...value].length <= 500 && !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value)
const line = z.strictObject({ accountId: journalIdSchema, debit: wonStringSchema, credit: wonStringSchema,
  memo: memo.nullable().optional().default(null) })
const content = {
  sourceFiscalYearId: journalIdSchema.nullable(),
  evidenceIds: z.array(journalIdSchema).max(20).refine(ids => new Set(ids).size === ids.length),
  lines: z.array(line).max(100).refine(lines => lines.length === 0 || lines.length >= 2),
}

export const createOpeningBalanceSchema = z.strictObject({ creationRequestId: journalIdSchema, ...content })
export const updateOpeningBalanceSchema = z.strictObject({ version: z.number().int().positive().max(2147483647), ...content })
export type OpeningBalanceContentInput = Pick<z.infer<typeof createOpeningBalanceSchema>, keyof typeof content>
export type CreateOpeningBalanceInput = z.infer<typeof createOpeningBalanceSchema>
export type UpdateOpeningBalanceInput = z.infer<typeof updateOpeningBalanceSchema>
