import { describe, expect, it } from 'vitest'
import { accountListSchema, createAccountSchema, deactivateAccountSchema, updateAccountSchema } from '../src/accounts/accounts.schemas'

const id = 'a1000000-0000-4000-8000-000000000001'
const valid = { creationRequestId: id, code: '1100', name: '현금', category: 'ASSET', normalBalance: 'DEBIT' }
// [F04-01 K1] 실제 HTTP와 같은 스키마로 금지 입력/경계와 정규화를 확인한다.
describe('F04 account validation', () => {
  it('normalizes UUID, ASCII code and Unicode name while preserving an explicit contra balance', () => {
    expect(createAccountSchema.parse({ ...valid, creationRequestId: id.toUpperCase(), code: ' a-1_ ', name: ' 😀 ', normalBalance: 'CREDIT' }))
      .toEqual({ ...valid, code: 'A-1_', name: '😀', normalBalance: 'CREDIT' })
  })
  it.each(['', ' ', 'a b', '１２', 'x'.repeat(21), 'a\0b', 'a.b', 'é', 'ß', 'ﬀ', 100])('rejects invalid code %j', code =>
    expect(createAccountSchema.safeParse({ ...valid, code }).success).toBe(false))
  it.each([1, 20])('accepts code length %i', length => expect(createAccountSchema.safeParse({ ...valid, code: 'A'.repeat(length) }).success).toBe(true))
  it.each([1, 100])('accepts Unicode name length %i', length => expect(createAccountSchema.safeParse({ ...valid, name: '😀'.repeat(length) }).success).toBe(true))
  it.each(['', ' ', '😀'.repeat(101), '\ud800', 'a\0b', null])('rejects invalid name', name => expect(createAccountSchema.safeParse({ ...valid, name }).success).toBe(false))
  it.each(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])('accepts category %s with either explicit balance', category => {
    for (const normalBalance of ['DEBIT', 'CREDIT']) expect(createAccountSchema.safeParse({ ...valid, category, normalBalance }).success).toBe(true)
  })
  it('requires both classification fields and forbids server-owned or unknown input', () => {
    for (const data of [{ ...valid, category: 'asset' }, { ...valid, normalBalance: 'debit' }, { ...valid, creationRequestId: 'bad' },
      { ...valid, category: undefined }, { ...valid, normalBalance: undefined }]) expect(createAccountSchema.safeParse(data).success).toBe(false)
    for (const key of ['companyId', 'actorId', 'active', 'version', 'sourceTemplateItemId', 'creationInputHash', '__proto__'])
      expect(createAccountSchema.safeParse({ ...valid, [key]: 'forged' }).success).toBe(false)
  })
  it.each([0, -1, 1.5, '1', 2147483648, null])('rejects version %j', version => {
    expect(updateAccountSchema.safeParse({ version, name: 'A' }).success).toBe(false)
    expect(deactivateAccountSchema.safeParse({ version }).success).toBe(false)
  })
  it('requires a patch field and classification pair; code/lifecycle fields cannot be patched', () => {
    expect(updateAccountSchema.parse({ version: 2147483647, category: 'ASSET', normalBalance: 'CREDIT' })).toMatchObject({ normalBalance: 'CREDIT' })
    for (const data of [{ version: 1 }, { version: 1, category: 'ASSET' }, { version: 1, normalBalance: 'DEBIT' }, { version: 1, category: null, normalBalance: null }])
      expect(updateAccountSchema.safeParse(data).success).toBe(false)
    for (const key of ['code', 'active', 'creationRequestId', 'companyId', 'id']) expect(updateAccountSchema.safeParse({ version: 1, [key]: 'forged' }).success).toBe(false)
    expect(deactivateAccountSchema.safeParse({ version: 1, active: false }).success).toBe(false)
  })
  it('uses bounded default pagination and normalized filters', () => {
    expect(accountListSchema.parse({})).toEqual({ active: 'active', limit: 20 })
    expect(accountListSchema.parse({ q: ' abc ', category: 'EXPENSE', active: 'all', limit: '100', cursor: id.toUpperCase() }))
      .toEqual({ q: 'abc', category: 'EXPENSE', active: 'all', limit: 100, cursor: id })
  })
  it.each(['0', '101', '1.5', '1e2', ' 20', '020', '1000', ['20', '30']])('rejects unsafe list limit', limit => expect(accountListSchema.safeParse({ limit }).success).toBe(false))
  it.each([{ q: '' }, { q: 'x'.repeat(101) }, { q: '\0' }, { cursor: 'bad' }, { active: 'true' }, { category: 'bad' }, { sort: 'name' }, { q: ['a', 'b'] }])
    ('rejects invalid query %j', query => expect(accountListSchema.safeParse(query).success).toBe(false))
})
