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
const { CompanyAccessFlowsService } = require('../dist/companies/company-access-flows.service.js') as typeof import('../src/companies/company-access-flows.service')
const { AUTH_POLICY, COMPANY_ACCESS_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const { MailService } = require('../dist/mail/mail.service.js') as typeof import('../src/mail/mail.service')
const { LoginRateLimitService } = require('../dist/auth/login-rate-limit.service.js') as typeof import('../src/auth/login-rate-limit.service')
const argon2 = require('argon2') as typeof import('argon2')
const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f01-company-invitations')
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
let userC: { id: string; email: string }, otherMember: { id: string }
const invPath = (id?: string, action = '') => companyPath('/invitations' + (id ? '/' + id : '') + action)
const reqPath = (id?: string, action = '') => companyPath('/access-requests' + (id ? '/' + id : '') + action)
const mailApi = 'http://127.0.0.1:8025'
let seenMail = new Set<string>()
async function messages(): Promise<any[]> {
  const response = await fetch(`${mailApi}/api/v1/messages?limit=500`)
  if (!response.ok) throw new Error('Local capture service unavailable')
  return (await response.json()).messages
}
async function captured(email = userB.email): Promise<string> {
  await app.get(CompanyAccessFlowsService).flushMail()
  const row = (await messages()).find(message => !seenMail.has(message.ID) && message.Subject === 'ATMS 회사 초대'
    && message.To.some((to: any) => to.Address.toLowerCase() === email.toLowerCase()))
  expect(row, 'Expected local invitation capture').toBeTruthy(); seenMail.add(row.ID)
  const result = await fetch(`${mailApi}/api/v1/message/${row.ID}`); expect(result.status).toBe(200)
  const text = (await result.json()).Text
  expect(text).toContain(`${origin}/accept-company-invitation#token=`)
  return /#token=([a-f0-9]{64})/.exec(text)![1]
}
async function invite(actor: Login, email = userB.email, roles = ['READ_ONLY']) {
  return request(invPath(), { method: 'POST', login: actor, body: { email, roles } })
}
async function applyRequest(session: Login) { return request(reqPath(), { method: 'POST', login: session }) }
async function accept(session: Login, token: string) { return request('/api/company-invitations/accept', { method: 'POST', login: session, body: { token } }) }
async function changeInvite(session: Login, row: { id: string; version: number }, action: string) {
  return request(invPath(row.id, '/' + action), { method: 'POST', login: session, body: { version: row.version } })
}
async function changeRequest(session: Login, row: { id: string; version: number }, action: string) {
  const path = action === 'cancel' ? `/api/me/company-access-requests/${row.id}/cancel` : reqPath(row.id, '/' + action)
  return request(path, { method: 'POST', login: session, body: { version: row.version } })
}
// [F01 통합 검증] 실제 AppModule/HTTP/guard/트랜잭션을 사용한다. 테스트 전용 난수 DB 외 업무 데이터를 쓰지 않는다.
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local database setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
  databaseName = `atms_verify_access_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_access_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification database')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  url.pathname = `/${databaseName}`
  process.env.DATABASE_URL = url.toString()
  process.env.AUTH_WEB_ORIGIN = origin
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = '1025'; process.env.SMTP_TLS = 'local'; process.env.SMTP_FROM = 'no-reply@atms.test'
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
  await app.get(CompanyAccessFlowsService).flushMail()
  vi.restoreAllMocks(); clock = new Date(baseTime)
  seenMail = new Set((await messages()).map(message => message.ID))
  await db.companyInvitation.deleteMany(); await db.companyAccessRequest.deleteMany()
  vi.spyOn(SessionService.prototype, 'now').mockImplementation(() => new Date(clock))
  await db.auditEvent.deleteMany(); await db.loginRateBucket.deleteMany(); await db.userSession.deleteMany()
  await db.companyMemberRole.deleteMany(); await db.companyMembership.deleteMany()
  await db.fiscalYear.deleteMany({ where: { companyId: { notIn: [companyA.id, companyB.id] } } })
  await db.company.deleteMany({ where: { id: { notIn: [companyA.id, companyB.id] } } })
  await db.fiscalYear.deleteMany({ where: { companyId: companyA.id, id: { not: firstYearId } } })
  await db.company.update({ where: { id: companyA.id }, data: { name: 'Existing company A', version: 1 } })
  // [F01 공통 초기화 수정] 비밀번호를 갖고 만든 기본 시험 계정 3개만 원래 활성/확인 상태로 복원한다.
  // 경합 검사에서 만든 비밀번호 없는 임시 중지 계정까지 활성화하면 users_active_password CHECK가 실패한다.
  // where의 ID 목록으로 초기화 범위를 한정한다. 임시 계정의 중지 상태와 업무 DB의 비밀번호 제약은 유지한다.
  await db.user.updateMany({ where: { id: { in: [userA.id, userB.id, userC.id] } }, data: { disabledAt: null, emailVerifiedAt: baseTime } })
  membershipA = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userA.id } })
  await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'COMPANY_ADMIN' } })
  otherMember = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userB.id } })
  await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: otherMember.id, role: 'READ_ONLY' } })
})
afterAll(async () => {
  await app.get(CompanyAccessFlowsService).flushMail()
  vi.restoreAllMocks()
  try {
    if (app) await app.close(); if (db) await db.$disconnect()
    process.env.DATABASE_URL = originalUrl
    if (admin) {
      const after = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } }); expect(after).toEqual(metadata)
      evidence.originalMetadataPreserved = true
      evidence.originalMetadataHash = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      if (created && /^atms_verify_access_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); evidence.onlyCreatedDatabaseRemoved = true
      }
    }
  } finally {
    if (admin) await admin.$disconnect()
    mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

describe('F01 company access flow integration', () => {
  it('cancels an invitation, refuses its token and terminal repeats, then permits a fresh invitation', async () => {
    const actor = await confirmed(), first = (await invite(actor)).data.invitation, token = await captured(), target = await confirmed(userB)
    expect((await changeInvite(actor, first, 'cancel')).status).toBe(200)
    expect((await accept(target, token)).status).toBe(400)
    expect((await changeInvite(actor, { ...first, version: 2 }, 'cancel')).status).toBe(409)
    const next = await invite(actor); expect(next.status).toBe(200); expect(next.data.invitation.id).not.toBe(first.id)
    evidence.invitationCancellation = true
  })
  it('refuses stale pending versions and integer-max increments without state changes', async () => {
    const actor = await confirmed(), target = await login(userB), row = (await applyRequest(target)).data.accessRequest
    await db.companyAccessRequest.update({ where: { id: row.id }, data: { version: 2 } })
    expect((await changeRequest(actor, row, 'approve')).status).toBe(409)
    await db.companyAccessRequest.update({ where: { id: row.id }, data: { version: 2147483647 } })
    expect((await changeRequest(actor, { ...row, version: 2147483647 }, 'approve')).status).toBe(409)
    expect((await db.companyAccessRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('PENDING')
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(0)
    const invitation = (await invite(actor, userC.email)).data.invitation
    await app.get(CompanyAccessFlowsService).flushMail()
    await db.companyInvitation.update({ where: { id: invitation.id }, data: { version: 2147483647 } })
    expect((await changeInvite(actor, { ...invitation, version: 2147483647 }, 'cancel')).status).toBe(409)
    evidence.flowVersionBoundaries = true
  })
  it('resolves accept versus resend without accepting an invalidated token or granting twice', async () => {
    const actor = await confirmed(), first = (await invite(actor)).data.invitation, token = await captured(), target = await confirmed(userB)
    const [consumed, resent] = await Promise.all([accept(target, token), changeInvite(actor, first, 'resend')])
    expect(consumed.status === 200 ? resent.status === 409 : consumed.status === 400 && resent.status === 200).toBe(true)
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(consumed.status === 200 ? 1 : 0)
    evidence.concurrentResendAccept = true
  })
  it('detects a newly registered email candidate before taking a missing User lock', async () => {
    const actor = await confirmed(), service = app.get(CompanyAccessFlowsService) as any, original = service.transact.bind(service)
    vi.spyOn(service, 'transact').mockImplementationOnce(async (...args: any[]) => {
      await db.user.create({ data: { email: 'race-new@example.invalid', emailNormalized: 'race-new@example.invalid', disabledAt: baseTime } })
      return original(...args)
    })
    expect((await invite(actor, 'race-new@example.invalid')).status).toBe(409)
    expect(await db.companyInvitation.count()).toBe(0)
    evidence.newUserCandidateRecheck = true
  })
  it('rolls back consumed token and new membership on a genuine DB constraint failure', async () => {
    const actor = await confirmed(), row = (await invite(actor)).data.invitation, token = await captured(), target = await confirmed(userB)
    const audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementation(async (tx, event) => {
      if (event.type === 'INVITATION_ACCEPTED') await tx.$executeRaw`UPDATE company_invitations SET version=0 WHERE id=${row.id}::uuid`
      await original(tx, event)
    })
    const result = await accept(target, token); expect(result.status).toBe(500); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect((await db.companyInvitation.findUniqueOrThrow({ where: { id: row.id } }))).toMatchObject({ status: 'PENDING', version: 1 })
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(0)
    expect((await request('/api/auth/session', { login: target })).status).toBe(200)
    evidence.flowDatabaseRollback = true
  })
  it('serializes requester relogin behind approval and preserves only the new post-commit session', async () => {
    const actor = await confirmed(), target = await login(userB), row = (await applyRequest(target)).data.accessRequest
    const sessions = app.get(SessionService), original = sessions.revokeForUser.bind(sessions)
    let pending: Promise<Login> | undefined
    vi.spyOn(sessions, 'revokeForUser').mockImplementationOnce(async (tx, id) => {
      pending = login(userB); await new Promise(resolve => setTimeout(resolve, 25)); return original(tx, id)
    })
    expect((await changeRequest(actor, row, 'approve')).status).toBe(200)
    const fresh = await pending!; expect((await request('/api/auth/session', { login: target })).status).toBe(401)
    expect((await request(companyPath(), { login: fresh })).status).toBe(200)
    evidence.flowTargetLoginRace = true
  })
  it('allows a verified nonmember to request without granting access and exposes only own requests', async () => {
    const target = await login(userB), actor = await confirmed(), unrelated = await login(userC)
    const result = await applyRequest(target); expect(result.status).toBe(200)
    expect(result.data.accessRequest).toMatchObject({ companyId: companyA.id, requesterId: userB.id, version: 1, status: 'PENDING' })
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(0)
    expect((await request(companyPath(), { login: target })).status).toBe(403)
    const own = await request('/api/me/company-access-requests', { login: target }); expect(own.data.items).toHaveLength(1)
    expect(own.data.items[0]).not.toHaveProperty('requester'); expect(own.data.items[0]).not.toHaveProperty('name')
    expect((await request('/api/me/company-access-requests', { login: unrelated })).data.items).toHaveLength(0)
    const adminList = await request(reqPath(), { login: actor }); expect(adminList.status).toBe(200)
    expect(adminList.data.items[0].requester).toEqual({ id: userB.id, email: userB.email, emailVerified: true, disabled: false })
    evidence.requestOwnershipAndNoPrematureGrant = true
  })
  it('rejects nonadmins, foreign admin identifiers, invalid company and other-user cancellations', async () => {
    const target = await login(userB), actor = await confirmed(), unrelated = await login(userC)
    const row = (await applyRequest(target)).data.accessRequest
    expect((await request(invPath(), { login: target })).status).toBe(403)
    expect((await request(reqPath(), { login: target })).status).toBe(403)
    expect((await changeRequest(unrelated, row, 'cancel')).status).toBe(404)
    for (const id of [row.id, randomUUID()]) {
      expect((await request(reqPath(id, '/approve').replace(companyA.id, companyB.id), { method: 'POST', login: actor, body: { version: 1 } })).status).toBe(403)
    }
    const member = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userA.id } })
    await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: member.id, role: 'COMPANY_ADMIN' } })
    expect((await request(reqPath(row.id, '/approve').replace(companyA.id, companyB.id), { method: 'POST', login: actor, body: { version: 1 } })).status).toBe(404)
    expect((await request(`/api/companies/${randomUUID()}/access-requests`, { method: 'POST', login: unrelated })).status).toBe(404)
    expect((await changeInvite(actor, { id: randomUUID(), version: 1 }, 'cancel')).status).toBe(404)
    evidence.scopeAndForeignIds = true
  })
  it('paginates within company and requester scopes with no secret fields', async () => {
    const actor = await confirmed(), target = await login(userB)
    for (const email of ['page1@example.invalid', 'page2@example.invalid']) expect((await invite(actor, email)).status).toBe(200)
    const first = await request(invPath() + '?limit=1', { login: actor }); expect(first.data.items).toHaveLength(1)
    const next = await request(invPath() + '?limit=1&cursor=' + first.data.nextCursor, { login: actor })
    expect(next.data.items).toHaveLength(1); expect(next.data.items[0].id).not.toBe(first.data.items[0].id)
    expect(JSON.stringify(first.data)).not.toMatch(/tokenHash|tokenInvalidatedAt|password|session/)
    expect((await request(invPath() + '?cursor=' + randomUUID(), { login: actor })).status).toBe(400)
    const row = (await applyRequest(target)).data.accessRequest
    expect((await request('/api/me/company-access-requests?cursor=' + row.id, { login: await login(userC) })).status).toBe(400)
    expect((await request(reqPath() + '?cursor=' + randomUUID(), { login: actor })).status).toBe(400)
    evidence.flowPagination = true
  })
  it('captures invitation mail and accepts exact roles with hash-only storage and self session rotation', async () => {
    const actor = await confirmed(), otherDevice = await login(userB), target = await confirmed(userB)
    const original = await db.userSession.findUniqueOrThrow({ where: { tokenHash: hashToken(target.raw) } })
    const issued = await invite(actor, userB.email.toUpperCase(), ['APPROVER', 'ACCOUNTANT'])
    expect(issued.status).toBe(200); const token = await captured(); expect(JSON.stringify(issued.data)).not.toContain(token)
    const stored = await db.companyInvitation.findFirstOrThrow(); expect(stored.tokenHash).toBe(hashToken(token)); expect(JSON.stringify(stored)).not.toContain(token)
    clock = new Date(baseTime.getTime() + 4 * 60000)
    const accepted = await accept(target, token); expect(accepted.status).toBe(200)
    expect(accepted.data.member).toMatchObject({ version: 1, active: true, roles: ['ACCOUNTANT', 'APPROVER'] })
    const current = rotated(accepted); expect(current.raw).not.toBe(target.raw); expect(current.csrf).not.toBe(target.csrf)
    const after = await db.userSession.findUniqueOrThrow({ where: { id: original.id } })
    expect(after.createdAt).toEqual(original.createdAt); expect(after.absoluteExpiresAt).toEqual(original.absoluteExpiresAt)
    expect(after.csrfTokenHash).toBe(hashToken(current.csrf))
    for (const old of [target, otherDevice]) expect((await request('/api/auth/session', { login: old })).status).toBe(401)
    expect((await request('/api/auth/session', { login: current })).status).toBe(200)
    expect((await request('/api/auth/session', { login: actor })).status).toBe(200)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: otherMember.id } })).active).toBe(true)
    expect((await db.company.findUniqueOrThrow({ where: { id: companyA.id } })).version).toBe(1)
    expect(await db.companyMemberRole.count({ where: { membershipId: accepted.data.member.id } })).toBe(2)
    expect((await accept(current, token)).status).toBe(400)
    evidence.mailCaptureAndRoleGrant = true; evidence.selfRotationAndCompanyPreservation = true
  })
  it('returns identical errors for wrong-email, unknown and other-purpose tokens without consuming a valid invite', async () => {
    const actor = await confirmed(), outsider = await confirmed(userC), target = await confirmed(userB)
    expect((await invite(actor)).status).toBe(200); const token = await captured()
    const errors = [await accept(outsider, token), await accept(target, 'a'.repeat(64))]
    const action = await db.userActionToken.create({ data: { userId: userB.id, purpose: 'EMAIL_VERIFICATION', tokenHash: hashToken('b'.repeat(64)), createdAt: baseTime, expiresAt: new Date(baseTime.getTime() + AUTH_POLICY.verificationMs) } })
    errors.push(await accept(target, 'b'.repeat(64)))
    expect(errors.map(row => row.status)).toEqual([400, 400, 400]); expect(errors[0].data).toEqual(errors[1].data)
    expect((await db.companyInvitation.findFirstOrThrow()).status).toBe('PENDING')
    expect((await db.userActionToken.findUniqueOrThrow({ where: { id: action.id } })).usedAt).toBeNull()
    await db.userActionToken.deleteMany()
    evidence.tokenIsolationAndEmailMatch = true
  })
  it('invites an unregistered address without creating an account or membership', async () => {
    const actor = await confirmed(), count = await db.user.count(), address = 'future-recipient@example.invalid'
    const result = await invite(actor, address); expect(result.status).toBe(200); expect(result.data).not.toHaveProperty('accountExists')
    expect(await db.user.count()).toBe(count); expect(await db.companyMembership.count({ where: { companyId: companyA.id } })).toBe(1)
    expect(await captured(address)).toMatch(/^[a-f0-9]{64}$/)
    evidence.unregisteredInvitation = true
  })
  it('rejects unverified and disabled authenticated accounts before request or acceptance', async () => {
    const target = await confirmed(userB), actor = await confirmed()
    await invite(actor); const token = await captured()
    for (const data of [{ emailVerifiedAt: null }, { disabledAt: baseTime }]) {
      await db.user.update({ where: { id: userB.id }, data })
      expect((await applyRequest(target)).status).toBe(401); expect((await accept(target, token)).status).toBe(401)
      await db.user.update({ where: { id: userB.id }, data: { emailVerifiedAt: baseTime, disabledAt: null } })
    }
    evidence.verifiedAccountBoundary = true
  })
  it('enforces strict HTTP input including fixed requester role and version bounds', async () => {
    const actor = await confirmed(), target = await confirmed(userB)
    for (const body of [{ email: userB.email, roles: [] }, { email: userB.email, roles: ['READ_ONLY', 'READ_ONLY'] },
      { email: userB.email, roles: ['ADMIN'] }, { email: userB.email, roles: ['READ_ONLY'], userId: userC.id }]) {
      expect((await request(invPath(), { method: 'POST', login: actor, body })).status).toBe(400)
    }
    expect((await request(reqPath(), { method: 'POST', login: target, body: { roles: ['COMPANY_ADMIN'] } })).status).toBe(400)
    expect((await request('/api/company-invitations/accept', { method: 'POST', login: target, body: { token: 'A'.repeat(64) } })).status).toBe(400)
    expect((await request(invPath(randomUUID(), '/cancel'), { method: 'POST', login: actor, body: { version: 0 } })).status).toBe(400)
    expect(await db.companyInvitation.count()).toBe(0); expect(await db.companyAccessRequest.count()).toBe(0)
    evidence.strictFlowInput = true
  })
  it('deduplicates concurrent identical invites and requests without duplicate mail or audit', async () => {
    const actor = await confirmed(), target = await login(userC)
    const results = await Promise.all([invite(actor), invite(actor)])
    expect(results.map(row => row.status)).toEqual([200, 200]); expect(results[0].data.invitation.id).toBe(results[1].data.invitation.id)
    expect(await db.companyInvitation.count()).toBe(1); await captured()
    expect(await db.auditEvent.count({ where: { type: 'INVITATION_CREATED' } })).toBe(1)
    const requests = await Promise.all([applyRequest(target), applyRequest(target)])
    expect(requests.map(row => row.status)).toEqual([200, 200]); expect(requests[0].data.accessRequest.id).toBe(requests[1].data.accessRequest.id)
    expect(await db.auditEvent.count({ where: { type: 'ACCESS_REQUEST_CREATED' } })).toBe(1)
    expect((await invite(actor, userB.email, ['APPROVER'])).status).toBe(409)
    evidence.concurrentDeduplication = true
  })
  it('rejects simultaneous pending invitation and request for the same company target', async () => {
    const actor = await confirmed(), target = await login(userB), outsider = await login(userC)
    expect((await applyRequest(target)).status).toBe(200)
    expect((await invite(actor)).status).toBe(409)
    expect((await invite(actor, userC.email)).status).toBe(200)
    expect((await applyRequest(outsider)).status).toBe(409)
    evidence.opposingPendingConflict = true
  })
  it('refuses both active and inactive existing memberships without role merge or reactivation', async () => {
    const actor = await confirmed(), target = await login(userB)
    // [F01 입력 계약 수정] 테스트 준비 자료도 실제 Prisma 중첩 계약을 사용한다. 회사 키는 부모 소속이 제공한다.
    const member = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userB.id, roles: { create: { role: 'READ_ONLY' } } } })
    for (const active of [true, false]) {
      await db.companyMembership.update({ where: { id: member.id }, data: { active } })
      expect((await invite(actor)).status).toBe(409); expect((await applyRequest(target)).status).toBe(409)
      expect((await db.companyMembership.findUniqueOrThrow({ where: { id: member.id } })).active).toBe(active)
    }
    expect(await db.companyMemberRole.count({ where: { membershipId: member.id } })).toBe(1)
    evidence.existingMembershipNoRevival = true
  })
  it('supports rejection, requester cancellation and fresh requests while refusing terminal repeats', async () => {
    const actor = await confirmed(), target = await login(userB)
    const first = (await applyRequest(target)).data.accessRequest
    expect((await changeRequest(actor, first, 'reject')).status).toBe(200)
    expect((await changeRequest(actor, { ...first, version: 2 }, 'approve')).status).toBe(409)
    const second = (await applyRequest(target)).data.accessRequest; expect(second.id).not.toBe(first.id)
    expect((await changeRequest(target, second, 'cancel')).status).toBe(200)
    expect((await changeRequest(target, { ...second, version: 2 }, 'cancel')).status).toBe(409)
    expect((await applyRequest(target)).status).toBe(200)
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(0)
    evidence.requestTerminalLifecycle = true
  })
  it('marks expired requests only on subsequent writes at the exact seven-day boundary', async () => {
    let target = await login(userB); const first = (await applyRequest(target)).data.accessRequest
    clock = new Date(baseTime.getTime() + COMPANY_ACCESS_POLICY.requestMs); target = await login(userB); const actor = await confirmed()
    const list = await request('/api/me/company-access-requests', { login: target }); expect(list.data.items[0].status).toBe('EXPIRED')
    expect((await db.companyAccessRequest.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('PENDING')
    expect((await changeRequest(actor, first, 'approve')).status).toBe(409)
    const next = await applyRequest(target); expect(next.status).toBe(200); expect(next.data.accessRequest.id).not.toBe(first.id)
    expect((await db.companyAccessRequest.findUniqueOrThrow({ where: { id: first.id } }))).toMatchObject({ status: 'EXPIRED', version: 2 })
    expect(await db.auditEvent.count({ where: { type: 'COMPANY_ACCESS_EXPIRED' } })).toBe(1)
    evidence.requestExpiration = true
  })
  it('resends with a fresh token and rejects old tokens and stale versions', async () => {
    const actor = await confirmed(); const first = (await invite(actor)).data.invitation; const oldToken = await captured()
    clock = new Date(baseTime.getTime() + 4 * 60000)
    const result = await changeInvite(actor, first, 'resend'); expect(result.status).toBe(200); expect(result.data.invitation.version).toBe(2)
    const newToken = await captured(); expect(newToken).not.toBe(oldToken)
    expect(result.data.invitation.expiresAt).toBe(new Date(clock.getTime() + COMPANY_ACCESS_POLICY.invitationMs).toISOString())
    expect((await changeInvite(actor, first, 'resend')).status).toBe(409)
    const target = await confirmed(userB); expect((await accept(target, oldToken)).status).toBe(400)
    expect((await accept(target, newToken)).status).toBe(200)
    evidence.resendTokenAndVersion = true
  })
  it('refuses expired token and resend, then allows a new invitation after seven days', async () => {
    let actor = await confirmed(); const first = (await invite(actor)).data.invitation; const token = await captured()
    clock = new Date(baseTime.getTime() + COMPANY_ACCESS_POLICY.invitationMs); actor = await confirmed(); const target = await confirmed(userB)
    expect((await accept(target, token)).status).toBe(400)
    const list = await request(invPath(), { login: actor }); expect(list.data.items[0].status).toBe('EXPIRED')
    expect((await db.companyInvitation.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('PENDING')
    expect((await changeInvite(actor, first, 'resend')).status).toBe(409)
    const fresh = await invite(actor); expect(fresh.status).toBe(200); expect(fresh.data.invitation.id).not.toBe(first.id)
    expect((await db.companyInvitation.findUniqueOrThrow({ where: { id: first.id } }))).toMatchObject({ status: 'EXPIRED', version: 2 })
    evidence.invitationExpiration = true
  })
  it('approves only EXTERNAL_TAX, revokes all target devices and preserves other-company roles and unrelated sessions', async () => {
    const target = await login(userB), otherDevice = await login(userB), actor = await confirmed(), unrelated = await login(userC)
    const row = (await applyRequest(target)).data.accessRequest
    expect((await changeRequest(actor, row, 'approve')).status).toBe(200)
    const member = await db.companyMembership.findUniqueOrThrow({ where: { companyId_userId: { companyId: companyA.id, userId: userB.id } }, include: { roles: true } })
    expect(member.roles.map(row => row.role)).toEqual(['EXTERNAL_TAX']); expect(member.version).toBe(1)
    for (const old of [target, otherDevice]) expect((await request('/api/auth/session', { login: old })).status).toBe(401)
    for (const kept of [actor, unrelated]) expect((await request('/api/auth/session', { login: kept })).status).toBe(200)
    expect((await db.companyMembership.findUniqueOrThrow({ where: { id: otherMember.id } })).active).toBe(true)
    expect((await db.companyMemberRole.findMany({ where: { membershipId: otherMember.id } })).map(row => row.role)).toEqual(['READ_ONLY'])
    expect((await request(invPath(), { login: await login(userB) })).status).toBe(403)
    expect((await db.auditEvent.findFirstOrThrow({ where: { type: 'ACCESS_REQUEST_APPROVED' } })).details).toMatchObject({ revokedSessions: 2 })
    evidence.approvalSessionAndFixedRole = true
  })
  it('serializes concurrent approval and cancellation with at most one grant and one terminal audit', async () => {
    const target = await login(userB), actor = await confirmed(); const row = (await applyRequest(target)).data.accessRequest
    const results = await Promise.all([changeRequest(actor, row, 'approve'), changeRequest(target, row, 'cancel')])
    expect(results.filter(row => row.status === 200)).toHaveLength(1); expect(results.every(row => [200, 401, 409].includes(row.status))).toBe(true)
    const stored = await db.companyAccessRequest.findUniqueOrThrow({ where: { id: row.id } })
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(stored.status === 'APPROVED' ? 1 : 0)
    expect(await db.auditEvent.count({ where: { type: { in: ['ACCESS_REQUEST_APPROVED', 'ACCESS_REQUEST_CANCELLED'] } } })).toBe(1)
    evidence.concurrentRequestTerminal = true
  })
  it('grants at most once for concurrent token consumption and refuses replay', async () => {
    const actor = await confirmed(); await invite(actor); const token = await captured(), target = await confirmed(userB)
    const results = await Promise.all([accept(target, token), accept(target, token)])
    expect(results.filter(row => row.status === 200)).toHaveLength(1); expect(results.every(row => [200, 401, 400].includes(row.status))).toBe(true)
    const current = rotated(results.find(row => row.status === 200)!)
    expect((await accept(current, token)).status).toBe(400)
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(1)
    expect(await db.auditEvent.count({ where: { type: 'INVITATION_ACCEPTED' } })).toBe(1)
    evidence.concurrentTokenConsumption = true
  })
  it('serializes cancellation and resend using one current version', async () => {
    const actor = await confirmed(), row = (await invite(actor)).data.invitation
    const results = await Promise.all([changeInvite(actor, row, 'cancel'), changeInvite(actor, row, 'resend')])
    expect(results.map(row => row.status).sort()).toEqual([200, 409])
    expect((await db.companyInvitation.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(2)
    expect(await db.auditEvent.count({ where: { type: { in: ['INVITATION_CANCELLED', 'INVITATION_RESENT'] } } })).toBe(1)
    evidence.concurrentInviteVersion = true
  })
  it('rechecks current admin role, session and reauthentication after guard authorization', async () => {
    const target = await login(userB), actor = await confirmed(), row = (await applyRequest(target)).data.accessRequest
    const sessions = app.get(SessionService), original = sessions.extend.bind(sessions)
    vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => { await original(context); await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } }) })
    expect((await changeRequest(actor, row, 'approve')).status).toBe(403)
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: membershipA.id, role: 'COMPANY_ADMIN' } })
    vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => { await original(context); await db.userSession.update({ where: { id: context.session.id }, data: { reauthenticatedAt: new Date(baseTime.getTime() - AUTH_POLICY.reauthMs) } }) })
    expect((await changeRequest(actor, row, 'approve')).status).toBe(403)
    await db.userSession.updateMany({ where: { userId: userA.id }, data: { reauthenticatedAt: baseTime } })
    vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => { await original(context); await db.userSession.update({ where: { id: context.session.id }, data: { revokedAt: baseTime } }) })
    expect((await changeRequest(actor, row, 'approve')).status).toBe(401)
    expect((await db.companyAccessRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('PENDING')
    evidence.actorTransactionRecheck = true
  })
  it('refuses a demoted issuer and permits takeover only through another current admin resend', async () => {
    const actor = await confirmed(), row = (await invite(actor)).data.invitation, token = await captured(), target = await confirmed(userB)
    // [F01 입력 계약 수정] 발행자 재검사를 위한 관리자도 부모 관계와 role만으로 만든다.
    const member = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userC.id, roles: { create: { role: 'COMPANY_ADMIN' } } } })
    await db.companyMemberRole.deleteMany({ where: { membershipId: membershipA.id } })
    expect((await accept(target, token)).status).toBe(409)
    const newIssuer = await confirmed(userC), changed = await changeInvite(newIssuer, row, 'resend')
    expect(changed.status).toBe(200); expect(changed.data.invitation.issuerId).toBe(userC.id)
    expect((await accept(target, await captured())).status).toBe(200)
    expect(member.id).toBeTruthy(); evidence.issuerCurrentAuthority = true
  })
  it('detects a changed issuer candidate without taking User locks after Company', async () => {
    const actor = await confirmed(), row = (await invite(actor)).data.invitation, token = await captured(), target = await confirmed(userB)
    const service = app.get(CompanyAccessFlowsService) as any, original = service.transact.bind(service)
    vi.spyOn(service, 'transact').mockImplementationOnce(async (...args: any[]) => {
      await db.companyInvitation.update({ where: { id: row.id }, data: { issuerId: userC.id } })
      return original(...args)
    })
    expect((await accept(target, token)).status).toBe(409)
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(0)
    evidence.lockCandidateRecheck = true
  })
  it('rechecks requester account and newly existing memberships before approval', async () => {
    const actor = await confirmed(), target = await login(userB), row = (await applyRequest(target)).data.accessRequest
    const sessions = app.get(SessionService), original = sessions.extend.bind(sessions)
    vi.spyOn(sessions, 'extend').mockImplementationOnce(async context => { await original(context); await db.user.update({ where: { id: userB.id }, data: { emailVerifiedAt: null } }) })
    expect((await changeRequest(actor, row, 'approve')).status).toBe(409)
    await db.user.update({ where: { id: userB.id }, data: { emailVerifiedAt: baseTime } })
    await db.companyMembership.create({ data: { companyId: companyA.id, userId: userB.id, active: false } })
    expect((await changeRequest(actor, row, 'approve')).status).toBe(409)
    expect((await db.companyAccessRequest.findUniqueOrThrow({ where: { id: row.id } }))).toMatchObject({ status: 'PENDING', version: 1 })
    evidence.targetTransactionRecheck = true
  })
  it('rolls back invitation consumption, membership and self cookie when audit fails', async () => {
    const actor = await confirmed(), row = (await invite(actor)).data.invitation, token = await captured(), target = await confirmed(userB)
    const audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementation((tx, event) => event.type === 'INVITATION_ACCEPTED' ? Promise.reject(new Error('injected audit failure')) : original(tx, event))
    const result = await accept(target, token); expect(result.status).toBe(500); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(0)
    expect((await db.companyInvitation.findUniqueOrThrow({ where: { id: row.id } }))).toMatchObject({ status: 'PENDING', version: 1, tokenInvalidatedAt: null })
    expect((await request('/api/auth/session', { login: target })).status).toBe(200)
    evidence.invitationAuditAndCookieRollback = true
  })
  it('rolls back request approval, target sessions and new membership when audit fails', async () => {
    const actor = await confirmed(), target = await login(userB), row = (await applyRequest(target)).data.accessRequest
    const audit = app.get(AuditService), original = audit.record.bind(audit)
    vi.spyOn(audit, 'record').mockImplementation((tx, event) => event.type === 'ACCESS_REQUEST_APPROVED' ? Promise.reject(new Error('injected audit failure')) : original(tx, event))
    expect((await changeRequest(actor, row, 'approve')).status).toBe(500)
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(0)
    expect((await db.companyAccessRequest.findUniqueOrThrow({ where: { id: row.id } }))).toMatchObject({ status: 'PENDING', version: 1 })
    expect((await request('/api/auth/session', { login: target })).status).toBe(200)
    evidence.requestAuditRollback = true
  })
  it('rolls back approval and acceptance when their session operation fails', async () => {
    const actor = await confirmed(), target = await confirmed(userB), row = (await applyRequest(target)).data.accessRequest
    vi.spyOn(app.get(SessionService), 'revokeForUser').mockRejectedValueOnce(new Error('injected session failure'))
    expect((await changeRequest(actor, row, 'approve')).status).toBe(500)
    expect((await db.companyAccessRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('PENDING')
    await changeRequest(target, row, 'cancel'); await invite(actor); const token = await captured()
    vi.spyOn(app.get(SessionService), 'rotateForNewRole').mockRejectedValueOnce(new Error('injected rotation failure'))
    const result = await accept(target, token); expect(result.status).toBe(500); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect((await db.companyInvitation.findFirstOrThrow()).status).toBe('PENDING')
    expect(await db.companyMembership.count({ where: { companyId: companyA.id, userId: userB.id } })).toBe(0)
    evidence.flowSessionRollback = true
  })
  it('invalidates only failed mail token while leaving a pending invite resendable', async () => {
    const actor = await confirmed(), mail = app.get(MailService), send = mail.send.bind(mail)
    vi.spyOn(mail, 'send').mockResolvedValueOnce(false)
    const issued = await invite(actor); expect(issued.status).toBe(200); await app.get(CompanyAccessFlowsService).flushMail()
    const row = await db.companyInvitation.findFirstOrThrow(); expect(row.status).toBe('PENDING'); expect(row.version).toBe(1); expect(row.tokenInvalidatedAt).not.toBeNull()
    expect(await db.auditEvent.count({ where: { type: 'INVITATION_MAIL_FAILED' } })).toBe(1)
    vi.spyOn(mail, 'send').mockImplementation(send)
    expect((await changeInvite(actor, row, 'resend')).status).toBe(200)
    expect((await db.companyInvitation.findFirstOrThrow()).tokenInvalidatedAt).toBeNull()
    expect((await accept(await confirmed(userB), await captured())).status).toBe(200)
    evidence.mailFailureRecovery = true
  })
  it('does not invalidate a newer resend token when old mail fails late', async () => {
    const actor = await confirmed(), mail = app.get(MailService)
    let fail!: (value: boolean) => void
    const spy = vi.spyOn(mail, 'send').mockImplementationOnce(() => new Promise(resolve => { fail = resolve })).mockResolvedValue(true)
    const row = (await invite(actor)).data.invitation
    expect((await changeInvite(actor, row, 'resend')).status).toBe(200)
    const text = spy.mock.calls[1][0].text, token = /#token=([a-f0-9]{64})/.exec(text)![1]
    fail(false); await app.get(CompanyAccessFlowsService).flushMail()
    const stored = await db.companyInvitation.findFirstOrThrow(); expect(stored.tokenHash).toBe(hashToken(token)); expect(stored.tokenInvalidatedAt).toBeNull()
    expect(await db.auditEvent.count({ where: { type: 'INVITATION_MAIL_FAILED' } })).toBe(0)
    expect((await accept(await confirmed(userB), token)).status).toBe(200)
    evidence.oldMailFailureRace = true
  })
  it('shares existing account email limits and uses separate requester limits with exact window expiry', async () => {
    const actor = await confirmed(), target = await login(userB), rate = app.get(LoginRateLimitService)
    for (let i = 0; i < 3; i++) await rate.reserveEmailAccount(userB.email, clock)
    expect((await invite(actor)).status).toBe(429); expect(await db.companyInvitation.count()).toBe(0)
    for (let i = 0; i < 3; i++) expect((await applyRequest(target)).status).toBe(200)
    expect((await applyRequest(target)).status).toBe(429)
    clock = new Date(baseTime.getTime() + COMPANY_ACCESS_POLICY.requestWindowMs)
    expect((await applyRequest(target)).status).toBe(200)
    const own = await db.companyAccessRequest.findFirstOrThrow(); expect((await changeRequest(target, own, 'cancel')).status).toBe(200)
    expect((await invite(await confirmed())).status).toBe(200)
    evidence.sharedEmailAndRequestLimits = true
  })
  it('enforces shared email IP and separate request IP limits without trusting spoofed forwarding headers', async () => {
    const actor = await confirmed(), rate = app.get(LoginRateLimitService)
    for (let i = 0; i < 20; i++) await rate.reserveEmailIp('127.0.0.1', clock)
    expect((await invite(actor)).status).toBe(429)
    const target = await login(userB)
    for (let i = 0; i < 20; i++) {
      const result = await request(reqPath(), { method: 'POST', login: target, headers: { 'x-forwarded-for': `203.0.113.${i}` } })
      expect(result.status).toBe(i < 3 ? 200 : 429)
    }
    expect((await applyRequest(await login(userC))).status).toBe(429)
    evidence.flowIpLimits = true
  })
  it('keeps GET read-only and preserves Origin, CSRF and exact sensitive reauthentication boundaries', async () => {
    const actor = await confirmed(), target = await confirmed(userB), row = (await applyRequest(target)).data.accessRequest
    const before = await db.userSession.findUniqueOrThrow({ where: { tokenHash: hashToken(actor.raw) } })
    clock = new Date(baseTime.getTime() + 4 * 60000)
    for (const path of [invPath(), reqPath()]) expect((await request(path, { login: actor, headers: { 'x-user-activity': 'true' } })).status).toBe(200)
    expect(await db.userSession.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
    for (const options of [{ origin: null }, { origin: 'https://evil.example.invalid' }, { csrf: 'a'.repeat(64) }]) {
      expect((await request(reqPath(row.id, '/approve'), { method: 'POST', login: actor, body: { version: 1 }, ...options })).status).toBe(403)
    }
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs)
    expect((await changeRequest(actor, row, 'approve')).status).toBe(403); expect((await invite(actor)).status).toBe(403)
    expect((await changeRequest(target, row, 'cancel')).status).toBe(200)
    const fresh = (await applyRequest(target)).data.accessRequest
    // 동일 서버 시각에서 재확인 시각을 1ms 뒤로 설정하여 elapsed=5분-1ms 허용 경계를 검증한다.
    await db.userSession.update({ where: { id: before.id }, data: { reauthenticatedAt: new Date(baseTime.getTime() + 1) } })
    expect((await changeRequest(actor, fresh, 'approve')).status).toBe(200)
    evidence.flowHttpProtectionAndReadOnly = true
  })
})
