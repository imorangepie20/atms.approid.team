import { createRequire } from 'node:module'
import { randomBytes, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { config as loadEnv } from 'dotenv'
import { Body, Controller, Get, HttpCode, Module, Param, Post, Req, type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { z } from 'zod'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthRequest } from '../src/auth/auth.types'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { SessionService, hashToken } = require('../dist/auth/session.service.js') as typeof import('../src/auth/session.service')
const { LoginRateLimitService } = require('../dist/auth/login-rate-limit.service.js') as typeof import('../src/auth/login-rate-limit.service')
const { AuditService } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
const { RequirePermission, UserActivity, RequireReauthentication } = require('../dist/auth/auth.decorators.js') as typeof import('../src/auth/auth.decorators')
const { AUTH_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const argon2 = require('argon2') as typeof import('argon2')
const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f01-auth-session')
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
const companyParam = z.string().uuid()

// [F01 통합 테스트 전용] 실제 공통 guard를 검사할 경로다. 운영 AppModule에는 이 컨트롤러를 넣지 않는다.
@Controller('probe')
class ProbeController {
  @Get('private') private(@Req() request: AuthRequest) { return { user: request.auth!.user.id } }
  @Get('company/:companyId') @RequirePermission('company.read')
  company(@Param('companyId', { schema: companyParam }) _id: string, @Req() request: AuthRequest) { return request.companyScope }
  @Post('company/:companyId') @HttpCode(200) @RequirePermission('journal.draft') @UserActivity()
  write(@Req() request: AuthRequest) { return { company: request.companyScope!.id } }
  @Get('company/:companyId/admin') @RequirePermission('company.manage')
  admin(@Req() request: AuthRequest) { return { company: request.companyScope!.id } }
  @Post('sensitive') @HttpCode(200) @RequireReauthentication()
  sensitive(@Body() _body: unknown) { return { success: true } }
}
@Module({ imports: [AppModule], controllers: [ProbeController] })
class TestModule {}

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
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local database setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
  databaseName = `atms_verify_auth_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_auth_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification database')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  url.pathname = `/${databaseName}`
  process.env.DATABASE_URL = url.toString()
  process.env.AUTH_WEB_ORIGIN = origin
  try { execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env: process.env, stdio: 'pipe', timeout: 30000 }) }
  catch { throw new Error('Isolated authentication migration failed') }
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }) })
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB, timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  userA = await db.user.create({ data: { email: 'auth-a@example.invalid', emailNormalized: 'auth-a@example.invalid', passwordHash: hash, emailVerifiedAt: baseTime } })
  userB = await db.user.create({ data: { email: 'auth-b@example.invalid', emailNormalized: 'auth-b@example.invalid', passwordHash: hash, emailVerifiedAt: baseTime } })
  companyA = await db.company.create({ data: { name: 'Isolated auth A' } })
  companyB = await db.company.create({ data: { name: 'Isolated auth B' } })
  membershipA = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userA.id } })
  const other = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userB.id } })
  await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: other.id, role: 'READ_ONLY' } })
  vi.spyOn(SessionService.prototype, 'now').mockImplementation(() => new Date(clock))
  app = await NestFactory.create(TestModule, { logger: false })
  configureApp(app, readAppConfig())
  await app.listen(0, '127.0.0.1')
  address = await app.getUrl()
  evidence.isolatedDatabase = databaseName
  evidence.argon2HashVerified = await argon2.verify(hash, password)
}, 120000)
beforeEach(async () => {
  clock = new Date(baseTime)
  await db.auditEvent.deleteMany()
  await db.loginRateBucket.deleteMany()
  await db.userSession.deleteMany()
  await db.user.updateMany({ data: { disabledAt: null, emailVerifiedAt: baseTime } })
  await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: true } })
  await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } })
  for (const role of ['ACCOUNTANT', 'APPROVER'] as const) await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role } })
})
afterAll(async () => {
  vi.restoreAllMocks()
  try {
    if (app) await app.close()
    if (db) await db.$disconnect()
    process.env.DATABASE_URL = originalUrl
    if (admin) {
      const after = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
      expect(after).toEqual(metadata)
      evidence.originalMetadataPreserved = true
      evidence.originalMetadataHash = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      if (created && /^atms_verify_auth_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
        evidence.onlyCreatedDatabaseRemoved = true
      }
    }
  } finally {
    if (admin) await admin.$disconnect()
    mkdirSync(proof, { recursive: true })
    writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

describe('F01 authentication integration', () => {
  it('accepts 128 Unicode code points in the existing login path without trimming', async () => {
    const original = await db.user.findUniqueOrThrow({ where: { id: userA.id } })
    const unicodePassword = '😀'.repeat(128)
    const passwordHash = await argon2.hash(unicodePassword, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB, timeCost: 2, parallelism: 1 })
    try {
      await db.user.update({ where: { id: userA.id }, data: { passwordHash } })
      expect((await request('/api/auth/login', { method: 'POST', body: { email: userA.email, password: unicodePassword } })).status).toBe(200)
      expect((await request('/api/auth/login', { method: 'POST', body: { email: userA.email, password: unicodePassword + '😀' } })).status).toBe(400)
    } finally { await db.user.update({ where: { id: userA.id }, data: { passwordHash: original.passwordHash } }) }
  })
  it('logs in with original password spaces, stores hashes, and restores without secret fields or renewal', async () => {
    const session = await login()
    expect(session.cookie).toMatch(/^atms_dev_session=[a-f0-9]{64}$/)
    const stored = await db.userSession.findFirstOrThrow()
    expect(stored.tokenHash).toBe(hashToken(session.raw))
    expect(stored.csrfTokenHash).toBe(hashToken(session.csrf))
    expect(session.data).toEqual({ user: { id: userA.id, email: userA.email }, csrfToken: session.csrf,
      idleExpiresAt: new Date(baseTime.getTime() + AUTH_POLICY.idleMs).toISOString(), absoluteExpiresAt: new Date(baseTime.getTime() + AUTH_POLICY.absoluteMs).toISOString() })
    clock = new Date(baseTime.getTime() + 20 * 60000)
    const restored = await request('/api/auth/session?activity=true', { login: session, headers: { 'x-user-activity': 'true' } })
    expect(restored.status).toBe(200)
    expect(restored.data).toEqual(session.data)
    expect(restored.response.headers.get('cache-control')).toBe('no-store')
    expect((await db.userSession.findFirstOrThrow()).lastActivityAt).toEqual(baseTime)
    evidence.cookieHashAndReadOnlyRestore = true
  })
  it('uses HttpOnly, Strict, root path, no Domain and a separate local HTTP cookie', async () => {
    const result = await request('/api/auth/login', { method: 'POST', body: { email: userA.email.toUpperCase(), password } })
    expect(result.status).toBe(200)
    const cookie = result.response.headers.get('set-cookie')!
    for (const flag of ['HttpOnly', 'SameSite=Strict', 'Path=/']) expect(cookie).toContain(flag)
    expect(cookie).not.toContain('Domain=')
    expect(cookie).not.toContain('Secure')
  })
  it.each(['unknown', 'password', 'disabled', 'unverified'])('does not disclose %s login failure or credentials', async kind => {
    if (kind === 'disabled') await db.user.update({ where: { id: userA.id }, data: { disabledAt: baseTime } })
    if (kind === 'unverified') await db.user.update({ where: { id: userA.id }, data: { emailVerifiedAt: null } })
    const result = await request('/api/auth/login', { method: 'POST', body: { email: kind === 'unknown' ? 'none@example.invalid' : userA.email,
      password: kind === 'password' ? 'wrong fictional password' : password } })
    expect(result.status).toBe(401)
    expect(result.data).toEqual({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', details: [] })
    expect(result.response.headers.get('set-cookie')).toBeNull()
    const logs = JSON.stringify(await db.auditEvent.findMany())
    expect(logs).not.toContain(password)
    expect(logs).not.toContain(userA.email)
  })
  it('requires Origin before login, strict input validation, and valid CSRF for writes', async () => {
    for (const invalid of [null, 'https://attacker.example']) expect((await request('/api/auth/login', { method: 'POST', origin: invalid,
      body: { email: userA.email, password } })).status).toBe(403)
    expect((await request('/api/auth/login', { method: 'POST', body: { email: userA.email, password, role: 'COMPANY_ADMIN' } })).status).toBe(400)
    const session = await login()
    for (const csrf of ['bad', 'f'.repeat(64)]) expect((await request('/api/auth/logout', { method: 'POST', login: session, csrf })).status).toBe(403)
    expect((await request('/api/auth/logout', { method: 'POST', login: session, origin: 'https://attacker.example' })).status).toBe(403)
    expect((await request('/api/auth/session', { login: session })).status).toBe(200)
    evidence.originCsrfAndDefaultProtection = true
  })
  it('protects undeclared routes and keeps public live/ready health contracts', async () => {
    expect((await request('/api/probe/private')).status).toBe(401)
    for (const path of ['/api/health/live', '/api/health/ready']) expect((await request(path)).status).toBe(200)
    const session = await login()
    expect((await request('/api/probe/private', { login: session })).status).toBe(200)
  })
  it('expires at exactly 60 idle minutes and never resurrects an expired session', async () => {
    const session = await login()
    clock = new Date(baseTime.getTime() + AUTH_POLICY.idleMs - 1)
    expect((await request('/api/auth/session', { login: session })).status).toBe(200)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.idleMs)
    expect((await request(`/api/probe/company/${companyA.id}`, { login: session, method: 'POST' })).status).toBe(401)
    expect((await db.userSession.findFirstOrThrow()).lastActivityAt).toEqual(baseTime)
  })
  it('extends only authorized declared user activity and caps at 8 hours without resetting creation', async () => {
    const session = await login()
    clock = new Date(baseTime.getTime() + 20 * 60000)
    expect((await request(`/api/probe/company/${companyB.id}`, { method: 'POST', login: session })).status).toBe(403)
    expect((await db.userSession.findFirstOrThrow()).lastActivityAt).toEqual(baseTime)
    for (let minutes = 50; minutes <= 450; minutes += 50) {
      clock = new Date(baseTime.getTime() + minutes * 60000)
      expect((await request(`/api/probe/company/${companyA.id}`, { method: 'POST', login: session })).status).toBe(200)
      const row = await db.userSession.findFirstOrThrow()
      expect(row.createdAt).toEqual(baseTime)
      expect(row.idleExpiresAt.getTime()).toBe(Math.min(clock.getTime() + AUTH_POLICY.idleMs, baseTime.getTime() + AUTH_POLICY.absoluteMs))
    }
    clock = new Date(baseTime.getTime() + AUTH_POLICY.absoluteMs)
    expect((await request('/api/auth/session', { login: session })).status).toBe(401)
    evidence.idleAbsoluteAndActivityBoundaries = true
  })
  it('maintains independent devices, revokes one then all devices without revoking another user', async () => {
    const first = await login(), second = await login(), other = await login(userB)
    expect(first.raw).not.toBe(second.raw)
    clock = new Date(baseTime.getTime() + 20 * 60000)
    expect((await request(`/api/probe/company/${companyA.id}`, { login: first, method: 'POST' })).status).toBe(200)
    const secondRow = await db.userSession.findUniqueOrThrow({ where: { tokenHash: hashToken(second.raw) } })
    expect(secondRow.lastActivityAt).toEqual(baseTime)
    expect((await request('/api/auth/logout', { method: 'POST', login: first })).status).toBe(200)
    expect((await request('/api/auth/session', { login: first })).status).toBe(401)
    expect((await request('/api/auth/session', { login: second })).status).toBe(200)
    const all = await request('/api/auth/logout-all', { method: 'POST', login: second })
    expect(all.status).toBe(200)
    expect(all.response.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970')
    expect((await request('/api/auth/session', { login: second })).status).toBe(401)
    expect((await request('/api/auth/session', { login: other })).status).toBe(200)
    evidence.deviceIsolationAndLogout = true
  })
  it('rechecks account, membership and role revocation on every company request', async () => {
    const session = await login()
    expect((await request(`/api/probe/company/${companyA.id}`, { login: session })).status).toBe(200)
    expect((await request(`/api/probe/company/${companyB.id}`, { login: session })).status).toBe(403)
    expect((await request('/api/probe/company/invalid', { login: session })).status).toBe(400)
    await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } })
    expect((await request(`/api/probe/company/${companyA.id}`, { method: 'POST', login: session })).status).toBe(403)
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
    expect((await request(`/api/probe/company/${companyA.id}`, { login: session })).status).toBe(403)
    await db.user.update({ where: { id: userA.id }, data: { disabledAt: clock } })
    expect((await request('/api/auth/session', { login: session })).status).toBe(401)
    evidence.currentCompanyAndRevocation = true
  })
  it('uses administrator included permission without requiring accountant and approver role records', async () => {
    await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } })
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'COMPANY_ADMIN' } })
    const session = await login()
    expect((await request(`/api/probe/company/${companyA.id}/admin`, { login: session })).status).toBe(200)
    expect((await request(`/api/probe/company/${companyA.id}`, { login: session, method: 'POST' })).status).toBe(200)
  })
  it('requires correct reauthentication and rejects it at the exact 5 minute boundary', async () => {
    const session = await login()
    expect((await request('/api/probe/sensitive', { login: session, method: 'POST' })).status).toBe(403)
    expect((await request('/api/auth/reauthenticate', { login: session, method: 'POST', body: { password: 'wrong' } })).status).toBe(401)
    expect((await request('/api/auth/reauthenticate', { login: session, method: 'POST', body: { password } })).status).toBe(200)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs - 1)
    expect((await request('/api/probe/sensitive', { login: session, method: 'POST' })).status).toBe(200)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs)
    expect((await request('/api/probe/sensitive', { login: session, method: 'POST' })).status).toBe(403)
    evidence.reauthenticationBoundary = true
  })
  it('persists five failed attempts, blocks further verification, and permits retry after 15 minutes', async () => {
    for (let i = 0; i < 5; i++) expect((await request('/api/auth/login', { method: 'POST', body: { email: userA.email, password: 'wrong' } })).status).toBe(401)
    expect((await request('/api/auth/login', { method: 'POST', body: { email: userA.email, password } })).status).toBe(429)
    // 새 서비스 인스턴스도 기존 DB 제한을 사용한다. 메모리 캐시를 초기화하는 것으로 우회되지 않는다.
    const persisted = new LoginRateLimitService(db as never)
    await expect(persisted.account(userA.email, clock, async () => ({ success: true, value: 'bypass' }))).rejects.toMatchObject({ status: 429 })
    clock = new Date(baseTime.getTime() + AUTH_POLICY.accountWaitMs)
    expect((await request('/api/auth/login', { method: 'POST', body: { email: userA.email, password } })).status).toBe(200)
    evidence.persistedAccountLimit = true
  })
  it('counts invalid login input toward the IP request limit and applies a sliding boundary', async () => {
    for (let i = 0; i < 30; i++) expect((await request('/api/auth/login', { method: 'POST' })).status).toBe(400)
    expect((await request('/api/auth/login', { method: 'POST' })).status).toBe(429)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.loginWindowMs)
    expect((await request('/api/auth/login', { method: 'POST' })).status).toBe(400)
  })
  it('serializes concurrent account failures and IP reservations using actual database locks', async () => {
    const rate = app.get(LoginRateLimitService)
    const results = await Promise.all(Array.from({ length: 8 }, () => rate.account('concurrent@example.invalid', clock, async () => ({ success: false, value: false })).then(() => 401, () => 429)))
    expect(results.filter(code => code === 401)).toHaveLength(5)
    expect(results.filter(code => code === 429)).toHaveLength(3)
    const requests = await Promise.all(Array.from({ length: 35 }, () => rate.reserveIp('test-concurrent-ip', clock).then(() => true, () => false)))
    expect(requests.filter(Boolean)).toHaveLength(30)
    evidence.concurrentLimits = true
  })
  it('rolls back a created session when its success audit fails', async () => {
    const spy = vi.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(new Error('private database audit failure'))
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: { email: userA.email, password } })
      expect(result.status).toBe(500)
      expect(JSON.stringify(result.data)).not.toContain('private database')
      expect(await db.userSession.count()).toBe(0)
      expect(await db.auditEvent.count()).toBe(0)
    } finally { spy.mockRestore() }
    evidence.auditAndSessionAtomicity = true
  })
  it('records fixed event types, company-scoped denial and no password, cookie or CSRF secrets', async () => {
    const session = await login()
    await request(`/api/probe/company/${companyB.id}`, { login: session })
    await request('/api/auth/reauthenticate', { method: 'POST', login: session, body: { password } })
    await request('/api/auth/logout', { method: 'POST', login: session })
    const events = await db.auditEvent.findMany()
    expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['LOGIN_SUCCEEDED', 'ACCESS_DENIED', 'REAUTH_SUCCEEDED', 'LOGOUT']))
    expect(events.find(e => e.type === 'ACCESS_DENIED')?.companyId).toBe(companyB.id)
    for (const secret of [password, session.raw, session.csrf]) expect(JSON.stringify(events)).not.toContain(secret)
    evidence.safeAuditEvents = true
  })
})
