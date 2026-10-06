import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { changeSelfApprovalSchema, companyIdSchema } = require('../dist/companies/companies.schemas.js') as typeof import('../src/companies/companies.schemas')

// [F01 설정 입력 검증] 서버가 정한 역할/회사/처리자를 본문으로 덮어쓸 수 없는지와 자동 형변환 배제를 확인한다.
describe('F01 company self approval input contract', () => {
  it.each([true, false])('accepts Boolean %j and a positive version', allowSelfApproval => {
    expect(changeSelfApprovalSchema.parse({ allowSelfApproval, version: 1 })).toEqual({ allowSelfApproval, version: 1 })
  })
  it.each(['true', 'false', 1, 0, null, [], {}])('refuses non-Boolean %j', allowSelfApproval => {
    expect(changeSelfApprovalSchema.safeParse({ allowSelfApproval, version: 1 }).success).toBe(false)
  })
  it.each([0, -1, 1.5, '1', 2147483648, null])('refuses invalid version %j', version => {
    expect(changeSelfApprovalSchema.safeParse({ allowSelfApproval: true, version }).success).toBe(false)
  })
  it.each([{}, { version: 1 }, { allowSelfApproval: true }, { allowSelfApproval: true, version: 1, roles: ['COMPANY_ADMIN'] },
    { allowSelfApproval: true, version: 1, companyId: 'foreign' }, { allowSelfApproval: true, version: 1, actorId: 'foreign' }])('refuses missing or excessive fields %j', input => {
    expect(changeSelfApprovalSchema.safeParse(input).success).toBe(false)
  })
  it('accepts INTEGER ceiling for service no-op handling and rejects malformed UUIDs', () => {
    expect(changeSelfApprovalSchema.safeParse({ allowSelfApproval: false, version: 2147483647 }).success).toBe(true)
    expect(companyIdSchema.safeParse('foreign').success).toBe(false)
  })
})
