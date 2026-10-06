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
const { CompaniesService } = require('../dist/companies/companies.service.js') as typeof import('../src/companies/companies.service')
const { AUTH_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const argon2 = require('argon2') as typeof import('argon2')
const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f01-company-foundation')
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

// [F08-16 IDE 수리] 생성 함수의 UUID 추론을 API 입력 타입으로 넓혀 대문자 정규화 시험도 같은 계약으로 검사한다.
const creationInput = (): import('../src/companies/companies.schemas').CreateCompanyInput => ({ creationRequestId: randomUUID(), name: '새 회사', startDate: '2026-01-01', endDate: '2026-12-31' })
const companyPath = (suffix = '') => `/api/companies/${companyA.id}${suffix}`
let firstYearId: string
async function confirmed(user = userA) {
  const session = await login(user)
  expect((await request('/api/auth/reauthenticate', { method: 'POST', login: session, body: { password } })).status).toBe(200)
  return session
}
function rotated(result: Awaited<ReturnType<typeof request>>): Login {
  const cookie = result.response.headers.get('set-cookie')!.split(';')[0]
  return { cookie, raw: cookie.split('=')[1], csrf: result.data.session.csrfToken, data: result.data.session }
}
async function create(session: Login, input = creationInput()) { return request('/api/companies', { method: 'POST', login: session, body: input }) }

// [F01 통합 검증] 실제 AppModule/HTTP/guard/트랜잭션을 사용한다. 테스트 전용 난수 DB 외 업무 데이터를 쓰지 않는다.
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local database setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
  databaseName = `atms_verify_companies_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_companies_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification database')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  url.pathname = `/${databaseName}`
  process.env.DATABASE_URL = url.toString()
  process.env.AUTH_WEB_ORIGIN = origin
  try { execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env: process.env, stdio: 'pipe', timeout: 30000 }) }
  catch { throw new Error('Isolated company migration failed') }
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
  await db.auditEvent.deleteMany(); await db.loginRateBucket.deleteMany(); await db.userSession.deleteMany()
  await db.companyMemberRole.deleteMany(); await db.companyMembership.deleteMany()
  await db.fiscalYear.deleteMany({ where: { companyId: { notIn: [companyA.id, companyB.id] } } })
  await db.company.deleteMany({ where: { id: { notIn: [companyA.id, companyB.id] } } })
  await db.fiscalYear.deleteMany({ where: { companyId: companyA.id, id: { not: firstYearId } } })
  await db.company.update({ where: { id: companyA.id }, data: { name: 'Existing company A', version: 1 } })
  await db.user.updateMany({ data: { disabledAt: null, emailVerifiedAt: baseTime } })
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
      const after = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } }); expect(after).toEqual(metadata)
      evidence.originalMetadataPreserved = true
      evidence.originalMetadataHash = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      if (created && /^atms_verify_companies_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); evidence.onlyCreatedDatabaseRemoved = true
      }
    }
  } finally {
    if (admin) await admin.$disconnect()
    mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

describe('F01 company foundation integration', () => {
  it('copies only company audit fields and rejects mismatched event details before persistence', async () => {
    const create = vi.fn().mockResolvedValue({}), tx = { auditEvent: { create } } as any
    const audit = new AuditService(), change = { kind: 'created', name: '회사', fiscalYearId: randomUUID(), startDate: '2026-01-01', endDate: '2026-12-31',
      version: 1, otherSessionsRevoked: 0, cookie: 'raw-cookie', password: 'raw-password' }
    await audit.record(tx, { type: 'COMPANY_CREATED', actorId: userA.id, companyId: companyA.id, requestId: randomUUID(), change } as any)
    expect(JSON.stringify(create.mock.calls)).not.toMatch(/raw-cookie|raw-password/)
    await expect(audit.record(tx, { type: 'COMPANY_RENAMED', actorId: userA.id, companyId: companyA.id, requestId: randomUUID(), change } as any)).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(1)
    evidence.auditWhitelist = true
  })
  it('requires active verified authentication and fresh five-minute reauthentication', async () => {
    expect((await create({ cookie: '', csrf: '', raw: '', data: {} })).status).toBe(401)
    const session = await login()
    expect((await create(session)).status).toBe(403)
    await db.user.update({ where: { id: userA.id }, data: { emailVerifiedAt: null } })
    expect((await create(session)).status).toBe(401)
    await db.user.update({ where: { id: userA.id }, data: { emailVerifiedAt: baseTime, disabledAt: baseTime } })
    expect((await create(session)).status).toBe(401)
    expect(await db.company.count()).toBe(2)
    evidence.creationAuthentication = true
  })
  it('atomically creates company, admin membership, first year and safe audit without accounts or openings', async () => {
    const session = await confirmed(), input = { ...creationInput(), name: '  등록 회사  ' }
    const result = await create(session, input)
    expect(result.status).toBe(200); expect(result.data.created).toBe(true)
    expect(result.data.company).toMatchObject({ name: '등록 회사', currency: 'KRW', allowSelfApproval: false, version: 1, accountingStandard: 'K_GAAP' })
    const row = await db.company.findUniqueOrThrow({ where: { id: result.data.company.id }, include: { memberships: { include: { roles: true } }, fiscalYears: true } })
    expect(row.createdById).toBe(userA.id); expect(row.creationRequestId).toBe(input.creationRequestId)
    expect(row.creationInputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(row.memberships).toHaveLength(1); expect(row.memberships[0]).toMatchObject({ userId: userA.id, active: true })
    expect(row.memberships[0].roles.map(role => role.role)).toEqual(['COMPANY_ADMIN'])
    expect(row.fiscalYears).toHaveLength(1); expect(row.fiscalYears[0].startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(await db.companyAccount.count()).toBe(0)
    const audit = await db.auditEvent.findFirstOrThrow({ where: { type: 'COMPANY_CREATED' } })
    expect(audit).toMatchObject({ actorId: userA.id, companyId: row.id })
    expect(audit.details).toEqual({ name: '등록 회사', fiscalYearId: row.fiscalYears[0].id, startDate: input.startDate, endDate: input.endDate,
      version: 1, creatorRole: 'COMPANY_ADMIN', otherSessionsRevoked: 0 })
    expect(result.response.headers.get('cache-control')).toBe('no-store')
    expect(JSON.stringify(result.data)).not.toContain(row.creationInputHash!)
    expect(JSON.stringify(result.data)).not.toContain(rotated(result).raw)
    evidence.creationAtomic = true
  })
  it('rolls back company, membership, period and both device changes when creation audit fails', async () => {
    const other = await login(), session = await confirmed(), before = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    const audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementation((tx, event) => event.type === 'COMPANY_CREATED' ? Promise.reject(new Error('injected audit failure')) : original(tx, event))
    const result = await create(session)
    expect(result.status).toBe(500); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect(await db.company.count()).toBe(2); expect(await db.companyMembership.count()).toBe(2); expect(await db.fiscalYear.count()).toBe(2)
    const after = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    expect(after.map(row => [row.id, row.tokenHash, row.revokedAt])).toEqual(before.map(row => [row.id, row.tokenHash, row.revokedAt]))
    expect((await request('/api/auth/session', { login: other })).status).toBe(200)
    expect((await request('/api/auth/session', { login: session })).status).toBe(200)
    expect(await db.auditEvent.count({ where: { type: 'COMPANY_CREATED' } })).toBe(0)
    evidence.creationRollback = true
  })
  it('returns the original result for normalized replay and rejects different input without duplicate grants', async () => {
    const input = creationInput(), first = await create(await confirmed(), input), session = rotated(first)
    expect(first.status).toBe(200)
    const again = await create(session, { ...input, name: `  ${input.name} `, creationRequestId: input.creationRequestId.toUpperCase() })
    expect(again.status).toBe(200); expect(again.data.created).toBe(false); expect(again.data.company.id).toBe(first.data.company.id)
    expect(again.response.headers.get('set-cookie')).toBeNull()
    expect((await create(session, { ...input, name: '다른 입력' })).status).toBe(409)
    expect(await db.company.count()).toBe(3); expect(await db.companyMemberRole.count()).toBe(3)
    expect(await db.auditEvent.count({ where: { type: 'COMPANY_CREATED' } })).toBe(1)
    evidence.creationIdempotency = true
  })
  it('serializes concurrent creation and supports relogin replay after a lost rotated cookie', async () => {
    const input = creationInput(), session = await confirmed()
    const results = await Promise.all([create(session, input), create(session, input)])
    expect(results.map(result => result.status).sort()).toEqual([200, 401])
    expect(await db.company.count()).toBe(3)
    const replay = await create(await confirmed(), input)
    expect(replay.status).toBe(200); expect(replay.data.created).toBe(false)
    expect(replay.data.company.id).toBe(results.find(result => result.status === 200)!.data.company.id)
    expect(await db.company.count()).toBe(3)
    evidence.concurrentCreation = true
  })
  it('does not restore revoked admin membership or roles on creation replay', async () => {
    const input = creationInput(), first = await create(await confirmed(), input), session = rotated(first)
    const companyId = first.data.company.id
    await db.companyMemberRole.deleteMany({ where: { companyId } })
    expect((await create(session, input)).status).toBe(403)
    expect(await db.companyMemberRole.count({ where: { companyId } })).toBe(0)
    await db.companyMembership.updateMany({ where: { companyId }, data: { active: false } })
    expect((await create(session, input)).status).toBe(403)
    evidence.replayCurrentAuthority = true
  })
  it('keeps creator request namespaces independent and permits duplicate company names', async () => {
    const input = creationInput()
    const a = await create(await confirmed(), input), b = await create(await confirmed(userB), input)
    expect(a.status).toBe(200); expect(b.status).toBe(200); expect(a.data.company.id).not.toBe(b.data.company.id)
    expect(await db.company.count({ where: { name: input.name } })).toBe(2)
    evidence.creatorNamespaces = true
  })
  it('rotates current token and CSRF, preserves UUID and absolute lifetime, revokes only same-user other devices', async () => {
    const other = await login(), otherUser = await login(userB), session = await confirmed()
    const before = await db.userSession.findUniqueOrThrow({ where: { tokenHash: hashToken(session.raw) } })
    clock = new Date(baseTime.getTime() + 4 * 60000)
    const result = await create(session), current = rotated(result)
    expect(result.status).toBe(200); expect(current.raw).not.toBe(session.raw); expect(current.csrf).not.toBe(session.csrf)
    const after = await db.userSession.findUniqueOrThrow({ where: { id: before.id } })
    expect(after.createdAt).toEqual(before.createdAt); expect(after.absoluteExpiresAt).toEqual(before.absoluteExpiresAt)
    expect(after.tokenHash).toBe(hashToken(current.raw)); expect(after.csrfTokenHash).toBe(hashToken(current.csrf))
    expect(after.idleExpiresAt).toEqual(new Date(clock.getTime() + AUTH_POLICY.idleMs))
    expect((await request('/api/auth/session', { login: session })).status).toBe(401)
    expect((await request('/api/auth/session', { login: other })).status).toBe(401)
    expect((await request('/api/auth/session', { login: otherUser })).status).toBe(200)
    expect((await request(`/api/companies/${result.data.company.id}/select`, { method: 'POST', login: current, csrf: session.csrf })).status).toBe(403)
    expect((await request('/api/auth/session', { login: current })).status).toBe(200)
    expect((await db.auditEvent.findFirstOrThrow({ where: { type: 'COMPANY_CREATED' } })).details).toMatchObject({ otherSessionsRevoked: 1 })
    evidence.sessionRotation = true
  })
  it('lists only active authorized companies and validates company cursors in current user scope', async () => {
    const session = await login()
    const first = await request('/api/companies?limit=1', { login: session })
    expect(first.status).toBe(200); expect(first.data.items.map((row: any) => row.id)).toEqual([companyA.id]); expect(first.data.nextCursor).toBeNull()
    expect((await request(`/api/companies?cursor=${companyB.id}`, { login: session })).status).toBe(400)
    expect((await request(`/api/companies?cursor=${randomUUID()}`, { login: session })).status).toBe(400)
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
    expect((await request('/api/companies', { login: session })).data.items).toEqual([])
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: true } }); await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } })
    expect((await request('/api/companies', { login: session })).data.items).toEqual([])
    evidence.listIsolation = true
  })
  it('paginates company UUID order without duplicates and rejects a cursor after access removal', async () => {
    let session = await confirmed()
    for (let i = 0; i < 2; i++) { const result = await create(session); expect(result.status).toBe(200); session = rotated(result) }
    const first = await request('/api/companies?limit=1', { login: session })
    const second = await request(`/api/companies?limit=1&cursor=${first.data.nextCursor}`, { login: session })
    const third = await request(`/api/companies?limit=1&cursor=${second.data.nextCursor}`, { login: session })
    const ids = [first, second, third].flatMap(result => result.data.items.map((row: any) => row.id))
    expect(new Set(ids).size).toBe(3); expect(ids).toEqual([...ids].sort()); expect(third.data.nextCursor).toBeNull()
    await db.companyMembership.updateMany({ where: { companyId: first.data.nextCursor, userId: userA.id }, data: { active: false } })
    expect((await request(`/api/companies?cursor=${first.data.nextCursor}`, { login: session })).status).toBe(400)
    evidence.companyPagination = true
  })
  it('restricts company detail, selection and fiscal-year reads to current membership', async () => {
    const session = await login()
    for (const path of [`/api/companies/${companyB.id}`, `/api/companies/${companyB.id}/fiscal-years`]) expect((await request(path, { login: session })).status).toBe(403)
    expect((await request(`/api/companies/${companyB.id}/select`, { method: 'POST', login: session })).status).toBe(403)
    const detail = await request(companyPath(), { login: session })
    expect(Object.keys(detail.data).sort()).toEqual(['accountingStandard', 'allowSelfApproval', 'currency', 'id', 'name', 'version'].sort())
    const selected = await request(companyPath('/select'), { method: 'POST', login: session })
    expect(selected.status).toBe(200); expect(selected.data.roles).toEqual(['COMPANY_ADMIN']); expect(selected.data.permissions).toContain('company.manage')
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
    expect((await request(companyPath(), { login: session })).status).toBe(403)
    evidence.scopeIsolation = true
  })
  it('rejects forged roles, unsupported settings, unknown query fields and invalid company IDs', async () => {
    const session = await confirmed()
    expect((await create(session, { ...creationInput(), roles: ['COMPANY_ADMIN'] } as any)).status).toBe(400)
    expect((await request(companyPath('/select'), { method: 'POST', login: session, body: { selected: true } })).status).toBe(400)
    expect((await request(companyPath(), { method: 'PATCH', login: session, body: { name: '회사', version: 1, allowSelfApproval: true } })).status).toBe(400)
    expect((await request('/api/companies?limit=1&limit=2', { login: session })).status).toBe(400)
    expect((await request('/api/companies?role=COMPANY_ADMIN', { login: session })).status).toBe(400)
    expect((await request('/api/companies/bad-id', { login: session })).status).toBe(400)
    expect(await db.company.count()).toBe(2)
    evidence.strictHttpInput = true
  })
  it('renames only for admins, rejects stale versions and leaves no-op version and audit unchanged', async () => {
    const session = await login(), result = await request(companyPath(), { method: 'PATCH', login: session, body: { name: '수정 회사', version: 1 } })
    expect(result.status).toBe(200); expect(result.data.version).toBe(2)
    expect((await request(companyPath(), { method: 'PATCH', login: session, body: { name: '덮어쓰기', version: 1 } })).status).toBe(409)
    const noop = await request(companyPath(), { method: 'PATCH', login: session, body: { name: ' 수정 회사 ', version: 2 } })
    expect(noop.status).toBe(200); expect(noop.data.version).toBe(2)
    expect(await db.auditEvent.count({ where: { type: 'COMPANY_RENAMED' } })).toBe(1)
    expect((await db.auditEvent.findFirstOrThrow({ where: { type: 'COMPANY_RENAMED' } })).details).toEqual({ nameBefore: 'Existing company A', nameAfter: '수정 회사', versionBefore: 1, versionAfter: 2 })
    const readonly = await login(userB)
    expect((await request(`/api/companies/${companyB.id}`, { method: 'PATCH', login: readonly, body: { name: '위조 수정', version: 1 } })).status).toBe(403)
    evidence.renameVersions = true
  })
  it('serializes concurrent rename and fiscal-year writes using the shared company version', async () => {
    const session = await login()
    const results = await Promise.all([
      request(companyPath(), { method: 'PATCH', login: session, body: { name: '동시 수정', version: 1 } }),
      request(companyPath('/fiscal-years'), { method: 'POST', login: session, body: { startDate: '2025-01-01', endDate: '2025-12-31', version: 1 } }),
    ])
    expect(results.map(result => result.status).sort()).toEqual([200, 409])
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).version).toBe(2)
    expect(await db.auditEvent.count({ where: { type: { in: ['COMPANY_RENAMED', 'FISCAL_YEAR_CREATED'] } } })).toBe(1)
    evidence.concurrentVersion = true
  })
  it('rechecks admin role and current session after guard authorization', async () => {
    const session = await login(), sessions = app.get(SessionService), original = sessions.extend.bind(sessions)
    vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => { await original(context); await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } }) })
    expect((await request(companyPath(), { method: 'PATCH', login: session, body: { name: '권한 경합', version: 1 } })).status).toBe(403)
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'COMPANY_ADMIN' } })
    vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => { await original(context); await db.userSession.update({ where: { id: context.session.id }, data: { revokedAt: clock } }) })
    expect((await request(companyPath(), { method: 'PATCH', login: session, body: { name: '세션 경합', version: 1 } })).status).toBe(401)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).version).toBe(1)
    evidence.guardRaceRecheck = true
  })
  it('rolls back rename and period append when their audit fails', async () => {
    const session = await login(), audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementation((tx, event) => ['COMPANY_RENAMED', 'FISCAL_YEAR_CREATED'].includes(event.type) ? Promise.reject(new Error('injected audit failure')) : original(tx, event))
    expect((await request(companyPath(), { method: 'PATCH', login: session, body: { name: '롤백', version: 1 } })).status).toBe(500)
    expect((await request(companyPath('/fiscal-years'), { method: 'POST', login: session, body: { startDate: '2025-01-01', endDate: '2025-12-31', version: 1 } })).status).toBe(500)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } }))).toMatchObject({ name: 'Existing company A', version: 1 })
    expect(await db.fiscalYear.count({ where: { companyId: companyA.id } })).toBe(1)
    evidence.mutationRollback = true
  })
  it('appends immutable fiscal years, preserves old periods and rejects overlap without a version change', async () => {
    const session = await login(), before = await db.fiscalYear.findUniqueOrThrow({ where: { id: firstYearId } })
    const result = await request(companyPath('/fiscal-years'), { method: 'POST', login: session, body: { startDate: '2025-01-01', endDate: '2025-12-31', version: 1 } })
    expect(result.status).toBe(200); expect(result.data.company.version).toBe(2)
    expect(result.data.fiscalYear).toMatchObject({ startDate: '2025-01-01', endDate: '2025-12-31' })
    expect(await db.fiscalYear.findUniqueOrThrow({ where: { id: firstYearId } })).toEqual(before)
    expect((await request(companyPath('/fiscal-years'), { method: 'POST', login: session, body: { startDate: '2025-12-31', endDate: '2026-01-01', version: 2 } })).status).toBe(409)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).version).toBe(2)
    expect((await db.auditEvent.findFirstOrThrow({ where: { type: 'FISCAL_YEAR_CREATED' } })).details).toMatchObject({ versionBefore: 1, versionAfter: 2 })
    evidence.immutablePeriods = true
  })
  it('paginates periods by start date and rejects a cursor from another company', async () => {
    const session = await login()
    expect((await request(companyPath('/fiscal-years'), { method: 'POST', login: session, body: { startDate: '2023-01-01', endDate: '2023-12-31', version: 1 } })).status).toBe(200)
    const first = await request(companyPath('/fiscal-years?limit=1'), { login: session })
    expect(first.status).toBe(200); expect(first.data.items[0].startDate).toBe('2023-01-01')
    const next = await request(companyPath(`/fiscal-years?limit=1&cursor=${first.data.nextCursor}`), { login: session })
    expect(next.data.items[0].id).toBe(firstYearId); expect(next.data.nextCursor).toBeNull()
    const other = await db.fiscalYear.findFirstOrThrow({ where: { companyId: companyB.id } })
    expect((await request(companyPath(`/fiscal-years?cursor=${other.id}`), { login: session })).status).toBe(400)
    evidence.periodPagination = true
  })
  it('enforces Gregorian and 366-day input boundaries in HTTP and SQL', async () => {
    const session = await confirmed()
    for (const [startDate, endDate] of [['2023-02-29', '2023-12-31'], ['2024-01-01', '2025-01-01'], ['2026-02-01', '2026-01-01']]) {
      expect((await create(session, { ...creationInput(), startDate, endDate })).status).toBe(400)
      expect((await request(companyPath('/fiscal-years'), { method: 'POST', login: session, body: { startDate, endDate, version: 1 } })).status).toBe(400)
    }
    expect((await create(session, { ...creationInput(), startDate: '2024-02-29', endDate: '2024-02-29' })).status).toBe(200)
    await expect(db.fiscalYear.create({ data: { companyId: companyA.id, startDate: new Date('2027-01-01'), endDate: new Date('2028-01-02') } })).rejects.toThrow()
    const newCompany = await db.company.create({ data: { name: 'DB leap boundary' } })
    await db.fiscalYear.create({ data: { companyId: newCompany.id, startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') } })
    evidence.calendarBoundaries = true
  })
  it('preserves existing null creator records and enforces creation metadata and version SQL constraints', async () => {
    const existing = await db.company.findUniqueOrThrow({ where: { id: companyA.id } })
    expect(existing).toMatchObject({ version: 1, createdById: null, creationRequestId: null, creationInputHash: null })
    await expect(db.company.create({ data: { name: 'partial', createdById: userA.id } })).rejects.toThrow()
    await expect(db.company.create({ data: { name: 'bad hash', createdById: userA.id, creationRequestId: randomUUID(), creationInputHash: 'g'.repeat(64) } })).rejects.toThrow()
    await expect(db.company.create({ data: { name: 'zero version', version: 0 } })).rejects.toThrow()
    const data = { name: 'complete', createdById: userA.id, creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64) }
    await db.company.create({ data }); await expect(db.company.create({ data })).rejects.toThrow()
    evidence.databaseConstraints = true
  })
  it('keeps all GETs read-only, selection per request and declared activity capped at absolute expiry', async () => {
    const session = await login(), before = await db.userSession.findFirstOrThrow()
    clock = new Date(baseTime.getTime() + 20 * 60000)
    for (const path of ['/api/companies/options', '/api/companies', companyPath(), companyPath('/fiscal-years')]) {
      const result = await request(path, { login: session, headers: { 'x-user-activity': 'true' } })
      expect(result.status).toBe(200); expect(result.response.headers.get('cache-control')).toBe('no-store')
    }
    expect(await db.userSession.findFirstOrThrow()).toEqual(before)
    expect((await request(companyPath('/select'), { method: 'POST', login: session })).status).toBe(200)
    const after = await db.userSession.findFirstOrThrow()
    expect(after.lastActivityAt).toEqual(clock); expect(after.idleExpiresAt).toEqual(new Date(clock.getTime() + AUTH_POLICY.idleMs))
    expect(after.absoluteExpiresAt).toEqual(before.absoluteExpiresAt)
    expect(Object.keys(after)).not.toContain('companyId')
    await db.userSession.update({ where: { id: after.id }, data: { lastActivityAt: new Date(baseTime.getTime() + 7 * 3600000), idleExpiresAt: after.absoluteExpiresAt } })
    clock = new Date(baseTime.getTime() + 7.5 * 3600000)
    expect((await request(companyPath('/select'), { method: 'POST', login: session })).status).toBe(200)
    expect((await db.userSession.findFirstOrThrow()).idleExpiresAt).toEqual(after.absoluteExpiresAt)
    clock = new Date(after.absoluteExpiresAt)
    expect((await request('/api/companies', { login: session })).status).toBe(401)
    evidence.readOnlyAndActivity = true
  })
  it('checks exact reauthentication, Origin and CSRF boundaries before mutation', async () => {
    const session = await confirmed()
    for (const options of [{ origin: null }, { origin: 'https://evil.example.invalid' }, { csrf: 'a'.repeat(64) }]) {
      expect((await request('/api/companies', { method: 'POST', login: session, body: creationInput(), ...options })).status).toBe(403)
    }
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs)
    expect((await create(session)).status).toBe(403)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs - 1)
    expect((await create(session)).status).toBe(200)
    evidence.protectionBoundaries = true
  })
  it('rejects stale rotated contexts for extension and writes, and handles the version integer ceiling', async () => {
    const session = await confirmed(), sessions = app.get(SessionService), context = await sessions.resolve(session.raw)
    const result = await create(session); expect(result.status).toBe(200)
    await expect(sessions.extend(context)).rejects.toThrow()
    await expect(app.get(CompaniesService).rename(context, companyA.id, { name: 'stale', version: 1 }, randomUUID())).rejects.toThrow()
    await db.company.update({ where: { id: companyA.id }, data: { version: 2147483647 } })
    expect((await request(companyPath(), { method: 'PATCH', login: rotated(result), body: { name: 'overflow', version: 2147483647 } })).status).toBe(409)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).name).toBe('Existing company A')
    evidence.staleContextAndIntegerCeiling = true
  })
  it('rechecks account and five-minute confirmation inside the creation transaction after guards', async () => {
    const session = await confirmed(), sessions = app.get(SessionService), original = sessions.extend.bind(sessions)
    vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => {
      await original(context); await db.userSession.update({ where: { id: context.session.id }, data: { reauthenticatedAt: new Date(baseTime.getTime() - AUTH_POLICY.reauthMs) } })
    })
    expect((await create(session)).status).toBe(403)
    await db.userSession.updateMany({ data: { reauthenticatedAt: baseTime } })
    vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => {
      await original(context); await db.user.update({ where: { id: userA.id }, data: { disabledAt: baseTime } })
    })
    expect((await create(session)).status).toBe(401)
    expect(await db.company.count()).toBe(2)
    evidence.creationTransactionRecheck = true
  })
})
