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
const { CompanyMembersService } = require('../dist/companies/company-members.service.js') as typeof import('../src/companies/company-members.service')
const { AUTH_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const argon2 = require('argon2') as typeof import('argon2')
const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f01-company-members')
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
function rotated(result: Awaited<ReturnType<typeof request>>): Login {
  const cookie = result.response.headers.get('set-cookie')!.split(';')[0]
  return { cookie, raw: cookie.split('=')[1], csrf: result.data.session.csrfToken, data: result.data.session }
}
const memberPath = (membershipId?: string, suffix = '') => companyPath('/members' + (membershipId ? '/' + membershipId : '') + suffix)
let memberB: { id: string }, otherMember: { id: string }, userC: { id: string; email: string }
async function roles(session: Login, member = memberB, values = ['APPROVER'], version = 1) { return request(memberPath(member.id, '/roles'), { method: 'PATCH', login: session, body: { roles: values, version } }) }
async function deactivate(session: Login, member = memberB, version = 1) { return request(memberPath(member.id, '/deactivate'), { method: 'POST', login: session, body: { version } }) }
async function adminB() { await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: memberB.id, role: 'COMPANY_ADMIN' } }) }

// [F01 통합 검증] 실제 AppModule/HTTP/guard/트랜잭션을 사용한다. 테스트 전용 난수 DB 외 업무 데이터를 쓰지 않는다.
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local database setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
  databaseName = `atms_verify_members_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_members_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification database')
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
  userC = await db.user.create({ data: { email: 'member-outsider@example.invalid', emailNormalized: 'member-outsider@example.invalid', passwordHash: hash, emailVerifiedAt: baseTime } })
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
  memberB = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userB.id } })
  await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: memberB.id, role: 'READ_ONLY' } })
  otherMember = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userB.id } })
  await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: otherMember.id, role: 'READ_ONLY' } })
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
      if (created && /^atms_verify_members_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); evidence.onlyCreatedDatabaseRemoved = true
      }
    }
  } finally {
    if (admin) await admin.$disconnect()
    mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

describe('F01 company member integration', () => {
  it('lists and reads only own-company members with minimal user fields and inactive status', async () => {
    const session = await login()
    await db.companyMembership.update({ where: { id: memberB.id }, data: { active: false } })
    const result = await request(memberPath(), { login: session })
    expect(result.status).toBe(200); expect(result.data.items).toHaveLength(2)
    const target = result.data.items.find((row: any) => row.id === memberB.id)
    expect(target).toMatchObject({ active: false, version: 1, roles: ['READ_ONLY'], user: { id: userB.id, email: userB.email, emailVerified: true, disabled: false } })
    expect(Object.keys(target.user).sort()).toEqual(['disabled', 'email', 'emailVerified', 'id'])
    expect(JSON.stringify(result.data)).not.toMatch(/passwordHash|tokenHash|csrfTokenHash|creationInputHash/)
    const detail = await request(memberPath(memberB.id), { login: session }); expect(detail.data).toEqual(target)
    expect(result.response.headers.get('cache-control')).toBe('no-store')
    evidence.scopedRead = true
  })
  it('requires current active verified admins and rejects outsider, readonly and withdrawn access', async () => {
    expect((await request(memberPath())).status).toBe(401)
    expect((await request(memberPath(), { login: await login(userB) })).status).toBe(403)
    expect((await request(memberPath(), { login: await login(userC) })).status).toBe(403)
    const session = await login()
    await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } })
    expect((await request(memberPath(), { login: session })).status).toBe(403)
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'COMPANY_ADMIN' } })
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
    expect((await request(memberPath(), { login: session })).status).toBe(403)
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: true } })
    await db.user.update({ where: { id: userA.id }, data: { emailVerifiedAt: null } })
    expect((await request(memberPath(), { login: session })).status).toBe(401)
    await db.user.update({ where: { id: userA.id }, data: { emailVerifiedAt: baseTime, disabledAt: baseTime } })
    expect((await request(memberPath(), { login: session })).status).toBe(401)
    evidence.currentAdminRead = true
  })
  it('rejects foreign membership IDs for read and write without changing that user or company', async () => {
    const session = await confirmed(), targetSession = await login(userB)
    expect((await request(memberPath(otherMember.id), { login: session })).status).toBe(404)
    expect((await request(memberPath(randomUUID()), { login: session })).status).toBe(404)
    expect((await roles(session, otherMember)).status).toBe(404)
    expect((await deactivate(session, otherMember)).status).toBe(404)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: otherMember.id } }))).toMatchObject({ active: true, version: 1 })
    expect((await request('/api/auth/session', { login: targetSession })).status).toBe(200)
    evidence.foreignMemberIsolation = true
  })
  it('paginates membership UUIDs and rejects foreign and missing cursors', async () => {
    const session = await login(), first = await request(memberPath() + '?limit=1', { login: session })
    expect(first.status).toBe(200); expect(first.data.nextCursor).not.toBeNull()
    const second = await request(memberPath() + `?limit=1&cursor=${first.data.nextCursor}`, { login: session })
    const ids = [first.data.items[0].id, second.data.items[0].id]
    expect(ids).toEqual([...ids].sort()); expect(new Set(ids).size).toBe(2); expect(second.data.nextCursor).toBeNull()
    for (const cursor of [otherMember.id, randomUUID()]) expect((await request(memberPath() + `?cursor=${cursor}`, { login: session })).status).toBe(400)
    evidence.memberPagination = true
  })
  it('rejects forged role sets, identities, status and query fields at the HTTP boundary', async () => {
    const session = await confirmed()
    for (const body of [{ roles: [], version: 1 }, { roles: ['READ_ONLY', 'READ_ONLY'], version: 1 }, { roles: ['UNKNOWN'], version: 1 },
      { roles: ['COMPANY_ADMIN'], version: 1, userId: userC.id }, { roles: ['READ_ONLY'], version: '1' }]) {
      expect((await request(memberPath(memberB.id, '/roles'), { method: 'PATCH', login: session, body })).status).toBe(400)
    }
    expect((await request(memberPath(memberB.id, '/deactivate'), { method: 'POST', login: session, body: { version: 1, active: true } })).status).toBe(400)
    expect((await request(memberPath() + '?limit=1&limit=2', { login: session })).status).toBe(400)
    expect((await request(memberPath() + '?role=COMPANY_ADMIN', { login: session })).status).toBe(400)
    expect((await request(memberPath('bad-id'), { login: session })).status).toBe(400)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: memberB.id } })).version).toBe(1)
    evidence.strictMemberInput = true
  })
  it('replaces full roles, preserves other-company roles and company version, and records explicit changes', async () => {
    const session = await confirmed()
    const result = await roles(session, memberB, ['READ_ONLY', 'ACCOUNTANT', 'APPROVER'])
    expect(result.status).toBe(200); expect(result.data.member.roles).toEqual(['ACCOUNTANT', 'APPROVER', 'READ_ONLY'])
    expect(result.data.member.version).toBe(2); expect(result.data.session).toBeNull()
    const userSession = await login(userB)
    const selected = await request(companyPath('/select'), { method: 'POST', login: userSession })
    expect(selected.data.permissions).toContain('journal.draft'); expect(selected.data.permissions).toContain('journal.approve')
    expect(selected.data.permissions).not.toContain('company.members.manage')
    expect((await db.companyMemberRole.findMany({ where: { membershipId: otherMember.id } })).map(row => row.role)).toEqual(['READ_ONLY'])
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).version).toBe(1)
    const event = await db.auditEvent.findFirstOrThrow({ where: { type: 'MEMBER_ROLES_CHANGED' } })
    expect(event).toMatchObject({ actorId: userA.id, companyId: companyA.id })
    expect(event.details).toMatchObject({ membershipId: memberB.id, targetUserId: userB.id, rolesBefore: ['READ_ONLY'],
      rolesAfter: ['ACCOUNTANT', 'APPROVER', 'READ_ONLY'], activeBefore: true, activeAfter: true, versionBefore: 1, versionAfter: 2 })
    evidence.roleSetAndAudit = true
  })
  it('treats identical role sets as no-op without rotating or revoking sessions and rejects stale no-op versions', async () => {
    const session = await confirmed(), targetSession = await login(userB)
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: memberB.id, role: 'APPROVER' } })
    const before = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    const result = await roles(session, memberB, ['READ_ONLY', 'APPROVER'])
    expect(result.status).toBe(200); expect(result.data.member.version).toBe(1); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect(await db.auditEvent.count({ where: { type: 'MEMBER_ROLES_CHANGED' } })).toBe(0)
    expect(await db.userSession.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
    expect((await roles(session, memberB, ['APPROVER', 'READ_ONLY'], 2)).status).toBe(409)
    expect((await request('/api/auth/session', { login: targetSession })).status).toBe(200)
    evidence.roleNoOp = true
  })
  it('rejects role editing of inactive, globally disabled or unverified targets without reactivation', async () => {
    const session = await confirmed()
    await db.companyMembership.update({ where: { id: memberB.id }, data: { active: false } })
    expect((await roles(session)).status).toBe(409)
    await db.companyMembership.update({ where: { id: memberB.id }, data: { active: true } })
    await db.user.update({ where: { id: userB.id }, data: { disabledAt: baseTime } }); expect((await roles(session)).status).toBe(409)
    await db.user.update({ where: { id: userB.id }, data: { disabledAt: null, emailVerifiedAt: null } }); expect((await roles(session)).status).toBe(409)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: memberB.id } })).version).toBe(1)
    expect(await db.auditEvent.count({ where: { type: 'MEMBER_ROLES_CHANGED' } })).toBe(0)
    evidence.targetEligibility = true
  })
  it('protects the last eligible admin from demotion and deactivation', async () => {
    const session = await confirmed()
    expect((await roles(session, membershipA, ['READ_ONLY'])).status).toBe(409)
    expect((await deactivate(session, membershipA)).status).toBe(409)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: membershipA.id } }))).toMatchObject({ active: true, version: 1 })
    expect((await db.companyMemberRole.findMany({ where: { membershipId: membershipA.id } })).map(row => row.role)).toEqual(['COMPANY_ADMIN'])
    expect((await request('/api/auth/session', { login: session })).status).toBe(200)
    evidence.lastAdminProtection = true
  })
  it('does not count inactive, disabled or unverified administrator candidates as replacements', async () => {
    await adminB(); const session = await confirmed()
    await db.companyMembership.update({ where: { id: memberB.id }, data: { active: false } }); expect((await deactivate(session, membershipA)).status).toBe(409)
    await db.companyMembership.update({ where: { id: memberB.id }, data: { active: true } })
    await db.user.update({ where: { id: userB.id }, data: { disabledAt: baseTime } }); expect((await roles(session, membershipA, ['READ_ONLY'])).status).toBe(409)
    await db.user.update({ where: { id: userB.id }, data: { disabledAt: null, emailVerifiedAt: null } }); expect((await deactivate(session, membershipA)).status).toBe(409)
    evidence.eligibleAdminCount = true
  })
  it('serializes simultaneous mutual demotions so at least one eligible admin survives', async () => {
    await adminB(); const a = await confirmed(), b = await confirmed(userB)
    const results = await Promise.all([roles(a, memberB, ['READ_ONLY']), roles(b, membershipA, ['READ_ONLY'])])
    expect(results.filter(result => result.status === 200)).toHaveLength(1)
    expect(results.every(result => [200, 401, 403, 409].includes(result.status))).toBe(true)
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, active: true, roles: { some: { role: 'COMPANY_ADMIN' } } } })).toBe(1)
    expect(await db.auditEvent.count({ where: { type: 'MEMBER_ROLES_CHANGED' } })).toBe(1)
    evidence.mutualDemotion = true
  })
  it('serializes simultaneous mutual deactivations without leaving zero active admins', async () => {
    await adminB(); const a = await confirmed(), b = await confirmed(userB)
    const results = await Promise.all([deactivate(a, memberB), deactivate(b, membershipA)])
    expect(results.filter(result => result.status === 200)).toHaveLength(1)
    expect(results.every(result => [200, 401, 403, 409].includes(result.status))).toBe(true)
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, active: true, roles: { some: { role: 'COMPANY_ADMIN' } } } })).toBe(1)
    evidence.mutualDeactivation = true
  })
  it('rejects stale concurrent target writes and version overflow without partial changes', async () => {
    const session = await confirmed(), results = await Promise.all([roles(session, memberB, ['ACCOUNTANT']), roles(session, memberB, ['APPROVER'])])
    expect(results.map(result => result.status).sort()).toEqual([200, 409])
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: memberB.id } })).version).toBe(2)
    expect(await db.auditEvent.count({ where: { type: 'MEMBER_ROLES_CHANGED' } })).toBe(1)
    await db.companyMembership.update({ where: { id: memberB.id }, data: { version: 2147483647 } })
    expect((await deactivate(session, memberB, 2147483647)).status).toBe(409)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: memberB.id } })).active).toBe(true)
    evidence.memberVersionConflict = true
  })
  it('rechecks actor role, session, account and confirmation after guard authorization', async () => {
    const session = await confirmed(), sessions = app.get(SessionService), original = sessions.extend.bind(sessions)
    const attempt = async (mutation: (id: string) => Promise<unknown>, expected: number) => {
      vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => { await original(context); await mutation(context.session.id) })
      expect((await roles(session)).status).toBe(expected)
    }
    await attempt(() => db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } }), 403)
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'COMPANY_ADMIN' } })
    await attempt(id => db.userSession.update({ where: { id }, data: { reauthenticatedAt: new Date(baseTime.getTime() - AUTH_POLICY.reauthMs) } }), 403)
    await db.userSession.updateMany({ data: { reauthenticatedAt: baseTime } })
    await attempt(() => db.user.update({ where: { id: userA.id }, data: { disabledAt: baseTime } }), 401)
    await db.user.update({ where: { id: userA.id }, data: { disabledAt: null } })
    await attempt(id => db.userSession.update({ where: { id }, data: { revokedAt: baseTime } }), 401)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: memberB.id } })).version).toBe(1)
    evidence.actorTransactionRecheck = true
  })
  it('detects newly appearing admin candidates without taking User locks out of order', async () => {
    const session = await confirmed(), service = app.get(CompanyMembersService) as any, original = service.candidates.bind(service)
    vi.spyOn(service, 'candidates').mockImplementationOnce(async (...args: unknown[]) => {
      const snapshot = await original(...args)
      const member = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userC.id } })
      await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: member.id, role: 'COMPANY_ADMIN' } })
      return snapshot
    })
    expect((await roles(session)).status).toBe(409)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: memberB.id } })).version).toBe(1)
    evidence.candidateSnapshotConflict = true
  })
  it('revokes all devices of another target while preserving actor, unrelated users and other-company memberships', async () => {
    const targetOne = await login(userB), targetTwo = await login(userB), unrelated = await login(userC), actor = await confirmed()
    expect((await roles(actor)).status).toBe(200)
    for (const target of [targetOne, targetTwo]) expect((await request('/api/auth/session', { login: target })).status).toBe(401)
    for (const preserved of [actor, unrelated]) expect((await request('/api/auth/session', { login: preserved })).status).toBe(200)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: otherMember.id } })).active).toBe(true)
    expect((await db.auditEvent.findFirstOrThrow({ where: { type: 'MEMBER_ROLES_CHANGED' } })).details).toMatchObject({ revokedSessions: 2 })
    evidence.targetDeviceRevocation = true
  })
  it('rotates self role-change token and CSRF while preserving UUID, creation and absolute expiry', async () => {
    const other = await login(), session = await confirmed(), before = await db.userSession.findUniqueOrThrow({ where: { tokenHash: hashToken(session.raw) } })
    clock = new Date(baseTime.getTime() + 4 * 60000)
    const result = await roles(session, membershipA, ['COMPANY_ADMIN', 'READ_ONLY']), current = rotated(result)
    expect(result.status).toBe(200); expect(current.raw).not.toBe(session.raw); expect(current.csrf).not.toBe(session.csrf)
    const after = await db.userSession.findUniqueOrThrow({ where: { id: before.id } })
    expect(after.createdAt).toEqual(before.createdAt); expect(after.absoluteExpiresAt).toEqual(before.absoluteExpiresAt)
    expect(after.tokenHash).toBe(hashToken(current.raw)); expect(after.csrfTokenHash).toBe(hashToken(current.csrf))
    for (const expired of [session, other]) expect((await request('/api/auth/session', { login: expired })).status).toBe(401)
    expect((await request('/api/auth/session', { login: current })).status).toBe(200)
    expect((await request(companyPath('/select'), { method: 'POST', login: current, csrf: session.csrf })).status).toBe(403)
    expect(JSON.stringify(result.data)).not.toContain(current.raw)
    evidence.selfRotation = true
  })
  it('permits self demotion only with another eligible admin and reflects the new current permissions', async () => {
    await adminB(); const session = await confirmed(), result = await roles(session, membershipA, ['READ_ONLY'])
    expect(result.status).toBe(200); const current = rotated(result)
    expect((await request(memberPath(), { login: current })).status).toBe(403)
    expect((await request(companyPath(), { login: current })).status).toBe(200)
    expect((await request('/api/auth/session', { login: session })).status).toBe(401)
    evidence.selfDemotion = true
  })
  it('deactivates only the selected company membership and preserves its role rows and the global account', async () => {
    const target = await login(userB), actor = await confirmed(), originalUser = await db.user.findUniqueOrThrow({ where: { id: userB.id } })
    const result = await deactivate(actor)
    expect(result.status).toBe(200); expect(result.data.member).toMatchObject({ active: false, version: 2, roles: ['READ_ONLY'] }); expect(result.data.sessionRevoked).toBe(false)
    expect(await db.user.findUniqueOrThrow({ where: { id: userB.id } })).toEqual(originalUser)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: otherMember.id } }))).toMatchObject({ active: true, version: 1 })
    expect(await db.companyMemberRole.count({ where: { membershipId: memberB.id } })).toBe(1)
    expect((await request('/api/auth/session', { login: target })).status).toBe(401)
    const relogin = await login(userB)
    expect((await request(companyPath(), { login: relogin })).status).toBe(403)
    expect((await request(`/api/companies/${companyB.id}`, { login: relogin })).status).toBe(200)
    evidence.companyOnlyDeactivation = true
  })
  it('clears current cookie for permitted self deactivation and rejects the old session', async () => {
    await adminB(); const session = await confirmed(), result = await deactivate(session, membershipA)
    expect(result.status).toBe(200); expect(result.data.sessionRevoked).toBe(true)
    expect(result.response.headers.get('set-cookie')).toMatch(/^atms_dev_session=;/)
    expect(result.response.headers.get('set-cookie')).toContain('HttpOnly')
    expect((await request('/api/auth/session', { login: session })).status).toBe(401)
    const restored = await login(); expect((await request(companyPath(), { login: restored })).status).toBe(403)
    evidence.selfDeactivationCookie = true
  })
  it('treats repeated deactivation as no-op at the latest version without another logout or audit', async () => {
    const actor = await confirmed(); expect((await deactivate(actor)).status).toBe(200)
    const newSession = await login(userB)
    const result = await deactivate(actor, memberB, 2)
    expect(result.status).toBe(200); expect(result.data.member.version).toBe(2)
    expect(await db.auditEvent.count({ where: { type: 'MEMBERSHIP_DEACTIVATED' } })).toBe(1)
    expect((await request('/api/auth/session', { login: newSession })).status).toBe(200)
    expect((await deactivate(actor, memberB, 1)).status).toBe(409)
    expect((await roles(actor, memberB, ['COMPANY_ADMIN'], 2)).status).toBe(409)
    evidence.deactivationNoOpAndNoRevival = true
  })
  it('rolls back role and deactivate writes, versions and revoked devices when audit persistence fails', async () => {
    const target = await login(userB), actor = await confirmed(), audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementation((tx, event) => ['MEMBER_ROLES_CHANGED', 'MEMBERSHIP_DEACTIVATED'].includes(event.type)
      ? Promise.reject(new Error('injected audit failure')) : original(tx, event))
    expect((await roles(actor)).status).toBe(500); expect((await deactivate(actor)).status).toBe(500)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: memberB.id } }))).toMatchObject({ active: true, version: 1 })
    expect((await db.companyMemberRole.findMany({ where: { membershipId: memberB.id } })).map(row => row.role)).toEqual(['READ_ONLY'])
    expect((await request('/api/auth/session', { login: target })).status).toBe(200)
    expect(await db.auditEvent.count({ where: { type: { in: ['MEMBER_ROLES_CHANGED', 'MEMBERSHIP_DEACTIVATED'] } } })).toBe(0)
    evidence.memberAuditRollback = true
  })
  it('does not emit rotated or cleared cookies before failed self-change commits', async () => {
    await adminB(); const actor = await confirmed(), audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementation((tx, event) => ['MEMBER_ROLES_CHANGED', 'MEMBERSHIP_DEACTIVATED'].includes(event.type)
      ? Promise.reject(new Error('injected audit failure')) : original(tx, event))
    for (const result of [await roles(actor, membershipA, ['COMPANY_ADMIN', 'READ_ONLY']), await deactivate(actor, membershipA)]) {
      expect(result.status).toBe(500); expect(result.response.headers.get('set-cookie')).toBeNull()
    }
    expect((await request('/api/auth/session', { login: actor })).status).toBe(200)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: membershipA.id } }))).toMatchObject({ active: true, version: 1 })
    evidence.selfCookieCommitBoundary = true
  })
  it('rolls back membership and roles when session revocation fails', async () => {
    const actor = await confirmed(); vi.spyOn(app.get(SessionService), 'revokeForUser').mockRejectedValueOnce(new Error('injected session failure'))
    expect((await roles(actor)).status).toBe(500)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: memberB.id } })).version).toBe(1)
    expect((await db.companyMemberRole.findMany({ where: { membershipId: memberB.id } })).map(row => row.role)).toEqual(['READ_ONLY'])
    evidence.memberSessionRollback = true
  })
  it('serializes target relogin behind role commit while invalidating the prior device', async () => {
    const target = await login(userB), actor = await confirmed(), sessions = app.get(SessionService), original = sessions.revokeForUser.bind(sessions)
    let pending: Promise<Login> | undefined
    vi.spyOn(sessions, 'revokeForUser').mockImplementationOnce(async (tx, id) => {
      pending = login(userB); await new Promise(resolve => setTimeout(resolve, 25)); return original(tx, id)
    })
    expect((await roles(actor)).status).toBe(200)
    const fresh = await pending!
    expect((await request('/api/auth/session', { login: target })).status).toBe(401)
    expect((await request('/api/auth/session', { login: fresh })).status).toBe(200)
    expect((await db.userSession.findUniqueOrThrow({ where: { tokenHash: hashToken(fresh.raw) } })).revokedAt).toBeNull()
    evidence.targetLoginRace = true
  })
  it('keeps GETs read-only and caps declared activity at the original absolute expiry', async () => {
    const actor = await confirmed(), before = await db.userSession.findFirstOrThrow()
    clock = new Date(baseTime.getTime() + 4 * 60000)
    for (const path of [memberPath(), memberPath(memberB.id)]) expect((await request(path, { login: actor, headers: { 'x-user-activity': 'true' } })).status).toBe(200)
    expect(await db.userSession.findFirstOrThrow()).toEqual(before)
    expect((await roles(actor)).status).toBe(200)
    const after = await db.userSession.findFirstOrThrow()
    expect(after.lastActivityAt).toEqual(clock); expect(after.idleExpiresAt).toEqual(new Date(clock.getTime() + AUTH_POLICY.idleMs))
    expect(after.absoluteExpiresAt).toEqual(before.absoluteExpiresAt)
    await db.userSession.update({ where: { id: after.id }, data: { lastActivityAt: new Date(baseTime.getTime() + 7 * 3600000),
      idleExpiresAt: after.absoluteExpiresAt, reauthenticatedAt: new Date(baseTime.getTime() + 7.5 * 3600000) } })
    clock = new Date(baseTime.getTime() + 7.5 * 3600000)
    expect((await roles(actor, memberB, ['ACCOUNTANT'], 2)).status).toBe(200)
    expect((await db.userSession.findFirstOrThrow()).idleExpiresAt).toEqual(after.absoluteExpiresAt)
    clock = new Date(after.absoluteExpiresAt); expect((await request(memberPath(), { login: actor })).status).toBe(401)
    evidence.memberReadOnlyAndActivity = true
  })
  it('preserves Origin, CSRF, exact reauthentication boundary and cookie hash-only storage', async () => {
    const actor = await confirmed()
    for (const options of [{ origin: null }, { origin: 'https://evil.example.invalid' }, { csrf: 'a'.repeat(64) }]) {
      expect((await request(memberPath(memberB.id, '/roles'), { method: 'PATCH', login: actor, body: { roles: ['APPROVER'], version: 1 }, ...options })).status).toBe(403)
    }
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs)
    expect((await roles(actor)).status).toBe(403); expect((await deactivate(actor)).status).toBe(403)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs - 1)
    expect((await roles(actor)).status).toBe(200)
    expect((await db.userSession.findUniqueOrThrow({ where: { tokenHash: hashToken(actor.raw) } })).csrfTokenHash).toBe(hashToken(actor.csrf))
    evidence.memberProtectionBoundaries = true
  })
  it('whitelists member audit details and rejects mismatched event kinds before persistence', async () => {
    const create = vi.fn().mockResolvedValue({}), tx = { auditEvent: { create } } as any
    const audit = new AuditService(), change = { kind: 'member-roles', membershipId: memberB.id, targetUserId: userB.id,
      rolesBefore: ['READ_ONLY'], rolesAfter: ['APPROVER'], activeBefore: true, activeAfter: true, versionBefore: 1, versionAfter: 2, revokedSessions: 0,
      token: 'raw-token', password: 'raw-password' }
    await audit.record(tx, { type: 'MEMBER_ROLES_CHANGED', requestId: randomUUID(), actorId: userA.id, companyId: companyA.id, change } as any)
    expect(JSON.stringify(create.mock.calls)).not.toMatch(/raw-token|raw-password/)
    await expect(audit.record(tx, { type: 'MEMBERSHIP_DEACTIVATED', requestId: randomUUID(), actorId: userA.id, companyId: companyA.id, change } as any)).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(1)
    evidence.memberAuditWhitelist = true
  })
})
