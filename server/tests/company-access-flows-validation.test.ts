import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { invitationCreateSchema, invitationAcceptSchema, accessRequestCreateSchema, accessFlowVersionSchema, accessFlowListSchema, accessFlowIdSchema } = require('../dist/companies/company-access-flows.schemas.js') as typeof import('../src/companies/company-access-flows.schemas')
const { COMPANY_ACCESS_POLICY, AUTH_POLICY, COMPANY_CONFIG } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const { invitationMessage } = require('../dist/mail/mail.templates.js') as typeof import('../src/mail/mail.templates')
describe('F01 access flow input contract', () => {
  it('accepts the exact five-role set and normalizes role order', () => {
    expect(invitationCreateSchema.parse({ email: 'Target@EXAMPLE.INVALID', roles: ['READ_ONLY', 'COMPANY_ADMIN', 'APPROVER', 'EXTERNAL_TAX', 'ACCOUNTANT'] }).roles)
      .toEqual(['ACCOUNTANT', 'APPROVER', 'COMPANY_ADMIN', 'EXTERNAL_TAX', 'READ_ONLY'])
  })
  it.each([
    { email: 'target@example.invalid', roles: [] }, { email: 'target@example.invalid', roles: ['READ_ONLY', 'READ_ONLY'] },
    { email: 'target@example.invalid', roles: ['OWNER'] }, { email: 'not-an-email', roles: ['READ_ONLY'] },
    { email: 'target@example.invalid', roles: ['READ_ONLY'], companyId: 'spoof' },
    { email: 'target@example.invalid', roles: ['READ_ONLY'], active: true },
  ])('rejects forged or malformed invitation %j', body => { expect(invitationCreateSchema.safeParse(body).success).toBe(false) })
  it('accepts only an empty request body', () => {
    expect(accessRequestCreateSchema.parse({})).toEqual({})
    for (const value of [{ roles: ['COMPANY_ADMIN'] }, { userId: 'spoof' }, { status: 'APPROVED' }, null, []]) expect(accessRequestCreateSchema.safeParse(value).success).toBe(false)
  })
  it.each(['A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'token=secret'])('rejects invalid token %s', token => {
    expect(invitationAcceptSchema.safeParse({ token }).success).toBe(false)
  })
  it('accepts lowercase hex token without accepting extra fields', () => {
    expect(invitationAcceptSchema.parse({ token: 'a'.repeat(64) })).toEqual({ token: 'a'.repeat(64) })
    expect(invitationAcceptSchema.safeParse({ token: 'a'.repeat(64), email: 'spoof' }).success).toBe(false)
  })
  it.each([0, -1, 1.5, '1', 2147483648])('rejects out-of-contract version %j', version => {
    expect(accessFlowVersionSchema.safeParse({ version }).success).toBe(false)
  })
  it('keeps integer maximum and strict version input', () => {
    expect(accessFlowVersionSchema.parse({ version: 2147483647 })).toEqual({ version: 2147483647 })
    expect(accessFlowVersionSchema.safeParse({ version: 1, status: 'APPROVED' }).success).toBe(false)
  })
  it('uses central list limits and same-scope UUID cursors', () => {
    expect(accessFlowListSchema.parse({}).limit).toBe(COMPANY_CONFIG.listDefault)
    expect(accessFlowListSchema.parse({ limit: '100' }).limit).toBe(COMPANY_CONFIG.listMax)
    for (const query of [{ limit: '101' }, { limit: '1e2' }, { cursor: 'spoof' }, { offset: '1' }]) expect(accessFlowListSchema.safeParse(query).success).toBe(false)
    expect(accessFlowIdSchema.parse('ABCDEF00-1234-4000-8000-123456789ABC')).toBe('abcdef00-1234-4000-8000-123456789abc')
  })
  it('keeps approved seven-day and shared request-window settings', () => {
    expect(COMPANY_ACCESS_POLICY.invitationMs).toBe(604800000); expect(COMPANY_ACCESS_POLICY.requestMs).toBe(604800000)
    expect(COMPANY_ACCESS_POLICY.requestWindowMs).toBe(AUTH_POLICY.emailWindowMs)
    expect(COMPANY_ACCESS_POLICY.requestUserRequests).toBe(3); expect(COMPANY_ACCESS_POLICY.requestIpRequests).toBe(20)
    expect(Object.isFrozen(COMPANY_ACCESS_POLICY)).toBe(true)
  })
  it('keeps token in an origin-bound fragment and central expiry in a text-only message', () => {
    const token = 'a'.repeat(64), message = invitationMessage('target@example.invalid', 'https://atms.approid.team', token)
    expect(message.text).toContain('7일'); expect(message).not.toHaveProperty('html')
    const url = new URL(message.text.split('\n')[1]); expect(url.origin).toBe('https://atms.approid.team')
    expect(url.pathname).toBe('/accept-company-invitation'); expect(url.search).toBe(''); expect(url.hash).toBe('#token=' + token)
  })
})
