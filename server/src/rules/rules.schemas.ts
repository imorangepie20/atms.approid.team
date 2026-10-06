import { z } from 'zod'
import { COMPANY_CONFIG } from '../config/app.config'
import { companyIdSchema, dateOnlySchema } from '../companies/companies.schemas'

// [F13-01~03 추가] 조회 시점·cursor·limit만 허용한다. 날짜/숫자를 느슨하게 자동 보정하지 않는다.
export const ruleApplicationListSchema = z.strictObject({
  asOf: dateOnlySchema.optional(),
  cursor: companyIdSchema.optional(),
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number)
    .refine(value => value <= COMPANY_CONFIG.listMax).optional().default(COMPANY_CONFIG.listDefault),
})

export type RuleApplicationListInput = z.infer<typeof ruleApplicationListSchema>
