import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { createJournalSchema, updateJournalSchema, journalListSchema, evidenceJournalListSchema } = require('../dist/journals/journals.schemas.js') as typeof import('../src/journals/journals.schemas')
const { normalizeJournal, journalCreationHash } = require('../dist/journals/journal-draft.js') as typeof import('../src/journals/journal-draft')
const account = randomUUID(), year = randomUUID()
const input = () => ({ creationRequestId: randomUUID(), fiscalYearId: year, accountingDate: '2026-10-07', memo: ' Draft ', counterpartyId: null,
  evidenceIds: [] as string[], lines: [{ accountId: account, debit: '1234', credit: '0' }, { accountId: account, debit: '0', credit: '1234' }] })

describe('journal draft validation', () => {
  it('K3 normalizes UTF-8 text and exact amounts above Number precision without guessing account direction', () => {
    const value = input(); value.lines[0].debit = '9007199254740993'; value.lines[1].credit = '9007199254740993'
    const normalized = normalizeJournal(createJournalSchema.parse(value))
    expect(normalized.debitTotal).toBe('9007199254740993'); expect(normalized.creditTotal).toBe(normalized.debitTotal)
    expect(normalized.memo).toBe('Draft'); expect(normalized.lines.map(l => l.position)).toEqual([1, 2])
  })
  it.each(['1.0','1.5','1e3','01','+1','1,000',' 1','NaN','Infinity','1000000000000000000',1234,null])('K3 refuses invalid original amount %s before Decimal/DB conversion', value => {
    const body = input(); body.lines[0].debit = value as never
    expect(createJournalSchema.safeParse(body).success).toBe(false)
  })
  it.each([['-1','0'],['0','0'],['1','1'],['1233','0']])('K3 refuses negative, zero, double-sided or unbalanced lines %s/%s', (debit, credit) => {
    const value = input(); value.lines[0] = { ...value.lines[0], debit, credit }
    expect(() => normalizeJournal(createJournalSchema.parse(value))).toThrow()
  })
  it('K3 refuses a total beyond NUMERIC range and accepts the exact upper integer', () => {
    const value = input(); value.lines[0].debit = '999999999999999999'; value.lines[1].credit = value.lines[0].debit
    expect(normalizeJournal(createJournalSchema.parse(value)).debitTotal).toBe(value.lines[0].debit)
    value.lines.push({ accountId: account, debit: '1', credit: '0' }, { accountId: account, debit: '0', credit: '1' })
    expect(() => normalizeJournal(createJournalSchema.parse(value))).toThrow()
  })
  it.each([0,1,101])('K3 refuses %s lines', count => {
    expect(createJournalSchema.safeParse({ ...input(), lines: Array.from({ length: count }, () => input().lines[0]) }).success).toBe(false)
  })
  it('K3 accepts one hundred ordered lines and code-point bounded text', () => {
    const body = { ...input(), memo: '😀'.repeat(500), lines: Array.from({ length: 100 }, (_, i) => input().lines[i % 2]) }
    expect(normalizeJournal(createJournalSchema.parse(body)).lines).toHaveLength(100)
    expect(createJournalSchema.safeParse({ ...body, memo: '😀'.repeat(501) }).success).toBe(false)
  })
  it.each(['',' ','x\0y','\ud800'])('K3 rejects invalid memo %s', memo => {
    expect(createJournalSchema.safeParse({ ...input(), memo }).success).toBe(false)
  })
  it.each(['2026-02-30','0000-01-01','2026-1-01','2026-01-01T00:00:00Z'])('K2 rejects non-date input %s', accountingDate => {
    expect(createJournalSchema.safeParse({ ...input(), accountingDate }).success).toBe(false)
  })
  it('K4 rejects duplicate or more than twenty evidence IDs and requires explicit optional references', () => {
    const id = randomUUID(), body = input()
    expect(createJournalSchema.safeParse({ ...body, evidenceIds: [id, id] }).success).toBe(false)
    expect(createJournalSchema.safeParse({ ...body, evidenceIds: Array.from({ length: 21 }, () => randomUUID()) }).success).toBe(false)
    const { counterpartyId: _party, ...noParty } = body; expect(createJournalSchema.safeParse(noParty).success).toBe(false)
    const { evidenceIds: _evidence, ...noEvidence } = body; expect(createJournalSchema.safeParse(noEvidence).success).toBe(false)
  })
  it.each(['companyId','number','currency','createdById','status','version','debitTotal','creationInputHash'])('K1 rejects forged creation field %s', field => {
    expect(createJournalSchema.safeParse({ ...input(), [field]: 'forged' }).success).toBe(false)
  })
  it('K5 compares evidence as a set but preserves meaningful line order and fiscal year', () => {
    const body = input(); body.evidenceIds = [randomUUID(), randomUUID()]
    const first = normalizeJournal(createJournalSchema.parse(body))
    const reordered = normalizeJournal(createJournalSchema.parse({ ...body, evidenceIds: [...body.evidenceIds].reverse() }))
    expect(journalCreationHash(year, first)).toBe(journalCreationHash(year, reordered))
    const swapped = normalizeJournal(createJournalSchema.parse({ ...body, lines: [...body.lines].reverse() }))
    expect(journalCreationHash(year, first)).not.toBe(journalCreationHash(year, swapped))
    expect(journalCreationHash(year, first)).not.toBe(journalCreationHash(randomUUID(), first))
  })
  it('K5 requires version and complete editable content while rejecting immutable fields', () => {
    const { fiscalYearId: _year, creationRequestId: _request, ...body } = input()
    expect(updateJournalSchema.safeParse({ ...body, version: 1 }).success).toBe(true)
    for (const version of [0,1.5,2147483648,'1']) expect(updateJournalSchema.safeParse({ ...body, version }).success).toBe(false)
    expect(updateJournalSchema.safeParse({ ...body, version: 1, fiscalYearId: year }).success).toBe(false)
    expect(updateJournalSchema.safeParse({ version: 1, memo: 'partial' }).success).toBe(false)
  })
  it('K2 validates inclusive range, strict cursor and page limits including reverse lookup', () => {
    expect(journalListSchema.parse({}).limit).toBe(20)
    expect(journalListSchema.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(false)
    for (const limit of ['0','101','1e2',' 20','1.5']) expect(journalListSchema.safeParse({ limit }).success).toBe(false)
    expect(journalListSchema.safeParse({ cursor: 'bad' }).success).toBe(false)
    expect(evidenceJournalListSchema.safeParse({ q: 'forbidden' }).success).toBe(false)
  })
})
