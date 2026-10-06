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
const proof = resolve(server, '../.artifacts/implementation-f01-company-settings')
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

// [F01 통합 검증] 실제 AppModule/HTTP/guard/트랜잭션을 사용한다. 테스트 전용 난수 DB 외 업무 데이터를 쓰지 않는다.
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local database setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
  databaseName = `atms_verify_settings_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_settings_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification database')
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
      const after = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } }); expect(after).toEqual(metadata)
      evidence.originalMetadataPreserved = true
      evidence.originalMetadataHash = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      if (created && /^atms_verify_settings_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); evidence.onlyCreatedDatabaseRemoved = true
      }
    }
  } finally {
    if (admin) await admin.$disconnect()
    mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

const { canPerform } = require('../dist/auth/access-policy.js') as typeof import('../src/auth/access-policy')
const settingPath = (id = companyA.id) => `/api/companies/${id}/settings/self-approval`
const change = (session: Login, allowSelfApproval = true, version = 1, id = companyA.id) => request(settingPath(id), { method: 'PATCH', login: session, body: { allowSelfApproval, version } })
const settingAudits = () => db.auditEvent.findMany({ where: { type: 'COMPANY_SELF_APPROVAL_CHANGED' }, orderBy: { createdAt: 'asc' } })

// [F01 설정 행동 검증] guard/입력 pipe/실제 서비스와 PostgreSQL TX를 HTTP로 통과시킨다.
// 기본 DB에는 시험 계정을 쓰지 않는다. 위 준비/정리는 자신이 만든 난수 DB에만 적용한다.
describe('F01 company self approval integration', () => {
  it('changes both directions only in the selected company and returns the current flag from existing GET', async () => {
    const session = await confirmed()
    expect((await request(companyPath(), { login: session })).data).toMatchObject({ allowSelfApproval: false, version: 1 })
    const enabled = await change(session); expect(enabled.status).toBe(200)
    expect(enabled.data).toMatchObject({ id: companyA.id, allowSelfApproval: true, version: 2, accountingStandard: 'K_GAAP' })
    expect((await request(companyPath(), { login: session })).data.allowSelfApproval).toBe(true)
    expect((await change(session, false, 2)).status).toBe(200)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).version).toBe(3)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyB.id } })).allowSelfApproval).toBe(false)
    const events = await settingAudits(); expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ actorId: userA.id, companyId: companyA.id })
    expect(events[0].details).toEqual({ allowSelfApprovalBefore: false, allowSelfApprovalAfter: true, versionBefore: 1, versionAfter: 2 })
    expect(enabled.response.headers.get('cache-control')).toBe('no-store')
    expect(enabled.response.headers.get('set-cookie')).toBeNull()
    evidence.scopedBidirectionalChange = true
  })
  it('rejects all nonadmin roles, foreign companies and inactive memberships', async () => {
    const actor = await confirmed(), outsider = await confirmed(userB)
    expect((await change(actor, true, 1, companyB.id)).status).toBe(403)
    const member = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userB.id } })
    for (const role of ['ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as const) {
      await db.companyMemberRole.deleteMany({ where: { membershipId: member.id } })
      await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: member.id, role } })
      expect((await change(outsider)).status).toBe(403)
    }
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
    expect((await change(actor)).status).toBe(403)
    expect(await settingAudits()).toHaveLength(0)
    evidence.currentAdminScope = true
  })
  it('rejects missing authentication, unverified and globally disabled accounts without writes', async () => {
    expect((await change({ cookie: '', csrf: '', raw: '', data: {} })).status).toBe(401)
    const session = await confirmed()
    await db.user.update({ where: { id: userA.id }, data: { emailVerifiedAt: null } })
    expect((await change(session)).status).toBe(401)
    await db.user.update({ where: { id: userA.id }, data: { emailVerifiedAt: baseTime, disabledAt: baseTime } })
    expect((await change(session)).status).toBe(401)
    expect(await settingAudits()).toHaveLength(0)
    evidence.settingAuthentication = true
  })
  it('rejects malformed HTTP Boolean, version, UUID and extra fields', async () => {
    const session = await confirmed()
    for (const body of [{}, { allowSelfApproval: 'true', version: 1 }, { allowSelfApproval: true, version: '1' },
      { allowSelfApproval: true, version: 0 }, { allowSelfApproval: true, version: 2147483648 }, { allowSelfApproval: true, version: 1, roles: ['COMPANY_ADMIN'] }]) {
      expect((await request(settingPath(), { method: 'PATCH', login: session, body })).status).toBe(400)
    }
    expect((await change(session, true, 1, 'foreign')).status).toBe(400)
    expect((await change(session, true, 1, randomUUID())).status).toBe(403)
    expect(await settingAudits()).toHaveLength(0)
    evidence.strictSettingHttpInput = true
  })
  it('preserves no-op state and audit but rejects stale versions before comparing values', async () => {
    const session = await confirmed(), before = await db.company.findUniqueOrThrow({ where: { id: companyA.id } })
    expect((await change(session, false)).status).toBe(200)
    expect(await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).toEqual(before)
    expect(await settingAudits()).toHaveLength(0)
    expect((await change(session)).status).toBe(200)
    expect((await change(session, true, 1)).status).toBe(409)
    expect((await change(session, true, 2)).status).toBe(200)
    expect(await settingAudits()).toHaveLength(1)
    evidence.settingNoOpAndStaleVersion = true
  })
  it('allows a latest no-op at INTEGER ceiling while refusing actual changes', async () => {
    const session = await confirmed()
    await db.company.update({ where: { id: companyA.id }, data: { version: 2147483647 } })
    expect((await change(session, false, 2147483647)).status).toBe(200)
    expect((await change(session, true, 2147483647)).status).toBe(409)
    expect(await settingAudits()).toHaveLength(0)
    evidence.settingVersionCeiling = true
  })
  it('serializes same-version settings so only one succeeds and emits one audit', async () => {
    const session = await confirmed(), results = await Promise.all([change(session), change(session)])
    expect(results.map(row => row.status).sort()).toEqual([200, 409])
    expect(await settingAudits()).toHaveLength(1)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).version).toBe(2)
    evidence.concurrentSettingChange = true
  })
  it('shares the company version with concurrent rename and fiscal-year creation', async () => {
    const session = await confirmed()
    const results = await Promise.all([change(session), request(companyPath(), { method: 'PATCH', login: session, body: { name: 'Renamed', version: 1 } })])
    expect(results.map(row => row.status).sort()).toEqual([200, 409])
    expect((await request(companyPath('/fiscal-years'), { method: 'POST', login: session, body: { startDate: '2025-01-01', endDate: '2025-12-31', version: 2 } })).status).toBe(200)
    expect((await change(session, true, 2)).status).toBe(409)
    evidence.sharedCompanyVersion = true
  })
  // guard 확인 후 실제 lockUser 직전 상태를 바꾸어 TX의 재검사 여부를 검증한다.
  it.each(['role', 'membership', 'account', 'session', 'token', 'reauth'] as const)('rechecks %s after guard authorization', async kind => {
    const session = await confirmed(), service = app.get(CompaniesService) as any, original = service.lockUser.bind(service)
    vi.spyOn(service, 'lockUser').mockImplementationOnce(async (...args: any[]) => {
      if (kind === 'role') await db.companyMemberRole.updateMany({ where: { membershipId: membershipA.id }, data: { role: 'READ_ONLY' } })
      if (kind === 'membership') await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
      if (kind === 'account') await db.user.update({ where: { id: userA.id }, data: { disabledAt: clock } })
      if (kind === 'session') await db.userSession.updateMany({ where: { tokenHash: hashToken(session.raw) }, data: { revokedAt: clock } })
      if (kind === 'token') await db.userSession.updateMany({ where: { tokenHash: hashToken(session.raw) }, data: { tokenHash: hashToken('replaced-token') } })
      if (kind === 'reauth') clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs)
      return original(...args)
    })
    expect((await change(session)).status).toBe(['role', 'membership', 'reauth'].includes(kind) ? 403 : 401)
    expect(await settingAudits()).toHaveLength(0)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).allowSelfApproval).toBe(false)
    evidence[`lockedSettingRecheck_${kind}`] = true
  })
  it('requires reauthentication even for no-op and enforces the exact five-minute boundary', async () => {
    expect((await change(await login(), false)).status).toBe(403)
    const session = await confirmed()
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs - 1)
    expect((await change(session, false)).status).toBe(200)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs)
    expect((await change(session, false)).status).toBe(403)
    evidence.exactSettingReauthentication = true
  })
  it('rolls back setting and version when success audit persistence fails', async () => {
    const session = await confirmed(), before = await db.company.findUniqueOrThrow({ where: { id: companyA.id } }), audit = app.get(AuditService)
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('isolated audit failure'))
    const result = await change(session); expect(result.status).toBe(500); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect(await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).toEqual(before)
    expect(await settingAudits()).toHaveLength(0)
    evidence.settingAuditRollback = true
  })
  it('rolls back a genuine database constraint failure with no audit or cookie', async () => {
    const session = await confirmed(), service = app.get(CompaniesService) as any, original = service.increment.bind(service)
    vi.spyOn(service, 'increment').mockImplementationOnce(async (tx: any, company: any, data: any) => {
      await original(tx, company, data)
      await tx.company.update({ where: { id: company.id }, data: { version: 0 } })
    })
    const result = await change(session); expect(result.status).toBe(500); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } }))).toMatchObject({ version: 1, allowSelfApproval: false })
    expect(await settingAudits()).toHaveLength(0)
    evidence.settingDatabaseRollback = true
  })
  it('preserves all devices, tokens, roles, periods and other-company rows while extending only current activity', async () => {
    await login(); const session = await confirmed()
    const otherCompany = await db.company.findUniqueOrThrow({ where: { id: companyB.id } })
    const periods = await db.fiscalYear.findMany({ orderBy: { id: 'asc' } }), members = await db.companyMembership.findMany({ orderBy: { id: 'asc' } })
    const roles = await db.companyMemberRole.findMany({ orderBy: { membershipId: 'asc' } }), before = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    clock = new Date(baseTime.getTime() + 1000)
    expect((await change(session)).status).toBe(200)
    const after = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    expect(after.map(row => [row.id, row.tokenHash, row.csrfTokenHash, row.createdAt, row.absoluteExpiresAt, row.revokedAt])).toEqual(before.map(row => [row.id, row.tokenHash, row.csrfTokenHash, row.createdAt, row.absoluteExpiresAt, row.revokedAt]))
    expect(after.find(row => row.tokenHash === hashToken(session.raw))!.lastActivityAt).toEqual(clock)
    expect(after.find(row => row.tokenHash !== hashToken(session.raw))).toEqual(before.find(row => row.tokenHash !== hashToken(session.raw)))
    expect(await db.company.findUniqueOrThrow({ where: { id: companyB.id } })).toEqual(otherCompany)
    expect(await db.fiscalYear.findMany({ orderBy: { id: 'asc' } })).toEqual(periods)
    expect(await db.companyMembership.findMany({ orderBy: { id: 'asc' } })).toEqual(members)
    expect(await db.companyMemberRole.findMany({ orderBy: { membershipId: 'asc' } })).toEqual(roles)
    evidence.settingCompanyAndSessionPreservation = true
  })
  it('protects writes with Origin and CSRF and keeps existing GET read-only', async () => {
    const session = await confirmed(), before = await db.userSession.findMany()
    clock = new Date(baseTime.getTime() + 1000)
    expect((await request(companyPath(), { login: session })).status).toBe(200)
    expect(await db.userSession.findMany()).toEqual(before)
    expect((await request(settingPath(), { method: 'PATCH', login: session, origin: 'https://foreign.invalid', body: { allowSelfApproval: true, version: 1 } })).status).toBe(403)
    expect((await request(settingPath(), { method: 'PATCH', login: session, csrf: 'wrong', body: { allowSelfApproval: true, version: 1 } })).status).toBe(403)
    expect((await request(settingPath(), { method: 'PATCH', login: session, origin: null, body: { allowSelfApproval: true, version: 1 } })).status).toBe(403)
    expect(await settingAudits()).toHaveLength(0)
    evidence.settingHttpProtectionAndReadOnly = true
  })
  it('uses the current stored flag without granting roles or implementing an approval endpoint', async () => {
    const session = await confirmed()
    const allowed = async (roles: string[], companyId = companyA.id, stateAllowed = true) => canPerform(roles, 'journal.approve', {
      userId: userA.id, authorId: userA.id, stateAllowed, allowSelfApproval: (await db.company.findUniqueOrThrow({ where: { id: companyId } })).allowSelfApproval,
    })
    expect(await allowed(['COMPANY_ADMIN'])).toBe(false)
    expect((await change(session)).status).toBe(200)
    expect(await allowed(['APPROVER'])).toBe(true)
    expect(await allowed(['READ_ONLY'])).toBe(false)
    expect(await allowed(['ACCOUNTANT'])).toBe(false)
    expect(await allowed(['COMPANY_ADMIN'], companyB.id)).toBe(false)
    expect(await allowed(['APPROVER'], companyA.id, false)).toBe(false)
    expect((await change(session, false, 2)).status).toBe(200)
    expect(await allowed(['APPROVER'])).toBe(false)
    evidence.currentStoredSettingPolicyBoundary = true
  })
})
