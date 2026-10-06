import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { COMPANY_CONFIG, MONEY_CONFIG } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const { createCompanySchema, renameCompanySchema, addFiscalYearSchema, companyListSchema, selectCompanySchema } = require('../dist/companies/companies.schemas.js') as typeof import('../src/companies/companies.schemas')
const input = () => ({ creationRequestId: randomUUID(), name: '회사', startDate: '2024-01-01', endDate: '2024-12-31' })

// [F01 입력 계약] 단순 구현 복제가 아닌 Unicode/윤년/기간/과다 필드/쿼리의 외부 입력 경계를 검증한다.
describe('F01 company validation', () => {
  it('centralizes approved limits and preserves money currency', () => {
    expect(COMPANY_CONFIG).toEqual({ nameMin: 1, nameMax: 200, listDefault: 25, listMax: 100, fiscalYearMaxDays: 366,
      accountingStandard: 'K_GAAP', currency: MONEY_CONFIG.currency, defaultStartMonth: 1, defaultStartDay: 1, defaultEndMonth: 12, defaultEndDay: 31 })
    expect(Object.isFrozen(COMPANY_CONFIG)).toBe(true)
  })
  it('counts Unicode code points, trims name edges and rejects malformed Unicode', () => {
    expect(createCompanySchema.parse({ ...input(), name: '  😀'.trim() + '😀'.repeat(199) + '  ' }).name).toBe('😀'.repeat(200))
    for (const name of ['😀'.repeat(201), ' \t\n ', '\ud800', 'a\0b']) expect(createCompanySchema.safeParse({ ...input(), name }).success).toBe(false)
  })
  it.each(['2023-02-29', '2024-02-30', '2024-13-01', '2024-00-01', '2024-01-00', '2024-1-01', '0000-01-01', '2024-01-01T00:00:00Z'])('rejects non-calendar date %s', startDate => {
    expect(createCompanySchema.safeParse({ ...input(), startDate }).success).toBe(false)
  })
  it('accepts leap year, short year, AD low years and exact inclusive day boundary', () => {
    for (const [startDate, endDate] of [['2024-01-01', '2024-12-31'], ['2024-02-29', '2024-02-29'], ['0001-01-01', '0001-01-01'], ['2023-01-01', '2024-01-01']]) {
      expect(createCompanySchema.safeParse({ ...input(), startDate, endDate }).success).toBe(true)
    }
    for (const [startDate, endDate] of [['2024-01-01', '2025-01-01'], ['2024-01-02', '2024-01-01']]) {
      expect(createCompanySchema.safeParse({ ...input(), startDate, endDate }).success).toBe(false)
      expect(addFiscalYearSchema.safeParse({ startDate, endDate, version: 1 }).success).toBe(false)
    }
  })
  it.each(['creatorId', 'roles', 'currency', 'allowSelfApproval', 'version'])('rejects forged creation field %s', key => {
    expect(createCompanySchema.safeParse({ ...input(), [key]: 'forged' }).success).toBe(false)
  })
  it('requires explicit dates, request UUID and strict empty selection', () => {
    expect(createCompanySchema.safeParse({ name: '회사', creationRequestId: randomUUID() }).success).toBe(false)
    expect(createCompanySchema.safeParse({ ...input(), creationRequestId: 'bad' }).success).toBe(false)
    expect(selectCompanySchema.parse({})).toEqual({})
    expect(selectCompanySchema.safeParse({ companyId: randomUUID() }).success).toBe(false)
    const id = randomUUID()
    expect(createCompanySchema.parse({ ...input(), creationRequestId: id.toUpperCase() }).creationRequestId).toBe(id)
  })
  it.each([0, -1, 1.1, '1', 2147483648])('rejects invalid mutation version %s', version => {
    expect(renameCompanySchema.safeParse({ name: '회사', version }).success).toBe(false)
    expect(addFiscalYearSchema.safeParse({ startDate: '2026-01-01', endDate: '2026-12-31', version }).success).toBe(false)
  })
  it('validates list defaults, limit boundaries, cursor shape and unknown query fields', () => {
    expect(companyListSchema.parse({})).toEqual({ limit: 25 })
    expect(companyListSchema.parse({ limit: '100', cursor: randomUUID() }).limit).toBe(100)
    for (const limit of ['0', '101', '1e2', '1.0', ' 25', '01', ['1', '2'], 1]) expect(companyListSchema.safeParse({ limit }).success).toBe(false)
    expect(companyListSchema.safeParse({ cursor: 'bad' }).success).toBe(false)
    expect(companyListSchema.safeParse({ roles: 'COMPANY_ADMIN' }).success).toBe(false)
  })
})
