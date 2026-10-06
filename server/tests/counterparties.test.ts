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
const { CounterpartiesService } = require('../dist/counterparties/counterparties.service.js') as typeof import('../src/counterparties/counterparties.service')
const { AUTH_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const argon2 = require('argon2') as typeof import('argon2')
const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f02-counterparties-foundation')
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

// [F02 통합 검증] 실제 AppModule/HTTP/guard/트랜잭션을 사용한다. 기본 DB는 모든 테이블 해시로 보존 확인한다.
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local database setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await snapshotBase()
  databaseName = `atms_verify_counterparty_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_counterparty_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification database')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  url.pathname = `/${databaseName}`
  process.env.DATABASE_URL = url.toString()
  process.env.AUTH_WEB_ORIGIN = origin
  try { execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env: process.env, stdio: 'pipe', timeout: 30000 }) }
  catch { throw new Error('Isolated counterparty migration failed') }
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
  await db.counterparty.deleteMany(); await db.auditEvent.deleteMany(); await db.loginRateBucket.deleteMany(); await db.userSession.deleteMany()
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
      if (created && /^atms_verify_counterparty_[a-f0-9]{16}$/.test(databaseName)) {
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
const cpPath = (suffix = '', company = companyA.id) => `/api/companies/${company}/counterparties${suffix}`
const input = (extra: Record<string, unknown> = {}) => ({ creationRequestId: randomUUID(), name: 'Example', kind: 'BOTH', ...extra })
const post = (session: Login, body = input(), company = companyA.id) => request(cpPath('', company), { method: 'POST', login: session, body })
const audits = () => db.auditEvent.findMany({ where: { type: { startsWith: 'COUNTERPARTY_' } }, orderBy: { createdAt: 'asc' } })
async function row(extra: Record<string, unknown> = {}) {
  return db.counterparty.create({ data: { companyId: companyA.id, name: 'Fixture', kind: 'BOTH', creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64), ...extra } as never })
}

describe('F02 real counterparty API', () => {
  it('creates normalized minimal data without reauthentication and returns only allowlisted fields', async () => {
    const session = await login(), result = await post(session, input({ name: ' 😀 ', businessNumber: '123-45-67890', contactName: ' ', memo: null }))
    expect(result.status).toBe(200); expect(result.data.created).toBe(true)
    expect(result.data.counterparty).toMatchObject({ name: '😀', kind: 'BOTH', businessNumber: '1234567890', contactName: null, active: true, version: 1, companyId: companyA.id })
    expect(Object.keys(result.data.counterparty).sort()).toEqual(['id', 'companyId', 'name', 'kind', 'businessNumber', 'contactName', 'email', 'phone', 'address', 'memo', 'active', 'version', 'createdAt', 'updatedAt'].sort())
    expect(result.response.headers.get('cache-control')).toBe('no-store'); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect((await db.userSession.findFirstOrThrow()).reauthenticatedAt).toBeNull(); expect(await audits()).toHaveLength(1)
    evidence.strictMinimalResponseAndNoReauth = true
  })
  it.each(['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as const)('enforces role %s for every read/write action', async role => {
    await db.companyMemberRole.updateMany({ where: { membershipId: membershipA.id }, data: { role } })
    const session = await login(), existing = await row(), allowed = ['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role)
    expect((await request(cpPath(), { login: session })).status).toBe(200)
    expect((await request(cpPath('/' + existing.id), { login: session })).status).toBe(200)
    expect((await post(session)).status).toBe(allowed ? 200 : 403)
    expect((await request(cpPath('/' + existing.id), { method: 'PATCH', login: session, body: { name: 'Updated', version: 1 } })).status).toBe(allowed ? 200 : 403)
    expect((await request(cpPath('/' + existing.id + '/deactivate'), { method: 'POST', login: session, body: { version: allowed ? 2 : 1 } })).status).toBe(allowed ? 200 : 403)
    evidence['role_' + role] = true
  })
  it('unions READ_ONLY with ACCOUNTANT and rejects foreign company routes and foreign IDs', async () => {
    await db.companyMemberRole.updateMany({ where: { membershipId: membershipA.id }, data: { role: 'READ_ONLY' } })
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'ACCOUNTANT' } })
    const session = await login(), foreign = await row({ companyId: companyB.id })
    expect((await post(session)).status).toBe(200)
    for (const suffix of ['', '/' + foreign.id]) expect((await request(cpPath(suffix, companyB.id), { login: session })).status).toBe(403)
    expect((await post(session, input(), companyB.id)).status).toBe(403)
    for (const method of ['GET', 'PATCH', 'POST']) {
      const suffix = '/' + foreign.id + (method === 'POST' ? '/deactivate' : '')
      expect((await request(cpPath(suffix), { method, login: session, body: { version: 1, ...(method === 'PATCH' ? { name: 'forged' } : {}) } })).status).toBe(404)
    }
    expect((await request(cpPath(), { login: session })).data.items).toHaveLength(1)
    evidence.companyIsolationAndRoleUnion = true
  })
  it('rejects missing/revoked sessions, stopped membership, bad Origin and CSRF before business writes', async () => {
    expect((await request(cpPath())).status).toBe(401)
    const session = await login()
    for (const options of [{ origin: 'https://foreign.invalid' }, { origin: null }, { csrf: 'wrong' }]) expect((await request(cpPath(), { method: 'POST', login: session, body: input(), ...options })).status).toBe(403)
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } }); expect((await post(session)).status).toBe(403)
    await db.userSession.updateMany({ data: { revokedAt: clock } }); expect((await post(session)).status).toBe(401)
    expect(await db.counterparty.count()).toBe(0); expect(await audits()).toHaveLength(0)
    evidence.httpProtectionAndRevocation = true
  })
  it('rejects unknown HTTP fields, invalid UUIDs and repeated query values with safe errors', async () => {
    const session = await login()
    for (const body of [input({ active: false }), input({ businessNumber: 'invalid-number' }), input({ name: '\ud800' }), input({ email: 'secret-contact' })]) {
      const result = await post(session, body); expect(result.status).toBe(400); expect(JSON.stringify(result.data)).not.toMatch(/secret-contact|invalid-number|Prisma/)
    }
    for (const suffix of ['/bad-uuid', '?limit=101', '?q=a&q=b', '?active=true', '?sort=name', '?cursor=bad']) expect((await request(cpPath(suffix), { login: session })).status).toBe(400)
    expect(await db.counterparty.count()).toBe(0); evidence.strictHttpInputsAndSafeErrors = true
  })
  it('enforces company business-number uniqueness including inactive rows while allowing names/nulls and other companies', async () => {
    const session = await login(), body = input({ businessNumber: '123-45-67890' }), first = await post(session, body)
    expect(first.status).toBe(200); expect((await post(session, input({ businessNumber: '1234567890' }))).status).toBe(409)
    await db.counterparty.update({ where: { id: first.data.counterparty.id }, data: { active: false } })
    expect((await post(session, input({ businessNumber: '1234567890' }))).status).toBe(409)
    const other = await row({ companyId: companyB.id, businessNumber: '1234567890' }); expect(other.companyId).toBe(companyB.id)
    expect((await post(session)).status).toBe(200); expect((await post(session)).status).toBe(200)
    expect(await audits()).toHaveLength(3); evidence.companyNumberPolicy = true
  })
  it('serializes concurrent different requests for the same number into one create and one conflict', async () => {
    const session = await login(), results = await Promise.all([post(session, input({ businessNumber: '1234567890' })), post(session, input({ businessNumber: '1234567890' }))])
    expect(results.map(result => result.status).sort()).toEqual([200, 409]); expect(await db.counterparty.count()).toBe(1); expect(await audits()).toHaveLength(1)
    evidence.concurrentNumberConflict = true
  })
  it('replays normalized requests without extra rows or audits, rejects different input and returns current edited row', async () => {
    const session = await login(), body = input({ name: ' First ', businessNumber: '123-45-67890' }), first = await post(session, body)
    const normalizedBody = { ...body, name: 'First', businessNumber: '1234567890', email: null, memo: '' }
    const replay = await post(session, normalizedBody); expect(replay.status).toBe(200); expect(replay.data.created).toBe(false)
    expect((await post(session, { ...body, name: 'Other' })).status).toBe(409)
    expect((await request(cpPath('/' + first.data.counterparty.id), { method: 'PATCH', login: session, body: { version: 1, name: 'Edited' } })).status).toBe(200)
    const editedReplay = await post(session, normalizedBody); expect(editedReplay.data.counterparty).toMatchObject({ name: 'Edited', version: 2 }); expect(editedReplay.data.created).toBe(false)
    expect(await db.counterparty.count()).toBe(1); expect(await audits()).toHaveLength(2); evidence.normalizedReplayAndCurrentView = true
  })
  it('handles concurrent replay and response-loss explicit retry with one success audit', async () => {
    const session = await login(), body = input(), results = await Promise.all([post(session, body), post(session, body)])
    expect(results.map(result => result.status)).toEqual([200, 200]); expect(results.map(result => result.data.created).sort()).toEqual([false, true])
    // 첫 응답을 잃었다고 가정하고 같은 생성 요청 ID로 명시적으로 재시도한다.
    expect((await post(session, body)).data.created).toBe(false); expect(await db.counterparty.count()).toBe(1); expect(await audits()).toHaveLength(1)
    evidence.concurrentReplayAndLostResponse = true
  })
  it('scopes creation request IDs to the company', async () => {
    const member = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userA.id } })
    await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: member.id, role: 'ACCOUNTANT' } })
    const session = await login(), body = input(); expect((await post(session, body)).status).toBe(200); expect((await post(session, body, companyB.id)).status).toBe(200)
    expect(await db.counterparty.count()).toBe(2); evidence.companyScopedRequestId = true
  })
  it('checks stale versions before no-op and changes only supplied fields with one version increment', async () => {
    const session = await login(), existing = await row({ email: 'a@example.invalid', phone: '123' }), url = cpPath('/' + existing.id)
    expect((await request(url, { method: 'PATCH', login: session, body: { version: 1, name: 'Fixture' } })).status).toBe(200)
    expect(await db.counterparty.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing); expect(await audits()).toHaveLength(0)
    const changed = await request(url, { method: 'PATCH', login: session, body: { version: 1, memo: ' Updated ', email: null } })
    expect(changed.status).toBe(200); expect(changed.data).toMatchObject({ memo: 'Updated', email: null, phone: '123', version: 2 })
    expect((await request(url, { method: 'PATCH', login: session, body: { version: 1, memo: 'Updated' } })).status).toBe(409)
    expect(await audits()).toHaveLength(1); evidence.patchNoOpStaleAndPartial = true
  })
  it('preserves ID on deactivate, no-ops latest repeat, rejects stale/rewrite and respects version ceiling', async () => {
    const session = await login(), existing = await row(), url = cpPath('/' + existing.id)
    expect((await request(url + '/deactivate', { method: 'POST', login: session, body: { version: 1 } })).data).toMatchObject({ id: existing.id, active: false, version: 2 })
    expect((await request(url + '/deactivate', { method: 'POST', login: session, body: { version: 2 } })).status).toBe(200)
    expect((await request(url + '/deactivate', { method: 'POST', login: session, body: { version: 1 } })).status).toBe(409)
    expect((await request(url, { method: 'PATCH', login: session, body: { version: 2, name: 'Fixture' } })).status).toBe(409)
    const ceiling = await row({ version: 2147483647 }), ceilingUrl = cpPath('/' + ceiling.id)
    expect((await request(ceilingUrl, { method: 'PATCH', login: session, body: { version: 2147483647, name: 'Fixture' } })).status).toBe(200)
    expect((await request(ceilingUrl, { method: 'PATCH', login: session, body: { version: 2147483647, name: 'Changed' } })).status).toBe(409)
    expect((await request(ceilingUrl + '/deactivate', { method: 'POST', login: session, body: { version: 2147483647 } })).status).toBe(409)
    expect(await audits()).toHaveLength(1); evidence.deactivateAndCeiling = true
  })
  it('serializes same-version update versus deactivate and rolls back duplicate-number edits', async () => {
    const session = await login(), existing = await row(), url = cpPath('/' + existing.id)
    const results = await Promise.all([request(url, { method: 'PATCH', login: session, body: { version: 1, name: 'Changed' } }), request(url + '/deactivate', { method: 'POST', login: session, body: { version: 1 } })])
    expect(results.map(result => result.status).sort()).toEqual([200, 409]); expect(await audits()).toHaveLength(1)
    const first = await row({ businessNumber: '1234567890' }), second = await row({ businessNumber: '1234567891' })
    expect((await request(cpPath('/' + second.id), { method: 'PATCH', login: session, body: { version: 1, businessNumber: first.businessNumber } })).status).toBe(409)
    expect(await db.counterparty.findUniqueOrThrow({ where: { id: second.id } })).toEqual(second); evidence.concurrentVersionAndDuplicateRollback = true
  })
  it.each(['create', 'update', 'deactivate'] as const)('rechecks live state before %s after guard authorization', async stage => {
    const service = app.get(CounterpartiesService) as any, session = await login(), existing = await row(), original = service.lockUser.bind(service)
    vi.spyOn(service, 'lockUser').mockImplementationOnce(async (...args: any[]) => {
      await db.companyMemberRole.updateMany({ where: { membershipId: membershipA.id }, data: { role: 'READ_ONLY' } }); return original(...args)
    })
    const result = stage === 'create' ? await post(session) : await request(cpPath('/' + existing.id + (stage === 'deactivate' ? '/deactivate' : '')), {
      method: stage === 'update' ? 'PATCH' : 'POST', login: session, body: { version: 1, ...(stage === 'update' ? { name: 'Changed' } : {}) } })
    expect(result.status).toBe(403); expect(await db.counterparty.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
    expect(await db.counterparty.count()).toBe(1); expect(await audits()).toHaveLength(0); evidence['lockedAction_' + stage] = true
  })
  it.each(['role', 'membership', 'account', 'session', 'token'] as const)('rechecks %s after guard authorization', async kind => {
    const service = app.get(CounterpartiesService) as any, session = await login(), original = service.lockUser.bind(service)
    vi.spyOn(service, 'lockUser').mockImplementationOnce(async (...args: any[]) => {
      if (kind === 'role') await db.companyMemberRole.updateMany({ where: { membershipId: membershipA.id }, data: { role: 'READ_ONLY' } })
      if (kind === 'membership') await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
      if (kind === 'account') await db.user.update({ where: { id: userA.id }, data: { disabledAt: clock } })
      if (kind === 'session') await db.userSession.updateMany({ where: { tokenHash: hashToken(session.raw) }, data: { revokedAt: clock } })
      if (kind === 'token') await db.userSession.updateMany({ where: { tokenHash: hashToken(session.raw) }, data: { tokenHash: hashToken('replaced') } })
      return original(...args)
    })
    expect((await post(session)).status).toBe(['role', 'membership'].includes(kind) ? 403 : 401)
    expect(await db.counterparty.count()).toBe(0); expect(await audits()).toHaveLength(0); evidence['lockedRecheck_' + kind] = true
  })
  it.each(['create', 'update', 'deactivate'] as const)('rolls back %s when atomic audit fails', async stage => {
    const session = await login(), existing = await row(), audit = app.get(AuditService)
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('private audit write failure'))
    const result = stage === 'create' ? await post(session) : await request(cpPath('/' + existing.id + (stage === 'deactivate' ? '/deactivate' : '')), {
      method: stage === 'update' ? 'PATCH' : 'POST', login: session, body: { version: 1, ...(stage === 'update' ? { name: 'Changed' } : {}) } })
    expect(result.status).toBe(500); expect(JSON.stringify(result.data)).not.toContain('private')
    expect(await db.counterparty.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing); expect(await db.counterparty.count()).toBe(1); expect(await audits()).toHaveLength(0)
    evidence['auditRollback_' + stage] = true
  })
  it('filters active/kind/name/number with stable cursor and rejects foreign/filter/unknown cursor', async () => {
    const first = await row({ id: 'c1000000-0000-4000-8000-000000000001', name: 'Alpha', kind: 'CUSTOMER', businessNumber: '1234567890' })
    const second = await row({ id: 'c1000000-0000-4000-8000-000000000002', name: 'Alpha Both' })
    const third = await row({ id: 'c1000000-0000-4000-8000-000000000003', name: 'Stopped', kind: 'SUPPLIER', active: false })
    const foreign = await row({ companyId: companyB.id }), session = await login()
    const page = await request(cpPath('?limit=1'), { login: session }); expect(page.data.items.map((item: any) => item.id)).toEqual([first.id]); expect(page.data.nextCursor).toBe(first.id)
    const next = await request(cpPath('?limit=1&cursor=' + first.id), { login: session }); expect(next.data.items[0].id).toBe(second.id); expect(next.data.nextCursor).toBeNull()
    expect((await request(cpPath('?kind=CUSTOMER'), { login: session })).data.items).toHaveLength(2)
    expect((await request(cpPath('?kind=SUPPLIER&active=all'), { login: session })).data.items).toHaveLength(2)
    expect((await request(cpPath('?q=alpha'), { login: session })).data.items).toHaveLength(2)
    expect((await request(cpPath('?q=123-45'), { login: session })).data.items.map((item: any) => item.id)).toEqual([first.id])
    expect((await request(cpPath('?q=---'), { login: session })).data.items).toHaveLength(0)
    expect((await request(cpPath('?active=inactive'), { login: session })).data.items[0].id).toBe(third.id)
    for (const query of ['?cursor=' + foreign.id, '?cursor=' + randomUUID(), '?cursor=' + third.id, '?kind=SUPPLIER&cursor=' + first.id]) expect((await request(cpPath(query), { login: session })).status).toBe(400)
    evidence.filtersAndCursor = true
  })
  it('preserves other companies/users/roles and device identity while GET does not extend activity', async () => {
    await login(); const session = await login(), other = await login(userB), foreign = await row({ companyId: companyB.id })
    const before = await db.userSession.findMany({ orderBy: { id: 'asc' } }), companies = await db.company.findMany({ orderBy: { id: 'asc' } })
    const users = await db.user.findMany({ orderBy: { id: 'asc' } }), roles = await db.companyMemberRole.findMany({ orderBy: { membershipId: 'asc' } })
    clock = new Date(baseTime.getTime() + 1000)
    expect((await request(cpPath(), { login: session })).status).toBe(200); expect(await db.userSession.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
    expect((await post(session)).status).toBe(200)
    const after = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    expect(after.map(row => [row.id, row.tokenHash, row.csrfTokenHash, row.absoluteExpiresAt, row.revokedAt])).toEqual(before.map(row => [row.id, row.tokenHash, row.csrfTokenHash, row.absoluteExpiresAt, row.revokedAt]))
    expect(after.find(row => row.tokenHash === hashToken(session.raw))!.lastActivityAt).toEqual(clock)
    expect(after.filter(row => row.tokenHash !== hashToken(session.raw))).toEqual(before.filter(row => row.tokenHash !== hashToken(session.raw)))
    expect((await request('/api/auth/session', { login: other })).status).toBe(200)
    expect(await db.company.findMany({ orderBy: { id: 'asc' } })).toEqual(companies); expect(await db.user.findMany({ orderBy: { id: 'asc' } })).toEqual(users)
    expect(await db.companyMemberRole.findMany({ orderBy: { membershipId: 'asc' } })).toEqual(roles); expect(await db.counterparty.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign)
    evidence.sessionIdentityAndOtherRowsPreserved = true; evidence.getDoesNotExtendActivity = true
  })
  it('records only IDs/field names/state and rolls back a genuine DB constraint failure', async () => {
    const session = await login(), created = await post(session, input({ email: 'private-contact@example.invalid', businessNumber: '1234567890' })), id = created.data.counterparty.id
    expect((await request(cpPath('/' + id), { method: 'PATCH', login: session, body: { version: 1, memo: 'private-memo' } })).status).toBe(200)
    expect((await request(cpPath('/' + id + '/deactivate'), { method: 'POST', login: session, body: { version: 2 } })).status).toBe(200)
    const events = await audits(); expect(events.map(event => event.type)).toEqual(['COUNTERPARTY_CREATED', 'COUNTERPARTY_UPDATED', 'COUNTERPARTY_DEACTIVATED'])
    expect(JSON.stringify(events.map(event => event.details))).not.toMatch(/private-contact|private-memo|1234567890|creationInputHash/)
    const audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementationOnce(async (tx, event) => { await original(tx, event); await tx.counterparty.update({ where: { id: (event.change as any).counterpartyId }, data: { version: 0 } }) })
    expect((await post(session)).status).toBe(500); expect(await db.counterparty.count()).toBe(1); expect(await audits()).toHaveLength(3)
    evidence.auditAllowlistAndGenuineDbRollback = true
  })
})
