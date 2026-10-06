import { z } from 'zod'
import { ACCOUNT_CONFIG as limits } from '../config/app.config'

// [F04-01 승인 A3] UTF-8로 왕복되지 않는 문자열/NULL 문자를 거부한다. 길이는 코드 포인트 기준이다.
const text = (max: number) => z.string().transform(value => value.trim()).refine(value =>
  !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value && [...value].length >= 1 && [...value].length <= max)
export const accountIdSchema = z.string().uuid().transform(value => value.toLowerCase())
export const accountCategorySchema = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
export const accountNormalBalanceSchema = z.enum(['DEBIT', 'CREDIT'])
const code = z.string().transform(value => value.trim())
  // 비ASCII 문자가 대문자 변환 후 ASCII가 되는 경우(ß→SS 등)도 원문 단계에서 거부한다.
  .refine(value => /^[A-Za-z0-9_-]+$/.test(value) && value.length <= limits.codeMax).transform(value => value.toUpperCase())
const name = text(limits.nameMax)
const version = z.number().int().positive().max(2147483647)
// 회사/처리자/active/템플릿/해시는 서버가 결정하므로 strictObject가 위조 필드를 차단한다.
export const createAccountSchema = z.strictObject({ creationRequestId: accountIdSchema, code, name,
  category: accountCategorySchema, normalBalance: accountNormalBalanceSchema })
export const updateAccountSchema = z.strictObject({ version, name: name.optional(),
  category: accountCategorySchema.optional(), normalBalance: accountNormalBalanceSchema.optional() })
  .refine(value => Object.keys(value).some(key => key !== 'version'))
  .refine(value => (value.category === undefined) === (value.normalBalance === undefined))
export const deactivateAccountSchema = z.strictObject({ version })
export const accountListSchema = z.strictObject({ q: text(limits.queryMax).optional(), category: accountCategorySchema.optional(),
  active: z.enum(['active', 'inactive', 'all']).optional().default('active'), cursor: accountIdSchema.optional(),
  limit: z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number).refine(value => value <= limits.listMax).optional().default(limits.listDefault) })
export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
export type DeactivateAccountInput = z.infer<typeof deactivateAccountSchema>
export type AccountListInput = z.infer<typeof accountListSchema>
