import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { config as loadEnv } from 'dotenv'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { readAppConfig, AUTH_POLICY } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const argon2 = require('argon2') as typeof import('argon2')

const server = fileURLToPath(new URL('../', import.meta.url)), origin = 'http://127.0.0.1:4173'
const password = 'isolated opening balance passphrase', fixedDate = new Date('2026-10-07T00:00:00Z')
let originalUrl = '', databaseName = '', created = false, address = ''
let admin: InstanceType<typeof PrismaClient>, db: InstanceType<typeof PrismaClient>, app: INestApplication
let company: { id: string }, user: { id: string; email: string }, membership: { id: string }
let year2025: { id: string }, year2026: { id: string }, year2027: { id: string }, year2028: { id: string }
let debit: { id: string }, credit: { id: string }, evidence: { id: string }
type Login = { cookie: string; csrf: string }
let session: Login

async function snapshotBase() {
  const tables = await admin.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
  const out: Record<string, unknown> = {}
  for (const { tablename } of tables) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unknown base table')
    out[tablename] = await admin.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${tablename}" t`)
  }
  return out
}
let baseBefore: unknown

async function request(url: string, options: { method?: string; login?: Login; body?: unknown; csrf?: string } = {}) {
  const method = options.method ?? 'GET', headers: Record<string, string> = {}
  if (method !== 'GET') { headers.origin = origin; headers['content-type'] = 'application/json' }
  if (options.login) { headers.cookie = options.login.cookie; headers['x-csrf-token'] = options.csrf ?? options.login.csrf }
  const response = await fetch(address + url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}) })
  return { status: response.status, headers: response.headers, data: await response.json() as Record<string, any> }
}
async function login(): Promise<Login> {
  const response = await request('/api/auth/login', { method: 'POST', body: { email: user.email, password } })
  expect(response.status).toBe(200)
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: response.data.csrfToken }
}
const path = (yearId: string) => `/api/companies/${company.id}/fiscal-years/${yearId}/opening-balance`
const nonzero = (sourceFiscalYearId: string | null, creationRequestId = randomUUID()) => ({ creationRequestId,
  sourceFiscalYearId, evidenceIds: [evidence.id], lines: [
    { accountId: debit.id, debit: '9007199254740993', credit: '0', memo: null },
    { accountId: credit.id, debit: '0', credit: '9007199254740993', memo: 'carry forward' },
  ] })

beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true }); originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms')
    throw new Error('Expected local isolated atms database source')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) }); baseBefore = await snapshotBase()
  databaseName = `atms_verify_opening_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_opening_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Unsafe isolated DB name')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true
  url.pathname = '/' + databaseName; process.env.DATABASE_URL = url.toString(); process.env.AUTH_WEB_ORIGIN = origin
  execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: server, env: process.env, stdio: 'pipe', timeout: 60000 })
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }) })
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB,
    timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  user = await db.user.create({ data: { email: 'opening@example.invalid', emailNormalized: 'opening@example.invalid',
    passwordHash: hash, emailVerifiedAt: fixedDate } })
  company = await db.company.create({ data: { name: 'Opening balance company' } })
  membership = await db.companyMembership.create({ data: { companyId: company.id, userId: user.id } })
  await db.companyMemberRole.create({ data: { companyId: company.id, membershipId: membership.id, role: 'COMPANY_ADMIN' } })
  ;[year2025, year2026, year2027, year2028] = await Promise.all([
    db.fiscalYear.create({ data: { companyId: company.id, startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') } }),
    db.fiscalYear.create({ data: { companyId: company.id, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } }),
    db.fiscalYear.create({ data: { companyId: company.id, startDate: new Date('2027-01-01'), endDate: new Date('2027-12-31') } }),
    db.fiscalYear.create({ data: { companyId: company.id, startDate: new Date('2028-01-01'), endDate: new Date('2028-12-31') } }),
  ])
  debit = await db.companyAccount.create({ data: { companyId: company.id, code: 'OPEN-DR', name: 'Opening debit', category: 'ASSET', normalBalance: 'DEBIT' } })
  credit = await db.companyAccount.create({ data: { companyId: company.id, code: 'OPEN-CR', name: 'Opening credit', category: 'LIABILITY', normalBalance: 'CREDIT' } })
  const attempt = randomUUID(), upload = await db.evidenceUpload.create({ data: { companyId: company.id, ownerId: user.id,
    creationRequestId: randomUUID(), inputHash: 'a'.repeat(64), attemptId: attempt, state: 'READY', leaseExpiresAt: new Date('2026-10-08') } })
  evidence = await db.evidence.create({ data: { companyId: company.id, uploadId: upload.id, kind: 'OTHER', title: 'Opening evidence',
    originalFileName: 'opening.pdf', mediaType: 'application/pdf', byteSize: 20, sha256: 'b'.repeat(64),
    originalKey: `originals/${company.id}/${upload.id}/${attempt}`, createdById: user.id } })
  app = await NestFactory.create(AppModule, { logger: false }); configureApp(app, readAppConfig())
  await app.listen(0, '127.0.0.1'); address = await app.getUrl(); session = await login()
}, 120000)

afterAll(async () => {
  try {
    if (app) await app.close()
    if (db) await db.$disconnect()
    process.env.DATABASE_URL = originalUrl
    if (admin) {
      expect(await snapshotBase()).toEqual(baseBefore)
      if (created && /^atms_verify_opening_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
        const rows = await admin.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_database WHERE datname=${databaseName}`
        expect(rows[0].count).toBe(0)
      }
    }
  } finally { if (admin) await admin.$disconnect() }
}, 120000)

describe('F04-02 isolated opening balance HTTP + DB', () => {
  it('K2/K3/K5 creates one fixed-date balance idempotently and atomically', async () => {
    expect((await request(path(year2026.id), { login: session })).status).toBe(404)
    expect((await request(path(year2026.id), { method: 'POST', login: session, body: nonzero(null) })).status).toBe(409)
    const invalidEvidence = { ...nonzero(year2025.id), creationRequestId: randomUUID(), evidenceIds: [randomUUID()] }
    expect((await request(path(year2026.id), { method: 'POST', login: session, body: invalidEvidence })).status).toBe(404)
    expect(await db.journalEntry.count({ where: { companyId: company.id, fiscalYearId: year2026.id, kind: 'OPENING' } })).toBe(0)

    const creationRequestId = randomUUID(), body = nonzero(year2025.id, creationRequestId)
    const created = await request(path(year2026.id), { method: 'POST', login: session, body })
    expect(created.status).toBe(200); expect(created.headers.get('cache-control')).toContain('no-store')
    expect(created.data).toMatchObject({ kind: 'OPENING', fiscalYearId: year2026.id, sourceFiscalYearId: year2025.id,
      accountingDate: '2026-01-01', currency: 'KRW', status: 'DRAFT', version: 1, isZero: false,
      debitTotal: '9007199254740993', creditTotal: '9007199254740993', lineCount: 2, evidenceCount: 1 })
    expect((await request(path(year2026.id), { method: 'POST', login: session, body })).data).toEqual(created.data)
    expect((await request(path(year2026.id), { method: 'POST', login: session,
      body: nonzero(year2025.id) })).status).toBe(409)
    const stored = await db.journalEntry.findFirstOrThrow({ where: { companyId: company.id, fiscalYearId: year2026.id, kind: 'OPENING' } })
    expect(stored).toMatchObject({ id: created.data.id, openingSourceFiscalYearId: year2025.id, counterpartyId: null })
    expect(await db.auditEvent.count({ where: { companyId: company.id, type: 'OPENING_BALANCE_CREATED' } })).toBe(1)
  }, 60000)

  it('K2/K3/K5 updates the same draft to an explicit zero and enforces current role/version', async () => {
    const before = await request(path(year2026.id), { login: session })
    await db.companyMemberRole.deleteMany({ where: { membershipId: membership.id } })
    await db.companyMemberRole.create({ data: { companyId: company.id, membershipId: membership.id, role: 'READ_ONLY' } })
    expect((await request(path(year2026.id), { method: 'PATCH', login: session,
      body: { version: before.data.version, sourceFiscalYearId: year2025.id, evidenceIds: [], lines: [] } })).status).toBe(403)
    await db.companyMemberRole.deleteMany({ where: { membershipId: membership.id } })
    await db.companyMemberRole.create({ data: { companyId: company.id, membershipId: membership.id, role: 'COMPANY_ADMIN' } })
    const updated = await request(path(year2026.id), { method: 'PATCH', login: session,
      body: { version: before.data.version, sourceFiscalYearId: year2025.id, evidenceIds: [], lines: [] } })
    expect(updated.status).toBe(200); expect(updated.data).toMatchObject({ id: before.data.id, version: 2, isZero: true,
      debitTotal: '0', creditTotal: '0', lineCount: 0, evidenceCount: 0 })
    expect((await request(path(year2026.id), { method: 'PATCH', login: session,
      body: { version: 1, sourceFiscalYearId: year2025.id, evidenceIds: [], lines: [] } })).status).toBe(409)
    expect(await db.journalEntry.count({ where: { companyId: company.id, fiscalYearId: year2026.id, kind: 'OPENING' } })).toBe(1)
    expect(await db.auditEvent.count({ where: { companyId: company.id, type: 'OPENING_BALANCE_UPDATED' } })).toBe(1)
  }, 30000)

  it('K2/K5 serializes concurrent singleton creation and preserves failed writes', async () => {
    const a = { creationRequestId: randomUUID(), sourceFiscalYearId: year2026.id, evidenceIds: [], lines: [] }
    const b = { ...a, creationRequestId: randomUUID() }
    const results = await Promise.all([
      request(path(year2027.id), { method: 'POST', login: session, body: a }),
      request(path(year2027.id), { method: 'POST', login: session, body: b }),
    ])
    expect(results.map(result => result.status).sort()).toEqual([200, 409])
    expect(await db.journalEntry.count({ where: { companyId: company.id, fiscalYearId: year2027.id, kind: 'OPENING' } })).toBe(1)
    expect(await db.auditEvent.count({ where: { companyId: company.id, type: 'OPENING_BALANCE_CREATED' } })).toBe(2)
    const failed = await request(path(year2028.id), { method: 'POST', login: session,
      body: { ...nonzero(year2027.id), evidenceIds: [randomUUID()] } })
    expect(failed.status).toBe(404)
    expect(await db.journalEntry.count({ where: { companyId: company.id, fiscalYearId: year2028.id, kind: 'OPENING' } })).toBe(0)
  }, 60000)
})
