import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { changeMemberRolesSchema, deactivateMemberSchema, memberListSchema, membershipIdSchema } = require('../dist/companies/company-members.schemas.js') as typeof import('../src/companies/company-members.schemas')
const { COMPANY_CONFIG } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
describe('F01 member input contract', () => {
  it('accepts exactly the five known roles and normalizes set order', () => {
    const roles = ['READ_ONLY', 'EXTERNAL_TAX', 'COMPANY_ADMIN', 'APPROVER', 'ACCOUNTANT']
    expect(changeMemberRolesSchema.parse({ roles, version: 1 }).roles).toEqual([...roles].sort())
  })
  it.each([[], ['READ_ONLY', 'READ_ONLY'], ['UNKNOWN'], ['company.members.manage'], ['company_admin'], ['READ_ONLY', 'UNKNOWN'], 'COMPANY_ADMIN', null])('rejects invalid roles %j', roles => {
    expect(changeMemberRolesSchema.safeParse({ roles, version: 1 }).success).toBe(false)
  })
  it.each([0, -1, 1.1, '1', 2147483648])('rejects invalid version %j for both writes', version => {
    expect(changeMemberRolesSchema.safeParse({ roles: ['READ_ONLY'], version }).success).toBe(false)
    expect(deactivateMemberSchema.safeParse({ version }).success).toBe(false)
  })
  it('rejects arbitrary identity, active and privilege fields and missing required input', () => {
    for (const key of ['active', 'userId', 'companyId', 'membershipId', 'permissions', 'allowSelfApproval']) {
      expect(changeMemberRolesSchema.safeParse({ roles: ['READ_ONLY'], version: 1, [key]: 'forged' }).success).toBe(false)
      expect(deactivateMemberSchema.safeParse({ version: 1, [key]: 'forged' }).success).toBe(false)
    }
    expect(changeMemberRolesSchema.safeParse({ roles: ['READ_ONLY'] }).success).toBe(false)
    expect(deactivateMemberSchema.safeParse({}).success).toBe(false)
  })
  it('reuses approved pagination limits and normalized UUIDs', () => {
    expect(memberListSchema.parse({})).toEqual({ limit: COMPANY_CONFIG.listDefault })
    expect(memberListSchema.parse({ limit: String(COMPANY_CONFIG.listMax) }).limit).toBe(100)
    const id = randomUUID(); expect(membershipIdSchema.parse(id.toUpperCase())).toBe(id)
    for (const input of [{ limit: '101' }, { limit: '0' }, { limit: ['1', '2'] }, { cursor: 'bad' }, { userId: id }]) expect(memberListSchema.safeParse(input).success).toBe(false)
    expect(membershipIdSchema.safeParse('bad-id').success).toBe(false)
  })
})
