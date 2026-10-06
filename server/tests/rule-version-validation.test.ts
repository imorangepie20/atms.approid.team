import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { ruleApplicationListSchema } = require('../dist/rules/rules.schemas.js') as typeof import('../src/rules/rules.schemas')

describe('F13 rule application query contract', () => {
  it('uses the approved pagination default and accepts an exact calendar date', () => {
    expect(ruleApplicationListSchema.parse({})).toEqual({ limit: 25 })
    expect(ruleApplicationListSchema.parse({ asOf: '2026-02-28' })).toEqual({ asOf: '2026-02-28', limit: 25 })
    expect(ruleApplicationListSchema.parse({ asOf: '2024-02-29', limit: '100', cursor: randomUUID() }).limit).toBe(100)
  })
  it.each(['2026-02-29', '2026-13-01', '2026-00-01', '2026-1-01', '0000-01-01', '2026-01-01T00:00:00Z'])('rejects non-calendar asOf %s', asOf => {
    expect(ruleApplicationListSchema.safeParse({ asOf }).success).toBe(false)
  })
  it.each(['0', '101', '1e2', '1.0', ' 25', '01', ['1', '2'], 1])('rejects malformed limit %j', limit => {
    expect(ruleApplicationListSchema.safeParse({ limit }).success).toBe(false)
  })
  it('normalizes UUID cursors and rejects malformed or excessive query fields', () => {
    const id = randomUUID()
    expect(ruleApplicationListSchema.parse({ cursor: id.toUpperCase() }).cursor).toBe(id)
    expect(ruleApplicationListSchema.safeParse({ cursor: 'bad' }).success).toBe(false)
    expect(ruleApplicationListSchema.safeParse({ ruleSetId: id }).success).toBe(false)
    expect(ruleApplicationListSchema.safeParse({ domain: 'TAX' }).success).toBe(false)
  })
})
