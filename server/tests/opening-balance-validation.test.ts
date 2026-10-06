import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createOpeningBalanceSchema, updateOpeningBalanceSchema } = require('../dist/journals/opening-balance.schemas.js') as typeof import('../src/journals/opening-balance.schemas')
const { normalizeOpeningBalance, openingBalanceCreationHash } = require('../dist/journals/opening-balance.js') as typeof import('../src/journals/opening-balance')

const sourceFiscalYearId = randomUUID(), evidenceId = randomUUID(), debitAccountId = randomUUID(), creditAccountId = randomUUID()
const nonzero = { sourceFiscalYearId, evidenceIds: [evidenceId], lines: [
  { accountId: debitAccountId, debit: '9007199254740993', credit: '0', memo: null },
  { accountId: creditAccountId, debit: '0', credit: '9007199254740993', memo: '  carry forward  ' },
] }

describe('F04-02 opening balance input boundary', () => {
  it('K1/K3 accepts exact balanced won lines and the explicit zero form', () => {
    expect(normalizeOpeningBalance(createOpeningBalanceSchema.parse({ creationRequestId: randomUUID(), ...nonzero })))
      .toMatchObject({ sourceFiscalYearId, evidenceIds: [evidenceId], debitTotal: '9007199254740993',
        creditTotal: '9007199254740993', isZero: false, lines: [{ position: 1 }, { position: 2, memo: 'carry forward' }] })
    expect(normalizeOpeningBalance(createOpeningBalanceSchema.parse({ creationRequestId: randomUUID(),
      sourceFiscalYearId: null, evidenceIds: [], lines: [] })))
      .toEqual({ sourceFiscalYearId: null, evidenceIds: [], lines: [], debitTotal: '0', creditTotal: '0', isZero: true })
  })

  it('K3 rejects partial, unbalanced, unsigned, unsupported-scale and unproved nonzero balances', () => {
    const invalid = [
      { ...nonzero, evidenceIds: [] },
      { ...nonzero, lines: nonzero.lines.slice(0, 1) },
      { ...nonzero, lines: [nonzero.lines[0], { ...nonzero.lines[1], credit: '1' }] },
      { ...nonzero, lines: [{ ...nonzero.lines[0], credit: '1' }, nonzero.lines[1]] },
      { ...nonzero, lines: [{ ...nonzero.lines[0], debit: '-1' }, nonzero.lines[1]] },
      { ...nonzero, lines: [{ ...nonzero.lines[0], debit: '1.5' }, nonzero.lines[1]] },
    ]
    for (const value of invalid) {
      const parsed = createOpeningBalanceSchema.safeParse({ creationRequestId: randomUUID(), ...value })
      if (parsed.success) expect(() => normalizeOpeningBalance(parsed.data)).toThrow(BadRequestException)
      else expect(parsed.success).toBe(false)
    }
  })

  it('K5 enforces strict identifiers, unique evidence and positive update versions', () => {
    expect(createOpeningBalanceSchema.safeParse({ creationRequestId: randomUUID(), ...nonzero, extra: true }).success).toBe(false)
    expect(createOpeningBalanceSchema.safeParse({ creationRequestId: 'bad', ...nonzero }).success).toBe(false)
    expect(createOpeningBalanceSchema.safeParse({ creationRequestId: randomUUID(), ...nonzero,
      evidenceIds: [evidenceId, evidenceId] }).success).toBe(false)
    expect(updateOpeningBalanceSchema.safeParse({ version: 0, ...nonzero }).success).toBe(false)
    expect(updateOpeningBalanceSchema.safeParse({ version: 1, ...nonzero }).success).toBe(true)
  })

  it('K5 makes the creation hash stable after canonical evidence ordering', () => {
    const secondEvidence = randomUUID()
    const a = normalizeOpeningBalance({ ...nonzero, evidenceIds: [evidenceId, secondEvidence] })
    const b = normalizeOpeningBalance({ ...nonzero, evidenceIds: [secondEvidence, evidenceId] })
    expect(openingBalanceCreationHash(randomUUID(), a)).not.toBe(openingBalanceCreationHash(randomUUID(), a))
    expect(a).toEqual(b)
    expect(openingBalanceCreationHash(sourceFiscalYearId, a)).toBe(openingBalanceCreationHash(sourceFiscalYearId, b))
  })
})
