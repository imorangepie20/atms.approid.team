import { describe, expect, it } from 'vitest'
import { counterpartyListSchema, createCounterpartySchema, deactivateCounterpartySchema, updateCounterpartySchema } from '../src/counterparties/counterparties.schemas'

const id = 'a1000000-0000-4000-8000-000000000001'
const valid = { creationRequestId: id, name: 'Example', kind: 'BOTH' }
// [F02 C2/C7] 경계 입력은 실제 HTTP와 같은 Zod 스키마로 확인한다.
describe('F02 counterparty input boundary', () => {
  it('normalizes Unicode name, optional blanks and business number without treating validity as a registry lookup', () => {
    expect(createCounterpartySchema.parse({ ...valid, creationRequestId: id.toUpperCase(), name: ' 😀 ', businessNumber: ' 123-45-67890 ',
      contactName: ' ', email: null, phone: ' 010 ', memo: '' })).toMatchObject({ name: '😀', creationRequestId: id, businessNumber: '1234567890', contactName: null, email: null, phone: '010', memo: null })
    expect(createCounterpartySchema.parse({ ...valid, businessNumber: ' ' }).businessNumber).toBeNull()
  })
  it.each([1, 100])('accepts %i Unicode name code points', length => expect(createCounterpartySchema.safeParse({ ...valid, name: '😀'.repeat(length) }).success).toBe(true))
  it.each(['', ' ', '😀'.repeat(101), 'a\0b', '\ud800'])('rejects invalid name boundary', name => expect(createCounterpartySchema.safeParse({ ...valid, name }).success).toBe(false))
  it.each(['123456789', '12345678901', '12-345-67890', '１２３４５６７８９０', '123 45 67890', 1234567890])('rejects invalid business number format', businessNumber => expect(createCounterpartySchema.safeParse({ ...valid, businessNumber }).success).toBe(false))
  it.each([['contactName', 100], ['email', 254], ['phone', 40], ['address', 300], ['memo', 1000]] as const)('enforces %s optional limit %i and valid Unicode', (field, max) => {
    if (field !== 'email') expect(createCounterpartySchema.safeParse({ ...valid, [field]: '😀'.repeat(max) }).success).toBe(true)
    expect(createCounterpartySchema.safeParse({ ...valid, [field]: 'x'.repeat(max + 1) }).success).toBe(false)
    for (const value of ['x\0', '\ud800']) expect(createCounterpartySchema.safeParse({ ...valid, [field]: value }).success).toBe(false)
  })
  it.each(['not-an-email', 'a@', '@example.invalid'])('rejects bad email', email => expect(createCounterpartySchema.safeParse({ ...valid, email }).success).toBe(false))
  it('accepts email syntax and rejects unknown kind and server-owned fields', () => {
    expect(createCounterpartySchema.safeParse({ ...valid, email: 'a@example.invalid' }).success).toBe(true)
    for (const kind of ['customer', 'UNKNOWN', null]) expect(createCounterpartySchema.safeParse({ ...valid, kind }).success).toBe(false)
    for (const field of ['companyId', 'actorId', 'active', 'version', 'creationInputHash', '__proto__']) expect(createCounterpartySchema.safeParse({ ...valid, [field]: 'forged' }).success).toBe(false)
  })
  it.each([0, -1, 1.5, '1', 2147483648, null])('rejects invalid update/deactivate version', version => {
    expect(updateCounterpartySchema.safeParse({ version, name: 'A' }).success).toBe(false)
    expect(deactivateCounterpartySchema.safeParse({ version }).success).toBe(false)
  })
  it('requires a patch field, allows explicit null and rejects lifecycle/unknown values', () => {
    expect(updateCounterpartySchema.safeParse({ version: 1 }).success).toBe(false)
    expect(updateCounterpartySchema.parse({ version: 2147483647, memo: null })).toEqual({ version: 2147483647, memo: null })
    for (const field of ['active', 'creationRequestId', 'companyId', 'id']) expect(updateCounterpartySchema.safeParse({ version: 1, [field]: true }).success).toBe(false)
    expect(deactivateCounterpartySchema.safeParse({ version: 1, active: false }).success).toBe(false)
  })
  it('uses default active/20 and accepts exact bounded query filters', () => {
    expect(counterpartyListSchema.parse({})).toEqual({ active: 'active', limit: 20 })
    expect(counterpartyListSchema.parse({ q: ' abc ', active: 'all', kind: 'SUPPLIER', limit: '100', cursor: id.toUpperCase() })).toEqual({ q: 'abc', active: 'all', kind: 'SUPPLIER', limit: 100, cursor: id })
  })
  it.each(['0', '101', '1.5', '1e2', ' 20', '020', '1000', ['20', '30']])('rejects unsafe limit', limit => expect(counterpartyListSchema.safeParse({ limit }).success).toBe(false))
  it.each([{ q: '' }, { q: 'x'.repeat(101) }, { q: '\0' }, { cursor: 'bad' }, { active: 'true' }, { kind: 'bad' }, { sort: 'name' }, { q: ['a', 'b'] }])('rejects invalid/unknown query %j', query => expect(counterpartyListSchema.safeParse(query).success).toBe(false))
})
