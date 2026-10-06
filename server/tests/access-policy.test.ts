import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { hasPermission, canPerform, permissions } = require('../dist/auth/access-policy.js') as typeof import('../src/auth/access-policy')
const { readAuthConfig, AUTH_POLICY } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
describe('F01 access policy', () => {
  it('F05 K2 keeps requester and reviewer permissions separate across five roles', () => {
    expect(hasPermission(['ACCOUNTANT'], 'journal.request')).toBe(true)
    expect(hasPermission(['ACCOUNTANT'], 'journal.approve')).toBe(false)
    expect(hasPermission(['APPROVER'], 'journal.request')).toBe(false)
    expect(hasPermission(['APPROVER'], 'journal.approve')).toBe(true)
    expect(hasPermission(['EXTERNAL_TAX'], 'journal.draft')).toBe(true)
    expect(hasPermission(['EXTERNAL_TAX'], 'journal.request')).toBe(false)
    expect(hasPermission(['READ_ONLY'], 'journal.request')).toBe(false)
    expect(hasPermission(['ACCOUNTANT', 'APPROVER'], 'journal.request')).toBe(true)
    expect(hasPermission(['COMPANY_ADMIN'], 'journal.approve')).toBe(true)
  })
  const rules = { stateAllowed: true, userId: 'writer', authorId: 'other', allowSelfApproval: false }
  // [F04-01 승인 A2/K2] 새 관리 권한은 회계 쓰기와 별개다. 기존 역할의 허용 범위도 아래 회귀시험으로 유지한다.
  it.each(['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'])('account permissions for %s', role => {
    expect(hasPermission([role], 'accounts.read')).toBe(true)
    expect(hasPermission([role], 'accounts.manage')).toBe(role === 'COMPANY_ADMIN')
    expect(canPerform([role], 'accounts.manage', { ...rules, stateAllowed: false })).toBe(false)
  })
  it('unions account roles without granting management through accountant or approver roles', () => {
    expect(hasPermission(['READ_ONLY', 'COMPANY_ADMIN'], 'accounts.manage')).toBe(true)
    expect(hasPermission(['ACCOUNTANT', 'APPROVER', 'EXTERNAL_TAX'], 'accounts.manage')).toBe(false)
    expect(hasPermission(['__proto__'], 'accounts.read')).toBe(false)
  })
  // [F02 C4] 모든 역할의 조회와 세 쓰기 역할, 겸임 합산 및 기존 공통 제한을 검증한다.
  it.each(['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'])('counterparty permission for %s', role => {
    expect(hasPermission([role], 'counterparties.read')).toBe(true)
    expect(hasPermission([role], 'counterparties.write')).toBe(['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role))
    expect(canPerform([role], 'counterparties.write', { ...rules, stateAllowed: false })).toBe(false)
  })
  it('unions counterparty writer role without canceling it for READ_ONLY', () => {
    expect(hasPermission(['READ_ONLY', 'ACCOUNTANT'], 'counterparties.write')).toBe(true)
    expect(hasPermission(['APPROVER', 'READ_ONLY'], 'counterparties.write')).toBe(false)
  })
  it.each([
    ['ACCOUNTANT', 'journal.draft', true], ['ACCOUNTANT', 'journal.approve', false],
    ['APPROVER', 'journal.confirm', true], ['APPROVER', 'closing.reopen', false],
    ['READ_ONLY', 'reports.read', true], ['READ_ONLY', 'evidence.create', false],
    ['EXTERNAL_TAX', 'journal.draft', true], ['EXTERNAL_TAX', 'journal.request', false],
    ['EXTERNAL_TAX', 'company.manage', false], ['EXTERNAL_TAX', 'correction.draft', false],
    ['COMPANY_ADMIN', 'closing.reopen', true], ['__proto__', 'company.manage', false],
  ])('%s / %s returns %s', (role, permission, allowed) => expect(hasPermission([role as string], permission as string)).toBe(allowed))
  it('includes accountant and approver permissions for administrator', () => {
    for (const permission of permissions) expect(hasPermission(['COMPANY_ADMIN'], permission)).toBe(true)
  })
  it('unions roles and refuses unknown permissions', () => {
    expect(hasPermission(['READ_ONLY', 'ACCOUNTANT'], 'journal.draft')).toBe(true)
    expect(hasPermission(['COMPANY_ADMIN'], 'rules.global.approve')).toBe(false)
    expect(hasPermission([], 'company.read')).toBe(false)
  })
  it('requires independent approval, known author and valid business state before allowing work', () => {
    expect(canPerform(['COMPANY_ADMIN'], 'journal.approve', rules)).toBe(true)
    expect(canPerform(['ACCOUNTANT', 'APPROVER'], 'journal.approve', { ...rules, authorId: 'writer' })).toBe(false)
    expect(canPerform(['APPROVER'], 'journal.approve', { ...rules, authorId: 'writer', allowSelfApproval: true })).toBe(true)
    expect(canPerform(['READ_ONLY'], 'journal.approve', { ...rules, allowSelfApproval: true })).toBe(false)
    expect(canPerform(['COMPANY_ADMIN'], 'journal.approve', { ...rules, authorId: undefined })).toBe(false)
    expect(canPerform(['COMPANY_ADMIN'], 'journal.draft', { ...rules, stateAllowed: false })).toBe(false)
  })
  it('keeps approved time, rate and Argon2 cost policies in a single configuration', () => {
    expect(AUTH_POLICY).toMatchObject({ idleMs: 3600000, absoluteMs: 28800000, reauthMs: 300000,
      loginWindowMs: 900000, accountFailures: 5, accountWaitMs: 900000, ipRequests: 30,
      argonMemoryKiB: 19456, argonIterations: 2, argonParallelism: 1 })
  })
  it('requires explicit HTTPS production origin and separates local development cookies', () => {
    expect(readAuthConfig({ NODE_ENV: 'production', AUTH_WEB_ORIGIN: 'https://atms.approid.team' })).toEqual({
      origin: 'https://atms.approid.team', secure: true, cookieName: '__Host-atms_session' })
    expect(readAuthConfig({ NODE_ENV: 'development' }).secure).toBe(false)
    for (const input of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', AUTH_WEB_ORIGIN: 'http://localhost:4173' },
      { AUTH_WEB_ORIGIN: 'http://example.com' }, { HOST: '0.0.0.0', AUTH_WEB_ORIGIN: 'http://localhost:4173' }, { AUTH_WEB_ORIGIN: 'https://example.com/path' },
      { AUTH_WEB_ORIGIN: 'https://user:pass@example.com' }]) expect(() => readAuthConfig(input)).toThrow('Invalid authentication origin')
  })
})
