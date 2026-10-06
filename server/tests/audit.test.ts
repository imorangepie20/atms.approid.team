import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '../src/generated/prisma/client'
const require = createRequire(import.meta.url)
const { AuditService, auditTypes } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
describe('F01 audit contract', () => {
  it.each([
    ['JOURNAL_SUBMITTED','DRAFT','SUBMITTED'], ['JOURNAL_APPROVED','SUBMITTED','APPROVED'],
    ['JOURNAL_REJECTED','SUBMITTED','REJECTED'], ['JOURNAL_RETURNED_TO_DRAFT','REJECTED','DRAFT'],
  ] as const)('K5/K6 records %s without reason or journal content', async (type, statusBefore, statusAfter) => {
    const create = vi.fn().mockResolvedValue({}), tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    const change = { kind: 'journal-workflow', eventType: type, journalId: 'journal-id', actionId: 'action-id',
      statusBefore, statusAfter, versionBefore: 1, versionAfter: 2, reason: 'private reason', memo: 'private memo', amount: '1234' }
    await new AuditService().record(tx, { type, requestId: 'r', actorId: 'actor', companyId: 'company', change } as never)
    expect(create.mock.calls[0][0].data.details).toEqual({ journalId: 'journal-id', actionId: 'action-id',
      statusBefore, statusAfter, versionBefore: 1, versionAfter: 2 })
    expect(JSON.stringify(create.mock.calls)).not.toContain('private')
    await expect(new AuditService().record(tx, { type, requestId: 'r', actorId: 'actor', companyId: 'company',
      change: { ...change, versionAfter: 9 } } as never)).rejects.toThrow('Invalid journal workflow audit')
    expect(create).toHaveBeenCalledTimes(1)
  })
  // [F04-01 K6] 값 대신 정적 필드명/ID/버전/사용 상태만 저장하며 잘못된 조합은 DB 전에 거부한다.
  it.each(['ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'ACCOUNT_DEACTIVATED'] as const)('whitelists %s without account values', async type => {
    const create = vi.fn().mockResolvedValue({}), tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    const created = type === 'ACCOUNT_CREATED', deactivated = type === 'ACCOUNT_DEACTIVATED'
    const change = { kind: 'account', eventType: type, accountId: 'id', changedFields: created ? ['code', 'name', 'category', 'normalBalance'] : deactivated ? ['active'] : ['name'],
      versionBefore: created ? 0 : 1, versionAfter: created ? 1 : 2, activeBefore: !created, activeAfter: !deactivated,
      name: 'private-name', code: 'private-code', creationInputHash: 'private-hash' }
    await new AuditService().record(tx, { type, requestId: 'r', actorId: 'a', companyId: 'c', change } as never)
    expect(auditTypes).toContain(type)
    expect(create.mock.calls[0][0].data.details).toEqual({ accountId: 'id', changedFields: change.changedFields,
      versionBefore: change.versionBefore, versionAfter: change.versionAfter, activeBefore: change.activeBefore, activeAfter: change.activeAfter })
    expect(JSON.stringify(create.mock.calls)).not.toContain('private-')
    for (const invalid of [{ ...change, kind: 'counterparty' }, { ...change, eventType: 'LOGIN_SUCCEEDED' },
      { ...change, changedFields: ['unknown=value'] }, { ...change, changedFields: ['name', 'name'] }, { ...change, changedFields: ['category'] },
      { ...change, versionAfter: 99 }, { ...change, versionBefore: -1 }, { ...change, activeAfter: 'true' }, { ...change, changedFields: [] }])
      await expect(new AuditService().record(tx, { type, requestId: 'r', actorId: 'a', companyId: 'c', change: invalid } as never)).rejects.toThrow('Invalid account')
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('records evidence identity and classification without file or metadata content', async () => {
    const create = vi.fn().mockResolvedValue({}), tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    const event = { type: 'EVIDENCE_REGISTERED', requestId: 'r', actorId: 'a', companyId: 'c', change: {
      kind: 'evidence', evidenceId: 'id', evidenceKind: 'RECEIPT', title: 'private-title', fileName: 'private-file', sha256: 'private-hash', key: 'private-key' } }
    await new AuditService().record(tx, event as never)
    expect(create.mock.calls[0][0].data.details).toEqual({ evidenceId: 'id', kind: 'RECEIPT' })
    expect(JSON.stringify(create.mock.calls)).not.toContain('private-')
    for (const invalid of [{ ...event.change, kind: 'counterparty' }, { ...event.change, evidenceKind: 'OTHER=secret' }, { ...event.change, evidenceId: '' }]) {
      await expect(new AuditService().record(tx, { ...event, change: invalid } as never)).rejects.toThrow('Invalid evidence audit')
    }
    expect(create).toHaveBeenCalledTimes(1)
  })
  // [F02 감사 경계] 정적 필드명만 허용하며 연락 정보나 요청 해시는 잘못 전달돼도 저장하지 않는다.
  it.each(['COUNTERPARTY_CREATED', 'COUNTERPARTY_UPDATED', 'COUNTERPARTY_DEACTIVATED'] as const)('whitelists %s without contact values', async type => {
    const create = vi.fn().mockResolvedValue({}), tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    const created = type === 'COUNTERPARTY_CREATED', deactivated = type === 'COUNTERPARTY_DEACTIVATED'
    const change = { kind: 'counterparty', eventType: type, counterpartyId: 'id', changedFields: deactivated ? ['active'] : ['name'],
      versionBefore: created ? 0 : 1, versionAfter: created ? 1 : 2, activeBefore: !created, activeAfter: !deactivated,
      email: 'private-contact', businessNumber: 'private-number', creationInputHash: 'private-hash', token: 'private-token' }
    await new AuditService().record(tx, { type, requestId: 'r', actorId: 'a', companyId: 'c', change } as never)
    expect(auditTypes).toContain(type)
    expect(create.mock.calls[0][0].data.details).toEqual({ counterpartyId: 'id', changedFields: change.changedFields,
      versionBefore: change.versionBefore, versionAfter: change.versionAfter, activeBefore: change.activeBefore, activeAfter: change.activeAfter })
    expect(JSON.stringify(create.mock.calls)).not.toContain('private-')
    for (const invalid of [{ ...change, eventType: 'LOGIN_SUCCEEDED' }, { ...change, changedFields: ['unknown=contact'] },
      { ...change, changedFields: ['name', 'name'] }, { ...change, versionAfter: 99 }, { ...change, activeAfter: 'true' }, { ...change, changedFields: [] }]) {
      await expect(new AuditService().record(tx, { type, requestId: 'r', actorId: 'a', companyId: 'c', change: invalid } as never)).rejects.toThrow('Invalid counterparty')
    }
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('whitelists self approval fields and rejects wrong event kinds and non-Boolean values', async () => {
    // [F01 설정 감사 검증] 서비스가 잘못 전달한 원문/해시도 고정 details에 복사되지 않는다.
    const create = vi.fn().mockResolvedValue({}), tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    const event = { type: 'COMPANY_SELF_APPROVAL_CHANGED', requestId: 'r', actorId: 'a', companyId: 'c', change: {
      kind: 'self-approval', allowSelfApprovalBefore: false, allowSelfApprovalAfter: true, versionBefore: 1, versionAfter: 2,
      token: 'private-token', email: 'private-email', tokenHash: 'private-hash', password: 'private-password' } }
    expect(auditTypes).toContain('COMPANY_SELF_APPROVAL_CHANGED')
    await new AuditService().record(tx, event as never)
    expect(create.mock.calls[0][0].data.details).toEqual({ allowSelfApprovalBefore: false, allowSelfApprovalAfter: true, versionBefore: 1, versionAfter: 2 })
    expect(JSON.stringify(create.mock.calls)).not.toContain('private-')
    for (const change of [{ ...event.change, kind: 'renamed' }, { ...event.change, allowSelfApprovalAfter: 'true' }]) {
      await expect(new AuditService().record(tx, { ...event, change } as never)).rejects.toThrow('Invalid self approval')
    }
    await expect(new AuditService().record(tx, { ...event, type: 'COMPANY_RENAMED' } as never)).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('whitelists new access events and refuses mismatched entities or event kinds', async () => {
    const create = vi.fn().mockResolvedValue({}), tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    const types = ['INVITATION_CREATED', 'INVITATION_CANCELLED', 'INVITATION_RESENT', 'INVITATION_ACCEPTED', 'INVITATION_MAIL_FAILED',
      'ACCESS_REQUEST_CREATED', 'ACCESS_REQUEST_CANCELLED', 'ACCESS_REQUEST_APPROVED', 'ACCESS_REQUEST_REJECTED', 'COMPANY_ACCESS_EXPIRED'] as const
    for (const type of types) {
      expect(auditTypes).toContain(type)
      const change = { kind: 'access-flow', eventType: type, entity: type.startsWith('ACCESS_REQUEST_') ? 'request' : 'invitation', flowId: 'flow',
        targetUserId: 'target', rolesBefore: [], rolesAfter: ['EXTERNAL_TAX'], statusBefore: null, statusAfter: 'PENDING', versionBefore: 0, versionAfter: 1,
        expiresAt: '2026-10-12T00:00:00.000Z', revokedSessions: 0, email: 'private-email', token: 'raw-token', tokenHash: 'private-hash', password: 'raw-password' }
      await new AuditService().record(tx, { type, requestId: 'r', actorId: 'a', companyId: 'c', change } as never)
      await expect(new AuditService().record(tx, { type, requestId: 'r', actorId: 'a', companyId: 'c', change: { ...change, eventType: 'LOGIN_SUCCEEDED' } } as never)).rejects.toThrow('Invalid access flow')
    }
    expect(create).toHaveBeenCalledTimes(10); expect(JSON.stringify(create.mock.calls)).not.toMatch(/private-email|raw-token|private-hash|raw-password/)
    await expect(new AuditService().record(tx, { type: 'ACCESS_REQUEST_APPROVED', requestId: 'r', actorId: 'a', companyId: 'c',
      change: { kind: 'access-flow', eventType: 'ACCESS_REQUEST_APPROVED', entity: 'invitation' } } as never)).rejects.toThrow()
  })
  it('accepts each new lifecycle event without copying email, token or password fields', async () => {
    const create = vi.fn().mockResolvedValue({})
    const tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    for (const type of ['ACCOUNT_REGISTERED', 'EMAIL_VERIFIED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'MAIL_FAILED'] as const) {
      expect(auditTypes).toContain(type)
      await new AuditService().record(tx, { type, requestId: 'r', actorId: 'a', password: 'raw-pwd', email: 'private-email', token: 'raw-token' } as never)
    }
    expect(create).toHaveBeenCalledTimes(5)
    expect(JSON.stringify(create.mock.calls)).not.toMatch(/raw-pwd|private-email|raw-token/)
  })
  it('records only fixed event fields and drops accidental raw credentials', async () => {
    const create = vi.fn().mockResolvedValue({})
    const tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    const input = { type: 'LOGIN_SUCCEEDED' as const, requestId: 'request', actorId: 'actor',
      password: 'sensitive-pass', token: 'sensitive-token', details: { secret: 'sensitive-secret' } }
    await new AuditService().record(tx, input)
    const serialized = JSON.stringify(create.mock.calls)
    expect(serialized).not.toContain('sensitive-')
    expect(create.mock.calls[0][0]).toEqual({ data: { type: 'LOGIN_SUCCEEDED', requestId: 'request', actorId: 'actor', companyId: null, details: {} } })
  })
  it('refuses arbitrary event types and denial reasons before a DB write', async () => {
    const create = vi.fn()
    const tx = { auditEvent: { create } } as unknown as Prisma.TransactionClient
    for (const event of [{ type: 'password=secret', requestId: 'r' }, { type: 'ACCESS_DENIED', requestId: 'r', reason: 'token=secret' }]) {
      await expect(new AuditService().record(tx, event as never)).rejects.toThrow('Invalid audit')
    }
    expect(create).not.toHaveBeenCalled()
  })
  it('propagates persistence failure to its caller for transaction rollback', async () => {
    const tx = { auditEvent: { create: vi.fn().mockRejectedValue(new Error('write failed')) } } as unknown as Prisma.TransactionClient
    await expect(new AuditService().record(tx, { type: 'LOGOUT', requestId: 'r' })).rejects.toThrow('write failed')
  })
})
