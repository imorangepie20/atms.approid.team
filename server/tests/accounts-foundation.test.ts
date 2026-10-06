import { createRequire } from 'node:module'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { config as loadEnv } from 'dotenv'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { SessionService, hashToken } = require('../dist/auth/session.service.js') as typeof import('../src/auth/session.service')
const { AuditService } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
const { AccountsService } = require('../dist/accounts/accounts.service.js') as typeof import('../src/accounts/accounts.service')
const { AUTH_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const argon2 = require('argon2') as typeof import('argon2')
const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f04-accounts')
const origin = 'http://127.0.0.1:4173'
const baseTime = new Date('2026-10-05T00:00:00Z')
const password = 'isolated test passphrase with spaces '
let clock = new Date(baseTime)
let app: INestApplication, db: InstanceType<typeof PrismaClient>, admin: InstanceType<typeof PrismaClient>
let originalUrl: string, databaseName: string, metadata: unknown, address: string
let created = false
let userA: { id: string; email: string }, userB: { id: string; email: string }
let companyA: { id: string }, companyB: { id: string }, membershipA: { id: string }
const evidence: Record<string, unknown> = {}
type Login = { cookie: string; csrf: string; raw: string; data: Record<string, any> }
async function request(path: string, options: { method?: string; login?: Login; body?: unknown; origin?: string | null; csrf?: string; headers?: Record<string, string> } = {}) {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { ...options.headers }
  if (method !== 'GET') { headers['content-type'] = 'application/json'; if (options.origin !== null) headers.origin = options.origin ?? origin }
  if (options.login) { headers.cookie = options.login.cookie; headers['x-csrf-token'] = options.csrf ?? options.login.csrf }
  const response = await fetch(`${address}${path}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}) })
  return { response, status: response.status, data: await response.json() }
}
async function login(user = userA): Promise<Login> {
  const result = await request('/api/auth/login', { method: 'POST', body: { email: user.email, password } })
  expect(result.status).toBe(200)
  const cookie = result.response.headers.get('set-cookie')!.split(';')[0]
  return { cookie, raw: cookie.split('=')[1], csrf: result.data.csrfToken, data: result.data }
}

const companyPath = (suffix = '') => `/api/companies/${companyA.id}${suffix}`
let firstYearId: string
async function confirmed(user = userA) {
  const session = await login(user)
  expect((await request('/api/auth/reauthenticate', { method: 'POST', login: session, body: { password } })).status).toBe(200)
  return session
}

// [F04-01 K2~K7 통합 검증] 실제 AppModule/HTTP/guard/트랜잭션을 사용한다. 기본 DB는 모든 테이블 해시로 보존 확인한다.
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local database setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await snapshotBase()
  databaseName = `atms_verify_accounts_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_accounts_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification database')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  url.pathname = `/${databaseName}`
  process.env.DATABASE_URL = url.toString()
  process.env.AUTH_WEB_ORIGIN = origin
  try { execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env: process.env, stdio: 'pipe', timeout: 30000 }) }
  catch { throw new Error('Isolated accounts migration failed') }
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }) })
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB, timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  userA = await db.user.create({ data: { email: 'company-a@example.invalid', emailNormalized: 'company-a@example.invalid', passwordHash: hash, emailVerifiedAt: baseTime } })
  userB = await db.user.create({ data: { email: 'company-b@example.invalid', emailNormalized: 'company-b@example.invalid', passwordHash: hash, emailVerifiedAt: baseTime } })
  companyA = await db.company.create({ data: { name: 'Existing company A' } })
  companyB = await db.company.create({ data: { name: 'Existing company B' } })
  firstYearId = (await db.fiscalYear.create({ data: { companyId: companyA.id, startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') } })).id
  await db.fiscalYear.create({ data: { companyId: companyB.id, startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') } })
  app = await NestFactory.create(AppModule, { logger: false })
  configureApp(app, readAppConfig()); await app.listen(0, '127.0.0.1'); address = await app.getUrl()
  evidence.isolatedDatabase = databaseName
}, 120000)
beforeEach(async () => {
  vi.restoreAllMocks(); clock = new Date(baseTime)
  vi.spyOn(SessionService.prototype, 'now').mockImplementation(() => new Date(clock))
  await db.companyAccount.deleteMany(); await db.auditEvent.deleteMany(); await db.loginRateBucket.deleteMany(); await db.userSession.deleteMany()
  await db.companyMemberRole.deleteMany(); await db.companyMembership.deleteMany()
  await db.fiscalYear.deleteMany({ where: { companyId: { notIn: [companyA.id, companyB.id] } } })
  await db.company.deleteMany({ where: { id: { notIn: [companyA.id, companyB.id] } } })
  await db.fiscalYear.deleteMany({ where: { companyId: companyA.id, id: { not: firstYearId } } })
  await db.company.update({ where: { id: companyA.id }, data: { name: 'Existing company A', version: 1, allowSelfApproval: false } })
  await db.user.updateMany({ where: { id: { in: [userA.id, userB.id] } }, data: { disabledAt: null, emailVerifiedAt: baseTime } })
  membershipA = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userA.id } })
  await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'COMPANY_ADMIN' } })
  const memberB = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userB.id } })
  await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: memberB.id, role: 'READ_ONLY' } })
})
afterAll(async () => {
  vi.restoreAllMocks()
  try {
    if (app) await app.close(); if (db) await db.$disconnect()
    process.env.DATABASE_URL = originalUrl
    if (admin) {
      const after = await snapshotBase(); expect(after).toEqual(metadata); evidence.baseBefore = metadata; evidence.baseAfter = after; evidence.baseUnchanged = true
      evidence.originalMetadataPreserved = true
      evidence.originalMetadataHash = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      if (created && /^atms_verify_accounts_[a-f0-9]{16}$/.test(databaseName)) {
        // [F08-16 IDE 수리] count(*)::int 응답의 타입을 명시한다. SQL과 시험 동작은 유지한다.
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); evidence.onlyCreatedDatabaseRemoved = true; const remaining = await admin.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_database WHERE datname=${databaseName}`; expect(remaining[0].count).toBe(0)
      }
    }
  } finally {
    if (admin) await admin.$disconnect()
    mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

// 테이블명은 PostgreSQL이 반환한 정적 영문 식별자만 허용한다. 내용 원문 대신 건수/해시만 저장한다.
async function snapshotBase() {
  const tables = await admin.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
  const snapshot: Record<string, unknown> = {}
  for (const { tablename } of tables) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('Invalid known table')
    snapshot[tablename] = await admin.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${tablename}" t`)
  }
  return snapshot
}

const accountPath = (suffix = '', company = companyA.id) => `/api/companies/${company}/accounts${suffix}`
const input = (extra: Record<string, unknown> = {}) => ({ creationRequestId: randomUUID(), code: randomUUID().slice(0, 8).toUpperCase(),
  name: 'Account', category: 'ASSET', normalBalance: 'DEBIT', ...extra })
const post = (session: Login, body = input(), company = companyA.id) => request(accountPath('', company), { method: 'POST', login: session, body })
const audits = () => db.auditEvent.findMany({ where: { type: { in: ['ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'ACCOUNT_DEACTIVATED'] } }, orderBy: { createdAt: 'asc' } })
const row = (extra: Record<string, unknown> = {}) => db.companyAccount.create({ data: { companyId: companyA.id, code: randomUUID().slice(0, 8).toUpperCase(), name: 'Fixture',
  category: 'ASSET', normalBalance: 'DEBIT', ...extra } as never })

describe('F04 real accounts API', () => {
  it('creates an explicitly classified account without reauthentication and exposes only its view', async () => {
    const session = await login(), result = await post(session, input({ code: ' a-1_ ', name: ' 😀 ', normalBalance: 'CREDIT' }))
    expect(result.status).toBe(200)
    expect(result.data).toMatchObject({ code: 'A-1_', name: '😀', category: 'ASSET', normalBalance: 'CREDIT', active: true, version: 1, canUseInJournal: true })
    expect(Object.keys(result.data).sort()).toEqual(['id', 'code', 'name', 'category', 'normalBalance', 'active', 'version', 'canUseInJournal'].sort())
    expect(result.response.headers.get('cache-control')).toBe('no-store'); expect(result.response.headers.get('set-cookie')).toBeNull()
    const detail = await request(accountPath('/' + result.data.id), { login: session })
    expect(detail.data).toEqual(result.data); expect(detail.response.headers.get('cache-control')).toBe('no-store')
    evidence.allowlistedCreateAndDetail = true
  })
  it.each(['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'])('grants reading to %s and management only to administrator', async role => {
    await db.companyMemberRole.updateMany({ where: { membershipId: membershipA.id }, data: { role: role as never } })
    const session = await login(), existing = await row(), expected = role === 'COMPANY_ADMIN' ? 200 : 403
    expect((await request(accountPath(), { login: session })).status).toBe(200)
    expect((await request(accountPath('/' + existing.id), { login: session })).status).toBe(200)
    expect((await post(session)).status).toBe(expected)
    expect((await request(accountPath('/' + existing.id), { method: 'PATCH', login: session, body: { version: 1, name: 'Changed' } })).status).toBe(expected)
    expect((await request(accountPath('/' + existing.id + '/deactivate'), { method: 'POST', login: session, body: { version: expected === 200 ? 2 : 1 } })).status).toBe(expected)
    evidence['role_' + role] = true
  })
  it('unions administrator and read-only roles without granting management to the accountant/approver combination', async () => {
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'READ_ONLY' } })
    const session = await login(); expect((await post(session)).status).toBe(200)
    await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } })
    await db.companyMemberRole.createMany({ data: ['ACCOUNTANT', 'APPROVER'].map(role => ({ companyId: companyA.id, membershipId: membershipA.id, role: role as never })) })
    expect((await request(accountPath(), { login: session })).status).toBe(200); expect((await post(session)).status).toBe(403)
    evidence.roleUnion = true
  })
  it('rejects unauthenticated, Origin and CSRF writes before account storage', async () => {
    const session = await login()
    expect((await request(accountPath())).status).toBe(401)
    expect((await request(accountPath(), { method: 'POST', body: input() })).status).toBe(401)
    for (const options of [{ origin: null }, { origin: 'http://example.invalid' }, { csrf: 'invalid' }])
      expect((await request(accountPath(), { method: 'POST', login: session, body: input(), ...options })).status).toBe(403)
    expect(await db.companyAccount.count()).toBe(0); expect(await audits()).toHaveLength(0); evidence.authOriginCsrf = true
  })
  it('isolates company rows, avoids foreign ID disclosure and rechecks revoked membership', async () => {
    const session = await login(), foreign = await row({ companyId: companyB.id })
    expect((await request(accountPath('', companyB.id), { login: session })).status).toBe(403)
    expect((await post(session, input(), companyB.id)).status).toBe(403)
    for (const id of [foreign.id, randomUUID()]) {
      expect((await request(accountPath('/' + id), { login: session })).status).toBe(404)
      expect((await request(accountPath('/' + id), { method: 'PATCH', login: session, body: { version: 1, name: 'Changed' } })).status).toBe(404)
      expect((await request(accountPath('/' + id + '/deactivate'), { method: 'POST', login: session, body: { version: 1 } })).status).toBe(404)
    }
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
    expect((await request(accountPath(), { login: session })).status).toBe(403); expect((await post(session)).status).toBe(403)
    expect(await db.companyAccount.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign); evidence.companyIsolation = true
  })
  it('rejects unsafe HTTP bodies, query repetition and forbidden patch fields without leaking their values', async () => {
    const session = await login(), existing = await row()
    for (const body of [input({ active: false }), input({ name: '\ud800' }), input({ code: 'PRIVATE VALUE' }), input({ category: 'private-category' }), input({ sourceTemplateItemId: randomUUID() })]) {
      const result = await post(session, body); expect(result.status).toBe(400); expect(JSON.stringify(result.data)).not.toMatch(/PRIVATE VALUE|private-category|Prisma/)
    }
    for (const body of [{ version: 1, code: 'OTHER' }, { version: 1, active: false }, { version: 1, category: 'ASSET' }])
      expect((await request(accountPath('/' + existing.id), { method: 'PATCH', login: session, body })).status).toBe(400)
    for (const suffix of ['/bad-uuid', '?limit=101', '?q=a&q=b', '?category=bad', '?active=true', '?sort=name', '?cursor=bad'])
      expect((await request(accountPath(suffix), { login: session })).status).toBe(400)
    evidence.strictHttpInputsAndSafeErrors = true
  })
  it('replays normalized creation after edits and deactivation without duplicate rows or audit', async () => {
    const session = await login(), body = input({ code: ' replay ', name: ' Original ' }), first = await post(session, body), id = first.data.id
    expect(first.status).toBe(200)
    expect((await post(session, { ...body, code: 'REPLAY', name: 'Original' })).data.id).toBe(id)
    expect((await post(session, { ...body, name: 'Different' })).status).toBe(409)
    expect((await request(accountPath('/' + id), { method: 'PATCH', login: session, body: { version: 1, name: 'Edited' } })).status).toBe(200)
    expect((await post(session, body)).data).toMatchObject({ id, name: 'Edited', version: 2 })
    expect((await request(accountPath('/' + id + '/deactivate'), { method: 'POST', login: session, body: { version: 2 } })).status).toBe(200)
    expect((await post(session, body)).data).toMatchObject({ id, active: false, version: 3, canUseInJournal: false })
    expect(await db.companyAccount.count()).toBe(1); expect(await audits()).toHaveLength(3); evidence.normalizedReplayCurrentView = true
  })
  it('handles concurrent and lost-response creation retries with one account and one audit', async () => {
    const session = await login(), body = input(), results = await Promise.all([post(session, body), post(session, body)])
    expect(results.map(result => result.status)).toEqual([200, 200]); expect(results[0].data.id).toBe(results[1].data.id)
    expect((await post(session, body)).data.id).toBe(results[0].data.id)
    expect(await db.companyAccount.count()).toBe(1); expect(await audits()).toHaveLength(1); evidence.concurrentReplay = true
  })
  it('serializes normalized code collisions and reserves stopped and legacy codes', async () => {
    const session = await login(), results = await Promise.all([post(session, input({ code: ' same ' })), post(session, input({ code: 'SAME' }))])
    expect(results.map(result => result.status).sort()).toEqual([200, 409]); expect(await db.companyAccount.count()).toBe(1)
    const id = results.find(result => result.status === 200)!.data.id
    expect((await request(accountPath('/' + id + '/deactivate'), { method: 'POST', login: session, body: { version: 1 } })).status).toBe(200)
    expect((await post(session, input({ code: 'same' }))).status).toBe(409)
    await row({ code: '\t legacy\t', category: null, normalBalance: null })
    expect((await post(session, input({ code: 'LEGACY' }))).status).toBe(409)
    expect(await audits()).toHaveLength(2); evidence.concurrentCodeAndLegacyReservation = true
  })
  it('scopes both code and creation request to the company', async () => {
    const member = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userA.id } })
    await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: member.id, role: 'COMPANY_ADMIN' } })
    const session = await login(), body = input({ code: 'SHARED' })
    const first = await post(session, body), second = await post(session, body, companyB.id)
    expect(first.status).toBe(200); expect(second.status).toBe(200); expect(first.data.id).not.toBe(second.data.id)
    expect(await db.companyAccount.count()).toBe(2); evidence.companyScopedRequestAndCode = true
  })
  it.each(['create', 'update', 'deactivate'] as const)('stops %s before writes when legacy code normalization is ambiguous', async stage => {
    const first = await row({ code: ' legacy ', category: null, normalBalance: null }), second = await row({ code: 'LEGACY' }), session = await login()
    const result = stage === 'create' ? await post(session) : await request(accountPath('/' + first.id + (stage === 'deactivate' ? '/deactivate' : '')), {
      method: stage === 'update' ? 'PATCH' : 'POST', login: session, body: { version: 1, ...(stage === 'update' ? { name: 'Changed' } : {}) } })
    expect(result.status).toBe(409); expect(await db.companyAccount.findUniqueOrThrow({ where: { id: first.id } })).toEqual(first)
    expect(await db.companyAccount.findUniqueOrThrow({ where: { id: second.id } })).toEqual(second); expect(await audits()).toHaveLength(0)
    evidence['ambiguousLegacy_' + stage] = true
  })
  it('permits exactly one explicit classification for legacy rows while preserving code and template reference', async () => {
    const template = await db.accountTemplate.create({ data: { code: randomUUID(), version: 1, name: 'Fixture template', isDevelopmentOnly: true } })
    const item = await db.accountTemplateItem.create({ data: { templateId: template.id, code: 'old', name: 'Old' } })
    const existing = await row({ code: ' old ', category: null, normalBalance: null, sourceTemplateItemId: item.id }), session = await login(), url = accountPath('/' + existing.id)
    expect((await request(url, { login: session })).data).toMatchObject({ category: null, normalBalance: null, canUseInJournal: false })
    const classified = await request(url, { method: 'PATCH', login: session, body: { version: 1, category: 'ASSET', normalBalance: 'CREDIT' } })
    expect(classified.status).toBe(200); expect(classified.data).toMatchObject({ code: ' old ', normalBalance: 'CREDIT', version: 2, canUseInJournal: true })
    expect((await db.companyAccount.findUniqueOrThrow({ where: { id: existing.id } })).sourceTemplateItemId).toBe(item.id)
    for (const category of ['ASSET', 'EXPENSE']) expect((await request(url, { method: 'PATCH', login: session, body: { version: 2, category, normalBalance: 'CREDIT' } })).status).toBe(409)
    expect(await audits()).toHaveLength(1); evidence.legacyClassificationOnce = true
  })
  it('checks stale versions before no-op, blocks stopped edits and respects the integer ceiling', async () => {
    const existing = await row(), session = await login(), url = accountPath('/' + existing.id)
    expect((await request(url, { method: 'PATCH', login: session, body: { version: 1, name: 'Fixture' } })).status).toBe(200)
    expect(await audits()).toHaveLength(0)
    expect((await request(url, { method: 'PATCH', login: session, body: { version: 1, name: 'Changed' } })).data.version).toBe(2)
    expect((await request(url, { method: 'PATCH', login: session, body: { version: 1, name: 'Changed' } })).status).toBe(409)
    expect((await request(url + '/deactivate', { method: 'POST', login: session, body: { version: 2 } })).data).toMatchObject({ id: existing.id, version: 3, active: false })
    expect((await request(url + '/deactivate', { method: 'POST', login: session, body: { version: 3 } })).status).toBe(200)
    expect((await request(url + '/deactivate', { method: 'POST', login: session, body: { version: 2 } })).status).toBe(409)
    expect((await request(url, { method: 'PATCH', login: session, body: { version: 3, name: 'Changed' } })).status).toBe(409)
    const ceiling = await row({ version: 2147483647 }), ceilingUrl = accountPath('/' + ceiling.id)
    expect((await request(ceilingUrl, { method: 'PATCH', login: session, body: { version: 2147483647, name: 'Fixture' } })).status).toBe(200)
    expect((await request(ceilingUrl, { method: 'PATCH', login: session, body: { version: 2147483647, name: 'Different' } })).status).toBe(409)
    expect((await request(ceilingUrl + '/deactivate', { method: 'POST', login: session, body: { version: 2147483647 } })).status).toBe(409)
    expect(await audits()).toHaveLength(2); evidence.versionNoopCeiling = true
  })
  it('serializes same-version edits versus deactivation into one success and one conflict', async () => {
    const existing = await row(), session = await login(), url = accountPath('/' + existing.id)
    const results = await Promise.all([request(url, { method: 'PATCH', login: session, body: { version: 1, name: 'Changed' } }),
      request(url + '/deactivate', { method: 'POST', login: session, body: { version: 1 } })])
    expect(results.map(result => result.status).sort()).toEqual([200, 409]); expect(await audits()).toHaveLength(1); evidence.versionRace = true
  })
  it.each(['role', 'membership', 'user', 'session', 'token'] as const)('rechecks %s revoked after guard authorization', async kind => {
    const service = app.get(AccountsService) as any, session = await login(), original = service.beginWrite.bind(service)
    vi.spyOn(service, 'beginWrite').mockImplementationOnce(async (...args: any[]) => {
      if (kind === 'role') await db.companyMemberRole.updateMany({ where: { membershipId: membershipA.id }, data: { role: 'READ_ONLY' } })
      if (kind === 'membership') await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
      if (kind === 'user') await db.user.update({ where: { id: userA.id }, data: { disabledAt: clock } })
      if (kind === 'session') await db.userSession.updateMany({ where: { tokenHash: hashToken(session.raw) }, data: { revokedAt: clock } })
      if (kind === 'token') await db.userSession.updateMany({ where: { tokenHash: hashToken(session.raw) }, data: { tokenHash: hashToken('replaced') } })
      return original(...args)
    })
    expect((await post(session)).status).toBe(['role', 'membership'].includes(kind) ? 403 : 401)
    expect(await db.companyAccount.count()).toBe(0); expect(await audits()).toHaveLength(0); evidence['liveRecheck_' + kind] = true
  })
  it.each(['create', 'update', 'deactivate'] as const)('rolls back %s when audit persistence fails', async stage => {
    const existing = await row(), session = await login()
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('private audit failure'))
    const result = stage === 'create' ? await post(session) : await request(accountPath('/' + existing.id + (stage === 'deactivate' ? '/deactivate' : '')), {
      method: stage === 'update' ? 'PATCH' : 'POST', login: session, body: { version: 1, ...(stage === 'update' ? { name: 'Changed' } : {}) } })
    expect(result.status).toBe(500); expect(JSON.stringify(result.data)).not.toContain('private')
    expect(await db.companyAccount.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
    expect(await db.companyAccount.count()).toBe(1); expect(await audits()).toHaveLength(0); evidence['auditRollback_' + stage] = true
  })
  it('filters active/category/name/code with stable cursor and rejects foreign or filtered cursors', async () => {
    const first = await row({ id: 'c1000000-0000-4000-8000-000000000001', code: 'ALPHA1', name: 'Alpha' })
    const second = await row({ id: 'c1000000-0000-4000-8000-000000000002', code: 'ALPHA2', name: 'Another', category: 'EXPENSE' })
    const stopped = await row({ id: 'c1000000-0000-4000-8000-000000000003', active: false })
    const foreign = await row({ companyId: companyB.id }), session = await login()
    const page = await request(accountPath('?limit=1'), { login: session })
    expect(page.data.items.map((item: any) => item.id)).toEqual([first.id]); expect(page.data.nextCursor).toBe(first.id)
    const next = await request(accountPath('?limit=1&cursor=' + first.id), { login: session })
    expect(next.data.items[0].id).toBe(second.id); expect(next.data.nextCursor).toBeNull()
    expect((await request(accountPath('?q=alpha'), { login: session })).data.items).toHaveLength(2)
    expect((await request(accountPath('?category=EXPENSE'), { login: session })).data.items[0].id).toBe(second.id)
    expect((await request(accountPath('?active=inactive'), { login: session })).data.items[0]).toMatchObject({ id: stopped.id, canUseInJournal: false })
    expect((await request(accountPath('?active=all'), { login: session })).data.items).toHaveLength(3)
    for (const query of ['?cursor=' + foreign.id, '?cursor=' + randomUUID(), '?cursor=' + stopped.id, '?category=EXPENSE&cursor=' + first.id])
      expect((await request(accountPath(query), { login: session })).status).toBe(400)
    evidence.filtersAndCursor = true
  })
  it('records three safe audit events and rolls back a genuine DB constraint failure', async () => {
    const session = await login(), first = await post(session, input({ name: 'private-name', code: 'PRIVATE-CODE' })), id = first.data.id
    expect((await request(accountPath('/' + id), { method: 'PATCH', login: session, body: { version: 1, name: 'private-changed' } })).status).toBe(200)
    expect((await request(accountPath('/' + id + '/deactivate'), { method: 'POST', login: session, body: { version: 2 } })).status).toBe(200)
    const events = await audits(); expect(events.map(event => event.type)).toEqual(['ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'ACCOUNT_DEACTIVATED'])
    expect(JSON.stringify(events.map(event => event.details))).not.toMatch(/private-name|private-changed|PRIVATE-CODE|creationInputHash/)
    const audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementationOnce(async (tx, event) => {
      await original(tx, event); await tx.companyAccount.update({ where: { id: (event.change as any).accountId }, data: { version: 0 } })
    })
    expect((await post(session)).status).toBe(500); expect(await db.companyAccount.count()).toBe(1); expect(await audits()).toHaveLength(3)
    evidence.auditAllowlistAndDbRollback = true
  })
  it('preserves other rows and session identity and keeps GET read-only', async () => {
    const session = await login(), other = await login(userB), foreign = await row({ companyId: companyB.id })
    const before = await db.userSession.findMany({ orderBy: { id: 'asc' } }), companies = await db.company.findMany({ orderBy: { id: 'asc' } })
    const users = await db.user.findMany({ orderBy: { id: 'asc' } }), roles = await db.companyMemberRole.findMany({ orderBy: { membershipId: 'asc' } })
    clock = new Date(baseTime.getTime() + 1000)
    expect((await request(accountPath(), { login: session })).status).toBe(200)
    expect(await db.userSession.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
    expect((await post(session)).status).toBe(200)
    const after = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    expect(after.map(row => [row.id, row.tokenHash, row.csrfTokenHash, row.absoluteExpiresAt, row.revokedAt]))
      .toEqual(before.map(row => [row.id, row.tokenHash, row.csrfTokenHash, row.absoluteExpiresAt, row.revokedAt]))
    expect(after.find(row => row.tokenHash === hashToken(session.raw))!.lastActivityAt).toEqual(clock)
    expect(after.filter(row => row.tokenHash !== hashToken(session.raw))).toEqual(before.filter(row => row.tokenHash !== hashToken(session.raw)))
    expect((await request('/api/auth/session', { login: other })).status).toBe(200)
    expect(await db.company.findMany({ orderBy: { id: 'asc' } })).toEqual(companies); expect(await db.user.findMany({ orderBy: { id: 'asc' } })).toEqual(users)
    expect(await db.companyMemberRole.findMany({ orderBy: { membershipId: 'asc' } })).toEqual(roles)
    expect(await db.companyAccount.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign)
    evidence.getReadOnlyAndOtherRowsPreserved = true
  })
})
