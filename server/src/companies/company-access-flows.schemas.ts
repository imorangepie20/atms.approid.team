import { z } from 'zod'
import { CompanyRole } from '../generated/prisma/client'
import { companyIdSchema, companyListSchema } from './companies.schemas'

// [F01 추가] 토큰 용도는 별도 DB로 구별한다. 클라이언트가 상태/사용자/권한을 임의로 지정하지 못한다.
export const accessFlowIdSchema = companyIdSchema
export const accessFlowListSchema = companyListSchema
export const invitationCreateSchema = z.strictObject({ email: z.string().email().max(254),
  roles: z.array(z.enum(CompanyRole)).min(1).max(5).refine(values => new Set(values).size === values.length).transform(values => values.sort()) })
export const accessFlowVersionSchema = z.strictObject({ version: z.number().int().min(1).max(2147483647) })
export const invitationAcceptSchema = z.strictObject({ token: z.string().regex(/^[0-9a-f]{64}$/) })
export const accessRequestCreateSchema = z.strictObject({})
export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>
export type AccessFlowVersionInput = z.infer<typeof accessFlowVersionSchema>
