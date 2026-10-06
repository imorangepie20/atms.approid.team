import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { config as loadEnv } from 'dotenv'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanyRole } from '../src/generated/prisma/client'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { SessionService, hashToken } = require('../dist/auth/session.service.js') as typeof import('../src/auth/session.service')
const { AuditService } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
const { JournalsService } = require('../dist/journals/journals.service.js') as typeof import('../src/journals/journals.service')
const { createJournalSchema } = require('../dist/journals/journals.schemas.js') as typeof import('../src/journals/journals.schemas')
const { AUTH_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const argon2 = require('argon2') as typeof import('argon2')
const server = fileURLToPath(new URL('../', import.meta.url)), proof = resolve(server, '../.artifacts/implementation-f04-journal-draft')
const origin = 'http://127.0.0.1:4173', password = 'isolated journal test passphrase '
const baseTime = new Date('2026-10-07T00:00:00Z')
let clock = new Date(baseTime), originalUrl: string, databaseName: string, address: string, created = false
let app: INestApplication, db: InstanceType<typeof PrismaClient>, admin: InstanceType<typeof PrismaClient>, baseBefore: unknown
let userA: { id: string; email: string }, userB: { id: string; email: string }, companyA: { id: string }, companyB: { id: string }, memberA: { id: string }
let yearA: { id: string }, yearB: { id: string }, debitAccount: { id: string }, creditAccount: { id: string }, foreignAccount: { id: string }, party: { id: string }, document: { id: string; uploadId: string }
const report: Record<string, unknown> = {}
type Login = { cookie: string; csrf: string; raw: string }
async function request(path: string, options: { method?: string; session?: Login; body?: unknown; origin?: string | null; csrf?: string } = {}) {
  const method = options.method ?? 'GET', headers: Record<string, string> = {}
  if (method !== 'GET') { headers['content-type'] = 'application/json'; if (options.origin !== null) headers.origin = options.origin ?? origin }
  if (options.session) { headers.cookie = options.session.cookie; headers['x-csrf-token'] = options.csrf ?? options.session.csrf }
  const response = await fetch(address + path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}) })
  return { status: response.status, headers: response.headers, data: await response.json() as Record<string, any> }
}
const path = (suffix = '', company = companyA.id) => `/api/companies/${company}/journals${suffix}`
const reverse = (id = document.id, suffix = '') => `/api/companies/${companyA.id}/evidence/${id}/journals${suffix}`
const input = (extra: Record<string, unknown> = {}) => ({ creationRequestId: randomUUID(), fiscalYearId: yearA.id, accountingDate: '2026-10-07', memo: ' Isolated draft ',
  counterpartyId: null, evidenceIds: [], lines: [{ accountId: debitAccount.id, debit: '1234', credit: '0' }, { accountId: creditAccount.id, debit: '0', credit: '1234' }], ...extra })
function update(row: Record<string, any>, extra: Record<string, unknown> = {}) {
  return { version: row.version, accountingDate: row.accountingDate, memo: row.memo, counterpartyId: row.counterpartyId, evidenceIds: row.evidenceIds,
    lines: row.lines.map((line: any) => ({ accountId: line.accountId, debit: line.debit, credit: line.credit, memo: line.memo })), ...extra }
}
async function login(user = userA): Promise<Login> {
  const r = await request('/api/auth/login', { method: 'POST', body: { email: user.email, password } }); expect(r.status).toBe(200)
  const cookie = r.headers.get('set-cookie')!.split(';')[0]; return { cookie, raw: cookie.split('=')[1], csrf: r.data.csrfToken }
}
const post = (session: Login, body = input()) => request(path(), { method: 'POST', session, body })
const events = () => db.auditEvent.findMany({ where: { type: { in: ['JOURNAL_DRAFT_CREATED', 'JOURNAL_DRAFT_UPDATED'] } }, orderBy: { createdAt: 'asc' } })
const totals = async () => ({ journals: await db.journalEntry.count(), lines: await db.journalLine.count(), links: await db.journalEvidence.count(), sequences: await db.journalNumberSequence.count(), audits: await events() })
async function roles(...values: CompanyRole[]) {
  await db.companyMemberRole.deleteMany({ where: { membershipId: memberA.id } })
  await db.companyMemberRole.createMany({ data: values.map(role => ({ companyId: companyA.id, membershipId: memberA.id, role })) })
}
async function snapshotBase() {
  const tables = await admin.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
  const out: Record<string, unknown> = {}
  for (const { tablename } of tables) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('Invalid known table')
    out[tablename] = await admin.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${tablename}" t`)
  }
  return out
}
// [J8] 모든 새 자료는 고유한 격리 DB에만 저장한다. 기본 DB 전체 행 지문은 읽기 전/후 비교한다.
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true }); originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1','localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local atms database')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) }); baseBefore = await snapshotBase()
  databaseName = `atms_verify_journal_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_journal_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid owned journal database')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true
  url.pathname = '/' + databaseName; process.env.DATABASE_URL = url.toString(); process.env.AUTH_WEB_ORIGIN = origin
  try { execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env: process.env, stdio: 'pipe', timeout: 30000 }) }
  catch { throw new Error('Isolated journal migration failed') }
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 6 }) })
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB, timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  userA = await db.user.create({ data: { email: 'journal-a@example.invalid', emailNormalized: 'journal-a@example.invalid', passwordHash, emailVerifiedAt: baseTime } })
  userB = await db.user.create({ data: { email: 'journal-b@example.invalid', emailNormalized: 'journal-b@example.invalid', passwordHash, emailVerifiedAt: baseTime } })
  app = await NestFactory.create(AppModule, { logger: false }); configureApp(app, readAppConfig()); await app.listen(0, '127.0.0.1'); address = await app.getUrl()
  report.isolatedDatabase = databaseName
}, 120000)
beforeEach(async () => {
  vi.restoreAllMocks(); clock = new Date(baseTime); vi.spyOn(SessionService.prototype, 'now').mockImplementation(() => new Date(clock))
  await db.$transaction(async tx => {
    await tx.journalEvidence.deleteMany(); await tx.journalLine.deleteMany(); await tx.journalEntry.deleteMany(); await tx.journalNumberSequence.deleteMany()
    await tx.auditEvent.deleteMany(); await tx.loginRateBucket.deleteMany(); await tx.userSession.deleteMany(); await tx.companyMemberRole.deleteMany(); await tx.companyMembership.deleteMany()
  })
  // [J8 첫 실패 수리] 완료 증빙은 시험에서도 수정/삭제할 수 없다. 매 시험 새 회사를 사용해
  // 계정 중지/업로드 상태 변경을 분리하고 이전 증빙·참조는 소유 격리 DB를 제거할 때까지 보존한다.
  // 전표/세션 초기화만 허용하며 운영 원본 보호 트리거는 끄거나 변경하지 않는다.
  companyA = await db.company.create({ data: { name: 'Isolated journal company A' } }); companyB = await db.company.create({ data: { name: 'Isolated journal company B' } })
  yearA = await db.fiscalYear.create({ data: { companyId: companyA.id, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } })
  yearB = await db.fiscalYear.create({ data: { companyId: companyB.id, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } })
  memberA = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userA.id } }); await roles('COMPANY_ADMIN')
  const other = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userB.id } })
  await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: other.id, role: 'COMPANY_ADMIN' } })
  debitAccount = await db.companyAccount.create({ data: { companyId: companyA.id, code: 'DR', name: 'Debit account', category: 'ASSET', normalBalance: 'DEBIT' } })
  creditAccount = await db.companyAccount.create({ data: { companyId: companyA.id, code: 'CR', name: 'Credit account', category: 'LIABILITY', normalBalance: 'CREDIT' } })
  foreignAccount = await db.companyAccount.create({ data: { companyId: companyB.id, code: 'OTHER', name: 'Other', category: 'ASSET', normalBalance: 'DEBIT' } })
  party = await db.counterparty.create({ data: { companyId: companyA.id, name: 'Isolated party', kind: 'BOTH', creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64) } })
  const attemptId = randomUUID(), upload = await db.evidenceUpload.create({ data: { companyId: companyA.id, ownerId: userA.id, creationRequestId: randomUUID(), inputHash: 'a'.repeat(64), attemptId,
    state: 'READY', leaseExpiresAt: new Date('2026-10-08') } })
  document = await db.evidence.create({ data: { companyId: companyA.id, uploadId: upload.id, kind: 'RECEIPT', title: 'Preserved original', originalFileName: 'receipt.pdf', mediaType: 'application/pdf',
    byteSize: 20, sha256: 'b'.repeat(64), originalKey: `originals/${companyA.id}/${upload.id}/${attemptId}`, createdById: userA.id } })
})
afterAll(async () => {
  vi.restoreAllMocks()
  try {
    if (app) await app.close(); if (db) await db.$disconnect(); process.env.DATABASE_URL = originalUrl
    if (admin) {
      const after = await snapshotBase(); expect(after).toEqual(baseBefore); report.baseBefore = baseBefore; report.baseAfter = after; report.baseUnchanged = true
      if (created && /^atms_verify_journal_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
        const rows = await admin.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_database WHERE datname=${databaseName}`
        expect(rows[0].count).toBe(0); report.onlyCreatedDatabaseRemoved = true
      }
    }
  } finally { if (admin) await admin.$disconnect(); mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(report, null, 2)) }
}, 30000)

describe('journal draft foundation', () => {
  it.each(['COMPANY_ADMIN','ACCOUNTANT','APPROVER','READ_ONLY','EXTERNAL_TAX'] as CompanyRole[])('K1 reads for %s and permits only existing draft roles', async role => {
    await roles(role); const session = await login()
    expect((await request(path(), { session })).status).toBe(200)
    const written = await post(session); expect(written.status).toBe(['COMPANY_ADMIN','ACCOUNTANT','EXTERNAL_TAX'].includes(role) ? 200 : 403)
    if (written.status === 200) expect(written.data.createdById).toBe(userA.id)
  })
  it('K1 unions roles and checks another company and inactive membership without expanding permissions', async () => {
    await roles('APPROVER','ACCOUNTANT'); const session = await login(); expect((await post(session)).status).toBe(200)
    expect((await request(path('', companyB.id), { session })).status).toBe(403)
    await db.companyMembership.update({ where: { id: memberA.id }, data: { active: false } }); expect((await request(path(), { session })).status).toBe(403)
  })
  it('K1 rejects missing session, Origin and CSRF and keeps safe no-store errors', async () => {
    for (const r of [await request(path()), await request(path(), { method: 'POST', body: input() })]) { expect(r.status).toBe(401); expect(r.headers.get('cache-control')).toBe('no-store') }
    const session = await login()
    for (const options of [{ origin: null }, { origin: 'http://example.invalid' }, { csrf: 'wrong' }]) expect((await request(path(), { method: 'POST', session, body: input(), ...options })).status).toBe(403)
    expect(await totals()).toEqual({ journals: 0, lines: 0, links: 0, sequences: 0, audits: [] })
  })
  it('K1 leaves GET activity and other sessions unchanged but extends an authorized write', async () => {
    const session = await login(), other = await login(), before = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    clock = new Date(baseTime.getTime() + 60000); expect((await request(path(), { session })).status).toBe(200)
    expect(await db.userSession.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
    expect((await post(session)).status).toBe(200)
    const current = await db.userSession.findUniqueOrThrow({ where: { tokenHash: hashToken(session.raw) } }); expect(current.lastActivityAt).toEqual(clock)
    expect(await db.userSession.findUnique({ where: { tokenHash: hashToken(other.raw) } })).toEqual(before.find(row => row.tokenHash === hashToken(other.raw)))
  })
  it('K2 issues immutable per-company/year numbers and separate UTC processing timestamps', async () => {
    const session = await login(), first = await post(session)
    expect(first.data).toMatchObject({ number: '20260101-000001', accountingDate: '2026-10-07', fiscalYearId: yearA.id, status: 'DRAFT', currency: 'KRW', version: 1, lineCount: 2, debitTotal: '1234', creditTotal: '1234' })
    expect(new Date(first.data.createdAt).toISOString()).toBe(first.data.createdAt)
    const writes = await Promise.all([post(session), post(session)]); expect(writes.every(r => r.status === 200)).toBe(true)
    expect(writes.map(r => r.data.number).sort()).toEqual(['20260101-000002','20260101-000003'])
    const otherSession = await login(userB)
    const other = await request(path('', companyB.id), { method: 'POST', session: otherSession, body: input({ fiscalYearId: yearB.id, lines: [{ accountId: foreignAccount.id, debit: '1', credit: '0' }, { accountId: foreignAccount.id, debit: '0', credit: '1' }] }) })
    expect(other.status).toBe(200); expect(other.data.number).toBe('20260101-000001')
    expect((await request(path('/' + first.data.id), { method: 'PATCH', session, body: update(first.data, { accountingDate: '2027-01-01' }) })).status).toBe(409)
    expect((await request(path('/' + first.data.id), { session })).data.number).toBe(first.data.number)
    report.numbering = true
  })
  it('K2 distinguishes short fiscal periods in the same calendar year and enforces exhaustion without storage', async () => {
    const y1 = await db.fiscalYear.create({ data: { companyId: companyA.id, startDate: new Date('2027-01-01'), endDate: new Date('2027-06-30') } })
    const y2 = await db.fiscalYear.create({ data: { companyId: companyA.id, startDate: new Date('2027-07-01'), endDate: new Date('2027-12-31') } })
    const session = await login()
    expect((await post(session, input({ fiscalYearId: y1.id, accountingDate: '2027-01-01' }))).data.number).toBe('20270101-000001')
    expect((await post(session, input({ fiscalYearId: y2.id, accountingDate: '2027-12-31' }))).data.number).toBe('20270701-000001')
    await db.journalNumberSequence.create({ data: { companyId: companyA.id, fiscalYearId: yearA.id, lastNumber: 999999 } })
    const before = await totals(); expect((await post(session)).status).toBe(409); expect(await totals()).toEqual(before)
  })
  it.each(['2025-12-31','2027-01-01'])('K2 rejects creation outside the selected fiscal year %s', async accountingDate => {
    expect((await post(await login(), input({ accountingDate }))).status).toBe(400); expect(await db.journalEntry.count()).toBe(0)
  })
  it('K2 supports inclusive date/search/year filters, detail and filter-bound UUID cursor', async () => {
    const session = await login(), rows = []
    for (const day of ['2026-01-01','2026-06-01','2026-12-31']) rows.push((await post(session, input({ accountingDate: day, memo: 'Search marker' }))).data)
    const first = await request(path('?limit=1'), { session }); expect(first.data.items).toHaveLength(1); expect(first.data.nextCursor).toBe(first.data.items[0].id)
    const second = await request(path('?limit=1&cursor=' + first.data.nextCursor), { session }); expect(second.data.items[0].id).not.toBe(first.data.items[0].id)
    const range = await request(path(`?from=2026-06-01&to=2026-12-31&fiscalYearId=${yearA.id}&q=marker`), { session }); expect(range.data.items).toHaveLength(2)
    expect((await request(path('?q=absent&cursor=' + first.data.nextCursor), { session })).status).toBe(400)
    expect((await request(path('?cursor=' + randomUUID()), { session })).status).toBe(400)
    expect((await request(path('/' + randomUUID()), { session })).status).toBe(404)
    expect((await request(path('/' + rows[0].id), { session })).headers.get('cache-control')).toBe('no-store')
  })
  it('K3 stores large exact balanced values and rejects partial or unbalanced financial data', async () => {
    const session = await login(), body = input({ lines: [{ accountId: debitAccount.id, debit: '9007199254740993', credit: '0' }, { accountId: creditAccount.id, debit: '0', credit: '9007199254740993' }] })
    const result = await post(session, body); expect(result.status).toBe(200); expect(result.data.debitTotal).toBe('9007199254740993')
    const before = await totals()
    for (const line of [{ debit: '1', credit: '0' }, { debit: '-1', credit: '0' }, { debit: '0', credit: '0' }, { debit: '1', credit: '1' }]) {
      expect((await post(session, input({ lines: [{ accountId: debitAccount.id, ...line }, input().lines[1]] }))).status).toBe(400)
    }
    expect(await totals()).toEqual(before); report.exactAmounts = true
  })
  it('K3 rejects forged or invalid HTTP input without leaking original content', async () => {
    const session = await login(), secret = 'RAW_TEST_MEMO_DO_NOT_EXPOSE'
    for (const extra of [{ createdById: userB.id }, { number: 'forged' }, { memo: secret + '\0' }, { currency: 'USD' }, { status: 'CONFIRMED' }, { accountingDate: '2026-02-30' }]) {
      const r = await post(session, input(extra)); expect(r.status).toBe(400); expect(JSON.stringify(r.data)).not.toContain(secret)
      expect(Object.keys(r.data).sort()).toEqual(['code','details','message'])
    }
    expect(await db.journalEntry.count()).toBe(0)
  })
  it('K4 links/unlinks same-company completed originals and permits one evidence in multiple drafts without mutation', async () => {
    const session = await login(), original = await db.evidence.findUnique({ where: { id: document.id } }), upload = await db.evidenceUpload.findUnique({ where: { id: document.uploadId } })
    const body = input({ counterpartyId: party.id, evidenceIds: [document.id] }), first = await post(session, body), second = await post(session, input({ evidenceIds: [document.id] }))
    expect(first.status).toBe(200); expect(second.status).toBe(200); expect(first.data.counterpartyId).toBe(party.id)
    const linked = await request(reverse(), { session }); expect(linked.status).toBe(200); expect(linked.data.items).toHaveLength(2); expect(linked.headers.get('cache-control')).toBe('no-store')
    expect((await request(reverse(document.id, '?limit=1'), { session })).data.nextCursor).toBeTruthy()
    const changed = await request(path('/' + first.data.id), { method: 'PATCH', session, body: update(first.data, { evidenceIds: [], counterpartyId: null }) })
    expect(changed.status).toBe(200); expect(changed.data.version).toBe(2); expect(changed.data.evidenceIds).toEqual([])
    expect((await request(reverse(), { session })).data.items).toHaveLength(1)
    expect(await db.evidence.findUnique({ where: { id: document.id } })).toEqual(original); expect(await db.evidenceUpload.findUnique({ where: { id: document.uploadId } })).toEqual(upload)
    report.originalPreserved = true
  })
  it.each(['foreign-account','missing-account','foreign-year','missing-party','missing-evidence'])('K4 returns the same 404 for foreign or missing reference %s', async kind => {
    const extra = kind === 'foreign-account' || kind === 'missing-account' ? { lines: [{ ...input().lines[0], accountId: kind === 'foreign-account' ? foreignAccount.id : randomUUID() }, input().lines[1]] }
      : kind === 'foreign-year' ? { fiscalYearId: yearB.id } : kind === 'missing-party' ? { counterpartyId: randomUUID() } : { evidenceIds: [randomUUID()] }
    const r = await post(await login(), input(extra)); expect(r.status).toBe(404); expect(r.data.code).toBe('NOT_FOUND'); expect(await db.journalEntry.count()).toBe(0)
  })
  it.each(['inactive-account','unclassified-account','inactive-party','pending-evidence'])('K4 rejects currently unusable reference %s', async kind => {
    if (kind === 'inactive-account') await db.companyAccount.update({ where: { id: debitAccount.id }, data: { active: false } })
    if (kind === 'unclassified-account') await db.companyAccount.update({ where: { id: debitAccount.id }, data: { category: null, normalBalance: null } })
    if (kind === 'inactive-party') await db.counterparty.update({ where: { id: party.id }, data: { active: false } })
    if (kind === 'pending-evidence') await db.evidenceUpload.update({ where: { id: document.uploadId }, data: { state: 'PENDING' } })
    expect((await post(await login(), input({ counterpartyId: party.id, evidenceIds: [document.id] }))).status).toBe(409)
    expect(await db.journalNumberSequence.count()).toBe(0)
  })
  it('K4 retains old draft lookup after referenced account stops and prevents its new use or edit', async () => {
    const session = await login(), first = await post(session)
    await db.companyAccount.update({ where: { id: debitAccount.id }, data: { active: false } })
    expect((await request(path('/' + first.data.id), { session })).status).toBe(200)
    expect((await request(path('/' + first.data.id), { method: 'PATCH', session, body: update(first.data, { memo: 'Edit' }) })).status).toBe(409)
    expect((await post(session)).status).toBe(409)
  })
  it('K5 replays concurrent identical input once, rejects different input and returns current view after edit', async () => {
    const session = await login(), body = input({ evidenceIds: [document.id] })
    const responses = await Promise.all([post(session, body), post(session, body)]); expect(responses.map(r => r.status)).toEqual([200,200]); expect(responses[0].data.id).toBe(responses[1].data.id)
    expect((await post(session, { ...body, memo: 'Different content' })).status).toBe(409)
    const row = responses[0].data, changed = await request(path('/' + row.id), { method: 'PATCH', session, body: update(row, { memo: 'Renamed', evidenceIds: [] }) })
    expect(changed.status).toBe(200); expect(changed.data.version).toBe(2)
    expect((await post(session, body)).data).toEqual(changed.data)
    expect(await db.journalNumberSequence.findFirst()).toMatchObject({ lastNumber: 1 }); expect(await events()).toHaveLength(2)
    report.replayAndVersion = true
  })
  it('K5 ignores evidence order and -0 spelling but preserves line order as meaningful input', async () => {
    const session = await login(), body = input(); body.lines[0].credit = '-0'
    const first = await post(session, body); expect(first.status).toBe(200)
    body.lines[0].credit = '0'; expect((await post(session, body)).data.id).toBe(first.data.id)
    expect((await post(session, { ...body, lines: [...body.lines].reverse() })).status).toBe(409)
    expect((await request(path('/' + first.data.id), { method: 'PATCH', session, body: update(first.data) })).data).toEqual(first.data)
    expect(await events()).toHaveLength(1)
  })
  it('K5 rejects stale versions, commits one racing edit and preserves ID/number/author while replacing lines', async () => {
    const session = await login(), first = await post(session)
    const changes = await Promise.all(['A','B'].map(memo => request(path('/' + first.data.id), { method: 'PATCH', session, body: update(first.data, { memo }) })))
    expect(changes.map(r => r.status).sort()).toEqual([200,409])
    const current = (await request(path('/' + first.data.id), { session })).data
    expect(current).toMatchObject({ id: first.data.id, number: first.data.number, createdById: userA.id, version: 2 })
    expect(current.lines.map((l: any) => l.id)).not.toEqual(first.data.lines.map((l: any) => l.id))
    const changed = await request(path('/' + current.id), { method: 'PATCH', session, body: update(current, { lines: [{ accountId: debitAccount.id, debit: '10', credit: '0' }, { accountId: debitAccount.id, debit: '0', credit: '10' }] }) })
    expect(changed.status).toBe(200); expect(changed.data.version).toBe(3); expect(changed.data.debitTotal).toBe('10')
    expect((await request(path('/' + current.id), { method: 'PATCH', session, body: update(changed.data, { fiscalYearId: yearB.id }) })).status).toBe(400)
  })
  it('K5 permits another authorized company writer to edit while preserving original creator', async () => {
    const session = await login(), first = await post(session)
    const other = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userB.id } })
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: other.id, role: 'ACCOUNTANT' } })
    const changed = await request(path('/' + first.data.id), { method: 'PATCH', session: await login(userB), body: update(first.data, { memo: 'Other writer' }) })
    expect(changed.status).toBe(200); expect(changed.data.createdById).toBe(userA.id)
  })
  it('K6 rolls back number/header/lines/links on audit failure and does not consume the first number', async () => {
    const session = await login(); const spy = vi.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(new Error('PRIVATE_FAILURE_DO_NOT_EXPOSE'))
    const failed = await post(session, input({ evidenceIds: [document.id] })); expect(failed.status).toBe(500); expect(JSON.stringify(failed.data)).not.toContain('PRIVATE_FAILURE')
    expect(await totals()).toEqual({ journals: 0, lines: 0, links: 0, sequences: 0, audits: [] })
    spy.mockRestore(); const good = await post(session); expect(good.data.number).toBe('20260101-000001'); report.auditRollback = true
  })
  it('K6 rolls back a failed full replacement and masks DB failure without discarding previous content', async () => {
    const session = await login(), first = await post(session, input({ evidenceIds: [document.id] })), before = await totals()
    vi.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(new Error('Failure'))
    expect((await request(path('/' + first.data.id), { method: 'PATCH', session, body: update(first.data, { memo: 'Not committed', evidenceIds: [] }) })).status).toBe(500)
    expect((await request(path('/' + first.data.id), { session })).data).toEqual(first.data); expect(await totals()).toEqual(before)
  })
  it('K6 rechecks a revoked session and revoked role at the transaction boundary after HTTP guard', async () => {
    const session = await login(), service = app.get(JournalsService), context = await app.get(SessionService).resolve(session.raw)
    await db.userSession.updateMany({ where: { tokenHash: hashToken(session.raw) }, data: { revokedAt: clock } })
    await expect(service.create(companyA.id, context, createJournalSchema.parse(input()), randomUUID())).rejects.toMatchObject({ status: 401 })
    const renewed = await login(), fresh = await app.get(SessionService).resolve(renewed.raw); await roles('READ_ONLY')
    await expect(service.create(companyA.id, fresh, createJournalSchema.parse(input()), randomUUID())).rejects.toMatchObject({ status: 403 })
    expect(await db.journalEntry.count()).toBe(0)
  })
  it('K6 serializes a concurrent account stop before validating references', async () => {
    const session = await login(), service = app.get(JournalsService), context = await app.get(SessionService).resolve(session.raw)
    let release!: () => void, locked!: () => void
    const acquired = new Promise<void>(done => { locked = done }), finish = new Promise<void>(done => { release = done })
    const stop = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyA.id}::uuid FOR UPDATE`; locked(); await finish
      await tx.companyAccount.update({ where: { id: debitAccount.id }, data: { active: false } })
    })
    await acquired; const writing = service.create(companyA.id, context, createJournalSchema.parse(input()), randomUUID()); release(); await stop
    await expect(writing).rejects.toMatchObject({ status: 409 }); expect(await db.journalEntry.count()).toBe(0)
  })
  it('K6 writes only static audit fields and rejects forged audit content before storage', async () => {
    const session = await login(), first = await post(session)
    expect((await request(path('/' + first.data.id), { method: 'PATCH', session, body: update(first.data, { memo: 'Updated private memo' }) })).status).toBe(200)
    const audits = await events(); expect(audits.map(e => e.type)).toEqual(['JOURNAL_DRAFT_CREATED','JOURNAL_DRAFT_UPDATED'])
    for (const event of audits) { expect(Object.keys(event.details as object).sort()).toEqual(['changedFields','evidenceCount','journalId','lineCount','statusAfter','statusBefore','versionAfter','versionBefore']); expect(JSON.stringify(event.details)).not.toContain('private memo'); expect(JSON.stringify(event.details)).not.toContain('1234') }
    const audit = app.get(AuditService)
    await expect(db.$transaction(tx => audit.record(tx, { type: 'JOURNAL_DRAFT_UPDATED', actorId: userA.id, companyId: companyA.id, requestId: randomUUID(),
      change: { kind: 'journal-draft', eventType: 'JOURNAL_DRAFT_UPDATED', journalId: first.data.id, changedFields: ['arbitraryBody'], versionBefore: 1, versionAfter: 2,
        statusBefore: 'DRAFT', statusAfter: 'DRAFT', lineCount: 2, evidenceCount: 0 } }))).rejects.toThrow('Invalid journal draft audit change')
    report.staticAudit = true
  })
})
