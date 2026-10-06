import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { workflowActionSchema, workflowConfirmSchema, workflowRejectSchema, workflowListSchema, workflowHistorySchema } = require('../dist/journals/journal-workflow.schemas.js') as typeof import('../src/journals/journal-workflow.schemas')
const { workflowTransitions, workflowInputHash } = require('../dist/journals/journal-workflow.js') as typeof import('../src/journals/journal-workflow')

describe('F05 workflow input and transition boundary', () => {
  it('K1 exposes the approved transitions including the one-way posting boundary', () => {
    expect(workflowTransitions).toEqual({ SUBMIT: { before: 'DRAFT', after: 'SUBMITTED' },
      APPROVE: { before: 'SUBMITTED', after: 'APPROVED' }, REJECT: { before: 'SUBMITTED', after: 'REJECTED' },
      RETURN_TO_DRAFT: { before: 'REJECTED', after: 'DRAFT' }, CONFIRM: { before: 'APPROVED', after: 'POSTED' } })
  })
  it('K4 hashes the normalized action/body but not the transport request ID', () => {
    const journal = randomUUID(), body = { version: 3, reason: '반려' }
    expect(workflowInputHash(journal, 'REJECT', body)).toBe(workflowInputHash(journal, 'REJECT', body))
    expect(workflowInputHash(journal, 'REJECT', body)).not.toBe(workflowInputHash(journal, 'APPROVE', body))
    expect(workflowInputHash(journal, 'REJECT', body)).not.toBe(workflowInputHash(randomUUID(), 'REJECT', body))
  })
  it('K6 rejects client chosen state, actor and malformed requests', () => {
    const body = { version: 1, actionRequestId: randomUUID() }
    expect(workflowActionSchema.parse(body)).toEqual(body)
    expect(workflowConfirmSchema.parse(body)).toEqual(body)
    for (const invalid of [{ ...body, status: 'APPROVED' }, { ...body, actorId: randomUUID() },
      { ...body, version: 0 }, { ...body, version: 2147483647 }, { ...body, actionRequestId: 'bad' }])
      expect(workflowActionSchema.safeParse(invalid).success).toBe(false)
    expect(workflowRejectSchema.safeParse(body).success).toBe(false)
    for (const reason of ['', ' ', 'x'.repeat(501), 'x\0y', '\ud800'])
      expect(workflowRejectSchema.safeParse({ ...body, reason }).success).toBe(false)
    expect(workflowRejectSchema.parse({ ...body, reason: '  검토 필요  ' }).reason).toBe('검토 필요')
  })
  it('K6 bounds list and history pages and dates', () => {
    expect(workflowListSchema.parse({})).toMatchObject({ status: 'SUBMITTED', limit: 20 })
    expect(workflowHistorySchema.parse({})).toEqual({ limit: 20 })
    for (const invalid of [{ status: 'DRAFT' }, { limit: '101' }, { from: '2026-12-01', to: '2026-01-01' }, { cursor: 'no' }])
      expect(workflowListSchema.safeParse(invalid).success).toBe(false)
    expect(workflowHistorySchema.safeParse({ limit: '101' }).success).toBe(false)
  })
})
