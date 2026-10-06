import { z } from 'zod'
import { COMPANY_CONFIG } from '../config/app.config'

// [F01 추가: 회사 입력 경계] strictObject는 서버가 결정하는 회사/처리자/역할의 위조 필드를 거부한다.
// 이름만 앞뒤 공백을 정리한다. 비밀번호 등 다른 입력의 정규화 정책을 바꾸지 않는다.
export const companyIdSchema = z.string().uuid().transform(value => value.toLowerCase())
export const companyNameSchema = z.string().transform(value => value.trim()).refine(value =>
  [...value].length >= COMPANY_CONFIG.nameMin && [...value].length <= COMPANY_CONFIG.nameMax
  && !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value)
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  // JS가 2월 30일을 3월로 넘겨 계산하더라도 원래 문자열과 왕복 비교하여 거부한다.
  const date = new Date(`${value}T00:00:00.000Z`)
  return !value.startsWith('0000') && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
})
export const toDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`)
const periodFields = { startDate: dateOnlySchema, endDate: dateOnlySchema }
const validPeriod = (input: { startDate: string; endDate: string }) => {
  const days = (toDateOnly(input.endDate).getTime() - toDateOnly(input.startDate).getTime()) / 86400000 + 1
  return days >= 1 && days <= COMPANY_CONFIG.fiscalYearMaxDays
}
// PostgreSQL INTEGER 범위. 최댓값 버전은 서비스에서 추가 변경을 거부하여 오버플로를 막는다.
const version = z.number().int().positive().max(2147483647)
export const createCompanySchema = z.strictObject({ creationRequestId: companyIdSchema, name: companyNameSchema, ...periodFields }).refine(validPeriod)
export const renameCompanySchema = z.strictObject({ name: companyNameSchema, version })
// [F01 본인 승인 설정 추가] Boolean만 받는다. 문자열 "true"를 자동 변환하거나 역할/처리자 필드를 허용하지 않는다.
// 회사 이름/기간과 같은 version을 사용하여 서로 다른 설정 화면의 오래된 수정도 서비스에서 거부한다.
export const changeSelfApprovalSchema = z.strictObject({ allowSelfApproval: z.boolean(), version })
export const addFiscalYearSchema = z.strictObject({ ...periodFields, version }).refine(validPeriod)
export const selectCompanySchema = z.strictObject({})
export const companyListSchema = z.strictObject({
  cursor: companyIdSchema.optional(),
  // GET query는 문자열이다. 지수/소수/공백/중복 query를 숫자로 자동 보정하지 않는다.
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number)
    .refine(value => value <= COMPANY_CONFIG.listMax).optional().default(COMPANY_CONFIG.listDefault),
})
export type CreateCompanyInput = z.infer<typeof createCompanySchema>
export type RenameCompanyInput = z.infer<typeof renameCompanySchema>
export type ChangeSelfApprovalInput = z.infer<typeof changeSelfApprovalSchema>
export type AddFiscalYearInput = z.infer<typeof addFiscalYearSchema>
export type CompanyListInput = z.infer<typeof companyListSchema>
