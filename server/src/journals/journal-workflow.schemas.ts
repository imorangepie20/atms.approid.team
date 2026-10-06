import { z } from 'zod'
import { dateOnlySchema } from '../companies/companies.schemas'
import { journalIdSchema } from './journals.schemas'

// [F05 W4/W5] 클라이언트는 처리자·상태·시각을 선택할 수 없다.
const request = { version: z.number().int().positive().max(2147483646), actionRequestId: journalIdSchema }
export const workflowActionSchema = z.strictObject(request)
// [F05-01 확정] confirm도 같은 낙관적 버전과 회사 범위 작업 UUID만 받는다.
// 처리자·시각·승인 제출본은 요청에서 받지 않고 서버가 현재 DB 상태로 결정한다.
export const workflowConfirmSchema = workflowActionSchema
export const workflowRejectSchema = z.strictObject({ ...request, reason: z.string().transform(value => value.trim())
  .refine(value => [...value].length >= 1 && [...value].length <= 500 && !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value) })
const page = { cursor: journalIdSchema.optional(), limit: z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number)
  .refine(value => value <= 100).optional().default(20) }
export const workflowListSchema = z.strictObject({ ...page, status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']).optional().default('SUBMITTED'),
  fiscalYearId: journalIdSchema.optional(), from: dateOnlySchema.optional(), to: dateOnlySchema.optional(),
  q: z.string().trim().min(1).max(100).optional() }).refine(value => !value.from || !value.to || value.from <= value.to)
export const workflowHistorySchema = z.strictObject(page)
export type WorkflowActionInput = z.infer<typeof workflowActionSchema>
export type WorkflowRejectInput = z.infer<typeof workflowRejectSchema>
export type WorkflowListInput = z.infer<typeof workflowListSchema>
export type WorkflowHistoryInput = z.infer<typeof workflowHistorySchema>
