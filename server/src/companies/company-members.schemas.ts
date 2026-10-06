import { z } from 'zod'
import { CompanyRole } from '../generated/prisma/client'
import { companyIdSchema, companyListSchema } from './companies.schemas'

// [F01 구성원 입력 추가] 기존 UUID/25·100 페이지 계약을 그대로 사용한다. 권한/회사/사용자 위조 필드는 strict로 거부한다.
export const membershipIdSchema = companyIdSchema
export const memberListSchema = companyListSchema
export const memberRolesSchema = z.array(z.enum(CompanyRole)).min(1).max(Object.keys(CompanyRole).length)
  .refine(roles => new Set(roles).size === roles.length).transform(roles => roles.sort())
// INTEGER의 기술 범위다. 실제 최댓값에서의 증가는 서비스가 409로 막는다.
const version = z.number().int().positive().max(2147483647)
export const changeMemberRolesSchema = z.strictObject({ roles: memberRolesSchema, version })
export const deactivateMemberSchema = z.strictObject({ version })
export type ChangeMemberRolesInput = z.infer<typeof changeMemberRolesSchema>
export type DeactivateMemberInput = z.infer<typeof deactivateMemberSchema>
