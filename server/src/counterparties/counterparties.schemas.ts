import { z } from 'zod'
import { COUNTERPARTY_CONFIG as limits } from '../config/app.config'

// [F02 승인 C2] 길이는 코드 포인트로 센다. 비밀번호 등 기존 입력에는 이 정규화를 적용하지 않는다.
const validText = (value: string) => !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value
const text = (max: number) => z.string().transform(value => value.trim()).refine(value => validText(value) && [...value].length >= 1 && [...value].length <= max)
const nullableText = (max: number) => z.string().transform(value => value.trim() || null)
  .refine(value => value === null || (validText(value) && [...value].length <= max)).nullable()
export const counterpartyIdSchema = z.string().uuid().transform(value => value.toLowerCase())
export const counterpartyKindSchema = z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH'])
export const businessNumberSchema = z.string().transform(value => value.trim() || null)
  .refine(value => value === null || /^(?:[0-9]{10}|[0-9]{3}-[0-9]{2}-[0-9]{5})$/.test(value))
  .transform(value => value?.replaceAll('-', '') ?? null).nullable()
const email = nullableText(limits.emailMax).refine(value => value === null || z.email().safeParse(value).success)
const fields = {
  name: text(limits.nameMax), kind: counterpartyKindSchema, businessNumber: businessNumberSchema,
  contactName: nullableText(limits.contactNameMax), email, phone: nullableText(limits.phoneMax),
  address: nullableText(limits.addressMax), memo: nullableText(limits.memoMax),
}
const optionalFields = { businessNumber: fields.businessNumber.optional(), contactName: fields.contactName.optional(),
  email: fields.email.optional(), phone: fields.phone.optional(), address: fields.address.optional(), memo: fields.memo.optional() }
const version = z.number().int().positive().max(2147483647)
// strictObject는 회사/처리자/active/내부 해시 등 서버가 정하는 값의 위조를 거부한다.
export const createCounterpartySchema = z.strictObject({ creationRequestId: counterpartyIdSchema, name: fields.name, kind: fields.kind, ...optionalFields })
export const updateCounterpartySchema = z.strictObject({ version, name: fields.name.optional(), kind: fields.kind.optional(), ...optionalFields })
  .refine(value => Object.keys(value).some(key => key !== 'version'))
export const deactivateCounterpartySchema = z.strictObject({ version })
export const counterpartyListSchema = z.strictObject({
  q: text(limits.queryMax).optional(), kind: counterpartyKindSchema.optional(), active: z.enum(['active', 'inactive', 'all']).optional().default('active'),
  cursor: counterpartyIdSchema.optional(),
  limit: z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number).refine(value => value <= limits.listMax).optional().default(limits.listDefault),
})
export type CreateCounterpartyInput = z.infer<typeof createCounterpartySchema>
export type UpdateCounterpartyInput = z.infer<typeof updateCounterpartySchema>
export type DeactivateCounterpartyInput = z.infer<typeof deactivateCounterpartySchema>
export type CounterpartyListInput = z.infer<typeof counterpartyListSchema>
