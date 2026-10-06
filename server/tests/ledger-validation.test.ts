import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { journalBookSchema, accountLedgerSchema } = require('../dist/journals/ledger.schemas.js') as typeof import('../src/journals/ledger.schemas')

describe('F04-08~10 ledger input boundary', () => {
  it('K5/K6 accepts bounded date, cutoff, account and paging filters', () => {
    const accountId = randomUUID(), fiscalYearId = randomUUID()
    expect(journalBookSchema.parse({ accountId, from: '2026-01-01', to: '2026-12-31',
      postedThrough: '2026-10-07T03:04:05.006Z', limit: '100', q: '  현금  ' }))
      .toEqual({ accountId, from: '2026-01-01', to: '2026-12-31', postedThrough: '2026-10-07T03:04:05.006Z', limit: 100, q: '현금' })
    expect(accountLedgerSchema.parse({ fiscalYearId })).toEqual({ fiscalYearId, limit: 20 })
    expect(accountLedgerSchema.safeParse({}).success).toBe(false)
  })

  it('K5/K6 rejects unknown keys, malformed UTC/cursor/UUID and inverted ranges', () => {
    for (const input of [{ extra: 'x' }, { accountId: 'bad' }, { limit: '0' }, { limit: '101' },
      { from: '2026-12-01', to: '2026-01-01' }, { postedThrough: '2026-10-07T03:04:05Z' },
      { postedThrough: '2026-02-30T03:04:05.006Z' },
      { postedThrough: '2026-10-07T03:04:05.006+09:00' }, { cursor: 'bad=' }, { q: '' }, { q: 'x\0y' }])
      expect(journalBookSchema.safeParse(input).success).toBe(false)
    expect(accountLedgerSchema.safeParse({ fiscalYearId: 'bad' }).success).toBe(false)
  })
})
