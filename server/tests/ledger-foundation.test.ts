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
const password = 'isolated ledger test passphrase', fixed = new Date('2026-10-07T00:00:00Z')
let originalUrl = '', databaseName = '', created = false, address = ''
let admin: InstanceType<typeof PrismaClient>, db: InstanceType<typeof PrismaClient>, app: INestApplication
let company: { id: string }, foreignCompany: { id: string }, year: { id: string }
let writer: { id: string; email: string }, reviewer: { id: string; email: string }, debit: { id: string }, credit: { id: string }, evidence: { id: string }
type Login = { cookie: string; csrf: string }
let writerLogin: Login, reviewerLogin: Login

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
async function request(url: string, options: { method?: string; login?: Login; body?: unknown } = {}) {
  const method = options.method ?? 'GET', headers: Record<string, string> = {}
  if (method !== 'GET') { headers.origin = origin; headers['content-type'] = 'application/json' }
  if (options.login) { headers.cookie = options.login.cookie; headers['x-csrf-token'] = options.login.csrf }
  const response = await fetch(address + url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}) })
  return { status: response.status, headers: response.headers, data: await response.json() as Record<string, any> }
}
async function login(email: string): Promise<Login> {
  const response = await request('/api/auth/login', { method: 'POST', body: { email, password } })
  expect(response.status).toBe(200)
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: response.data.csrfToken }
}
const workflow = (id: string, action: string, version: number, login: Login) => request(
  `/api/companies/${company.id}/journals/${id}/${action}`, { method: 'POST', login, body: { version, actionRequestId: randomUUID() } })
async function createJournal(accountingDate: string, memo: string, amount: string, post = true) {
  const made = await request(`/api/companies/${company.id}/journals`, { method: 'POST', login: writerLogin, body: {
    creationRequestId: randomUUID(), fiscalYearId: year.id, accountingDate, memo, counterpartyId: null, evidenceIds: [evidence.id],
    lines: [{ accountId: debit.id, debit: amount, credit: '0', memo: `${memo} debit` },
      { accountId: credit.id, debit: '0', credit: amount, memo: `${memo} credit` }],
  } })
  expect(made.status).toBe(200)
  expect((await workflow(made.data.id, 'submit', 1, writerLogin)).status).toBe(200)
  expect((await workflow(made.data.id, 'approve', 2, reviewerLogin)).status).toBe(200)
  if (post) expect((await workflow(made.data.id, 'confirm', 3, reviewerLogin)).status).toBe(200)
  return made.data.id as string
}

beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true }); originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1','localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms')
    throw new Error('Expected local isolated atms database source')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) }); baseBefore = await snapshotBase()
  databaseName = `atms_verify_ledger_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_ledger_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Unsafe isolated DB name')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true
  url.pathname = '/' + databaseName; process.env.DATABASE_URL = url.toString(); process.env.AUTH_WEB_ORIGIN = origin
  execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: server, env: process.env, stdio: 'pipe', timeout: 60000 })
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }) })
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB,
    timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  writer = await db.user.create({ data: { email: 'ledger-writer@example.invalid', emailNormalized: 'ledger-writer@example.invalid', passwordHash, emailVerifiedAt: fixed } })
  reviewer = await db.user.create({ data: { email: 'ledger-reviewer@example.invalid', emailNormalized: 'ledger-reviewer@example.invalid', passwordHash, emailVerifiedAt: fixed } })
  company = await db.company.create({ data: { name: 'Isolated ledger company' } }); foreignCompany = await db.company.create({ data: { name: 'Foreign ledger company' } })
  year = await db.fiscalYear.create({ data: { companyId: company.id, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } })
  const writerMembership = await db.companyMembership.create({ data: { companyId: company.id, userId: writer.id } })
  const reviewerMembership = await db.companyMembership.create({ data: { companyId: company.id, userId: reviewer.id } })
  const foreignMembership = await db.companyMembership.create({ data: { companyId: foreignCompany.id, userId: reviewer.id } })
  await db.companyMemberRole.createMany({ data: [
    { companyId: company.id, membershipId: writerMembership.id, role: 'ACCOUNTANT' },
    { companyId: company.id, membershipId: reviewerMembership.id, role: 'APPROVER' },
    { companyId: foreignCompany.id, membershipId: foreignMembership.id, role: 'COMPANY_ADMIN' },
  ] })
  debit = await db.companyAccount.create({ data: { companyId: company.id, code: '101', name: '현금', category: 'ASSET', normalBalance: 'DEBIT' } })
  credit = await db.companyAccount.create({ data: { companyId: company.id, code: '201', name: '미지급금', category: 'LIABILITY', normalBalance: 'CREDIT' } })
  const attemptId = randomUUID(), upload = await db.evidenceUpload.create({ data: { companyId: company.id, ownerId: writer.id,
    creationRequestId: randomUUID(), inputHash: 'a'.repeat(64), attemptId, state: 'READY', leaseExpiresAt: new Date('2026-10-08') } })
  evidence = await db.evidence.create({ data: { companyId: company.id, uploadId: upload.id, kind: 'RECEIPT', title: 'Ledger evidence',
    originalFileName: 'ledger.pdf', mediaType: 'application/pdf', byteSize: 20, sha256: 'b'.repeat(64),
    originalKey: `originals/${company.id}/${upload.id}/${attemptId}`, createdById: writer.id } })
  app = await NestFactory.create(AppModule, { logger: false }); configureApp(app, readAppConfig())
  await app.listen(0, '127.0.0.1'); address = await app.getUrl()
  writerLogin = await login(writer.email); reviewerLogin = await login(reviewer.email)
}, 120000)

afterAll(async () => {
  try {
    if (app) await app.close(); if (db) await db.$disconnect(); process.env.DATABASE_URL = originalUrl
    if (admin) {
      expect(await snapshotBase()).toEqual(baseBefore)
      if (created && /^atms_verify_ledger_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
        expect((await admin.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_database WHERE datname=${databaseName}`)[0].count).toBe(0)
      }
    }
  } finally { if (admin) await admin.$disconnect() }
}, 120000)

describe('F04-08~10 isolated posted ledger', () => {
  it('K5/K6/K7 returns only POSTED lines in deterministic pages with exact cutoff/date totals', async () => {
    const first = await createJournal('2026-01-10', 'first posted', '9007199254740993')
    const firstPosting = await db.journalPosting.findUniqueOrThrow({ where: { companyId_journalId: { companyId: company.id, journalId: first } } })
    await new Promise(resolve => setTimeout(resolve, 15))
    const laterDate = await createJournal('2026-02-10', 'later date', '7')
    await new Promise(resolve => setTimeout(resolve, 15))
    const latePosted = await createJournal('2026-01-05', 'late older date', '11')
    const approvedOnly = await createJournal('2026-01-01', 'approved only', '13', false)

    const book = await request(`/api/companies/${company.id}/ledger/journal-book?limit=100`, { login: writerLogin })
    expect(book.status).toBe(200); expect(book.headers.get('cache-control')).toContain('no-store')
    expect(new Set(book.data.items.map((item: any) => item.journalId))).toEqual(new Set([first, laterDate, latePosted]))
    expect(book.data.items.map((item: any) => item.journalId)).not.toContain(approvedOnly)
    expect(book.data.totals).toEqual({ debit: '9007199254741011', credit: '9007199254741011', net: '0' })
    expect(book.data.items.map((item: any) => [item.accountingDate, item.journalNumber, item.position, item.id]))
      .toEqual([...book.data.items].sort((a: any, b: any) => a.accountingDate.localeCompare(b.accountingDate)
        || a.journalNumber.localeCompare(b.journalNumber) || a.position - b.position || a.id.localeCompare(b.id))
        .map((item: any) => [item.accountingDate, item.journalNumber, item.position, item.id]))

    const cutoff = encodeURIComponent(firstPosting.postedAt.toISOString())
    const through = await request(`/api/companies/${company.id}/ledger/journal-book?postedThrough=${cutoff}&limit=100`, { login: writerLogin })
    expect(new Set(through.data.items.map((item: any) => item.journalId))).toEqual(new Set([first]))
    expect((await request(`/api/companies/${company.id}/ledger/journal-book?from=2026-02-01&to=2026-02-28`, { login: writerLogin })).data.items.map((item: any) => item.journalId))
      .toEqual([laterDate, laterDate])
    expect((await request(`/api/companies/${company.id}/ledger/journal-book?q=${encodeURIComponent('late older')}`, { login: writerLogin })).data.items.map((item: any) => item.journalId))
      .toEqual([latePosted, latePosted])

    const page1 = await request(`/api/companies/${company.id}/ledger/journal-book?limit=1`, { login: writerLogin })
    const page2 = await request(`/api/companies/${company.id}/ledger/journal-book?limit=1&cursor=${encodeURIComponent(page1.data.nextCursor)}`, { login: writerLogin })
    expect(page2.data.items[0].id).not.toBe(page1.data.items[0].id)
    expect((await request(`/api/companies/${company.id}/ledger/journal-book?limit=1&q=x&cursor=${encodeURIComponent(page1.data.nextCursor)}`, { login: writerLogin })).status).toBe(400)
  }, 60000)

  it('K5/K6/K7 returns inactive account history, running balances and company isolation', async () => {
    const cutoffBeforeOpening = await db.journalPosting.findFirstOrThrow({ where: { companyId: company.id }, orderBy: { postedAt: 'desc' } })
    const opening = await request(`/api/companies/${company.id}/fiscal-years/${year.id}/opening-balance`, { method: 'POST', login: writerLogin, body: {
      creationRequestId: randomUUID(), sourceFiscalYearId: null, evidenceIds: [evidence.id],
      lines: [{ accountId: debit.id, debit: '100', credit: '0' }, { accountId: credit.id, debit: '0', credit: '100' }],
    } })
    expect(opening.status).toBe(200)
    expect((await workflow(opening.data.id, 'submit', 1, writerLogin)).status).toBe(200)
    expect((await workflow(opening.data.id, 'approve', 2, reviewerLogin)).status).toBe(200)
    expect((await workflow(opening.data.id, 'confirm', 3, reviewerLogin)).status).toBe(200)
    await db.companyAccount.update({ where: { id: debit.id }, data: { active: false } })
    const ledger = await request(`/api/companies/${company.id}/ledger/accounts/${debit.id}?fiscalYearId=${year.id}&limit=100`, { login: writerLogin })
    expect(ledger.status).toBe(200)
    expect(ledger.data.account).toMatchObject({ id: debit.id, active: false, normalBalance: 'DEBIT' })
    expect(ledger.data.openingBalance).toBe('100')
    expect(ledger.data.openingBalanceStatus).toBe('POSTED')
    expect(ledger.data.openingBalanceJournalId).toBe(opening.data.id)
    expect(ledger.data.totals).toEqual({ debit: '9007199254741011', credit: '0', net: '9007199254741011' })
    expect(ledger.data.closingBalance).toBe('9007199254741111')
    expect(ledger.data.items.map((item: any) => item.runningBalance)).toEqual(['111','9007199254741104','9007199254741111'])
    expect(ledger.data.items.every((item: any) => typeof item.debit === 'string' && typeof item.credit === 'string')).toBe(true)
    expect(ledger.data.items.every((item: any) => item.kind === 'STANDARD')).toBe(true)
    const later = await request(`/api/companies/${company.id}/ledger/accounts/${debit.id}?fiscalYearId=${year.id}&from=2026-01-10&limit=100`, { login: writerLogin })
    expect(later.data.openingBalance).toBe('111')
    expect(later.data.totals).toEqual({ debit: '9007199254741000', credit: '0', net: '9007199254741000' })
    expect(later.data.items.map((item: any) => item.runningBalance)).toEqual(['9007199254741104', '9007199254741111'])
    const cutoff = encodeURIComponent(cutoffBeforeOpening.postedAt.toISOString())
    const beforeOpening = await request(`/api/companies/${company.id}/ledger/accounts/${debit.id}?fiscalYearId=${year.id}&postedThrough=${cutoff}&limit=100`, { login: writerLogin })
    expect(beforeOpening.data).toMatchObject({ openingBalance: '0', openingBalanceStatus: 'MISSING',
      openingBalanceJournalId: null, closingBalance: '9007199254741011' })
    expect((await request(`/api/companies/${company.id}/ledger/accounts/${randomUUID()}?fiscalYearId=${year.id}`, { login: writerLogin })).status).toBe(404)
    expect((await request(`/api/companies/${foreignCompany.id}/ledger/journal-book`, { login: reviewerLogin })).data.items).toEqual([])
    expect((await request(`/api/companies/${foreignCompany.id}/ledger/accounts/${debit.id}?fiscalYearId=${year.id}`, { login: reviewerLogin })).status).toBe(404)

    const nextYear = await db.fiscalYear.create({ data: { companyId: company.id,
      startDate: new Date('2027-01-01'), endDate: new Date('2027-12-31') } })
    const zero = await request(`/api/companies/${company.id}/fiscal-years/${nextYear.id}/opening-balance`, { method: 'POST', login: writerLogin,
      body: { creationRequestId: randomUUID(), sourceFiscalYearId: year.id, evidenceIds: [], lines: [] } })
    expect(zero.status).toBe(200)
    expect((await workflow(zero.data.id, 'submit', 1, writerLogin)).status).toBe(200)
    expect((await workflow(zero.data.id, 'approve', 2, reviewerLogin)).status).toBe(200)
    expect((await workflow(zero.data.id, 'confirm', 3, reviewerLogin)).status).toBe(200)
    const zeroLedger = await request(`/api/companies/${company.id}/ledger/accounts/${debit.id}?fiscalYearId=${nextYear.id}`, { login: writerLogin })
    expect(zeroLedger.data).toMatchObject({ openingBalance: '0', openingBalanceStatus: 'CONFIRMED_ZERO',
      openingBalanceJournalId: zero.data.id, items: [], closingBalance: '0' })
  }, 30000)
})
