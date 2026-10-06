import { createRequire } from 'node:module'
import { randomBytes, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { PrismaPg } from '@prisma/adapter-pg'
import { config as loadEnv } from 'dotenv'
import { NestFactory } from '@nestjs/core'
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { SessionService } = require('../dist/auth/session.service.js') as typeof import('../src/auth/session.service')
const { AccountLifecycleService } = require('../dist/auth/account-lifecycle.service.js') as typeof import('../src/auth/account-lifecycle.service')
const { PasswordPolicyService } = require('../dist/auth/password-policy.service.js') as typeof import('../src/auth/password-policy.service')
const { MailService } = require('../dist/mail/mail.service.js') as typeof import('../src/mail/mail.service')
const { AuditService } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
const { LoginRateLimitService } = require('../dist/auth/login-rate-limit.service.js') as typeof import('../src/auth/login-rate-limit.service')
const { AUTH_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const { actionHash } = require('../dist/auth/action-token.service.js') as typeof import('../src/auth/action-token.service')
const argon2 = require('argon2') as typeof import('argon2')
const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f01-account-lifecycle')
const baseTime = new Date('2026-10-05T00:00:00Z'), origin = 'http://127.0.0.1:4173'
const oldPassword = 'isolated original password ', newPassword = ' 최종 비밀번호😀 with spaces '
const mailApi = 'http://127.0.0.1:8025'
let clock = new Date(baseTime), app: INestApplication
let db: InstanceType<typeof PrismaClient>, admin: InstanceType<typeof PrismaClient>
let databaseName: string, originalUrl: string, address: string, fixtureHash: string, metadata: unknown, created = false
let a: { id: string; email: string }, b: { id: string; email: string }, pendingEmail: string
let previousMail = new Set<string>()
const evidence: Record<string, unknown> = {}
type Login = { cookie: string; csrf: string }
async function post(path: string, body: unknown = {}, login?: Login, extra: Record<string, string> = {}) {
  const response = await fetch(`${address}/api/auth/${path}`, { method: 'POST', headers: { origin, 'content-type': 'application/json',
    ...(login ? { cookie: login.cookie, 'x-csrf-token': login.csrf } : {}), ...extra }, body: JSON.stringify(body) })
  return { response, status: response.status, data: await response.json() }
}
async function session(login: Login) { return (await fetch(`${address}/api/auth/session`, { headers: { cookie: login.cookie } })).status }
async function login(email = a.email, password = oldPassword): Promise<Login> {
  const result = await post('login', { email, password })
  expect(result.status).toBe(200)
  return { cookie: result.response.headers.get('set-cookie')!.split(';')[0], csrf: result.data.csrfToken }
}
async function messages(): Promise<any[]> {
  const response = await fetch(`${mailApi}/api/v1/messages?limit=500`)
  if (!response.ok) throw new Error('Local Mailpit API unavailable')
  return (await response.json()).messages
}
async function captured(email: string, subject: string): Promise<{ token?: string; text: string }> {
  await app.get(AccountLifecycleService).flushMail()
  const row = (await messages()).find(message => !previousMail.has(message.ID) && message.Subject === subject
    && message.To.some((to: any) => to.Address.toLowerCase() === email.toLowerCase()))
  expect(row, 'Expected message in local SMTP capture').toBeTruthy()
  previousMail.add(row.ID)
  const response = await fetch(`${mailApi}/api/v1/message/${row.ID}`)
  expect(response.status).toBe(200)
  const content = await response.json()
  return { token: /#token=([a-f0-9]{64})/.exec(content.Text)?.[1], text: content.Text }
}
async function issue(email = a.email, kind = 'password-reset') {
  expect((await post(`${kind}/request`, { email })).status).toBe(202)
  const mail = await captured(email, kind === 'password-reset' ? 'ATMS 비밀번호 재설정' : 'ATMS 이메일 확인')
  expect(mail.token).toMatch(/^[a-f0-9]{64}$/)
  return mail.token!
}
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected local isolated test setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
  databaseName = `atms_verify_lifecycle_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_lifecycle_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid test database')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true
  url.pathname = `/${databaseName}`
  process.env.DATABASE_URL = url.toString(); process.env.AUTH_WEB_ORIGIN = origin
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = '1025'; process.env.SMTP_TLS = 'local'; process.env.SMTP_FROM = 'no-reply@atms.test'
  try { execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env: process.env, stdio: 'pipe', timeout: 30000 }) }
  catch { throw new Error('Isolated lifecycle migration failed') }
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }) })
  fixtureHash = await argon2.hash(oldPassword, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB, timeCost: 2, parallelism: 1 })
  // 외부 사용자 비밀번호를 HIBP에 보내지 않는다. 별도 서비스 테스트가 실제 파서를 검사한다.
  vi.spyOn(PasswordPolicyService.prototype, 'fetchRange').mockImplementation(async () => `${'F'.repeat(35)}:0`)
  vi.spyOn(SessionService.prototype, 'now').mockImplementation(() => new Date(clock))
  app = await NestFactory.create(AppModule, { logger: false }); configureApp(app, readAppConfig())
  await app.listen(0, '127.0.0.1'); address = await app.getUrl()
  await messages()
  evidence.isolatedDatabase = databaseName
}, 120000)
beforeEach(async () => {
  await app.get(AccountLifecycleService).flushMail()
  clock = new Date(baseTime)
  await db.auditEvent.deleteMany(); await db.loginRateBucket.deleteMany(); await db.userActionToken.deleteMany(); await db.userSession.deleteMany(); await db.user.deleteMany()
  const tag = randomBytes(5).toString('hex')
  a = await db.user.create({ data: { email: `${tag}-a@example.invalid`, emailNormalized: `${tag}-a@example.invalid`, passwordHash: fixtureHash, emailVerifiedAt: clock } })
  b = await db.user.create({ data: { email: `${tag}-b@example.invalid`, emailNormalized: `${tag}-b@example.invalid`, passwordHash: fixtureHash, emailVerifiedAt: clock } })
  pendingEmail = `${tag}-pending@example.invalid`
  previousMail = new Set((await messages()).map(row => row.ID))
})
afterAll(async () => {
  try {
    if (app) await app.close()
    vi.restoreAllMocks()
    if (db) await db.$disconnect()
    process.env.DATABASE_URL = originalUrl
    if (admin) {
      const after = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
      expect(after).toEqual(metadata)
      evidence.originalMetadataPreserved = true
      evidence.originalMetadataHash = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      if (created && /^atms_verify_lifecycle_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
        evidence.onlyCreatedDatabaseRemoved = true
      }
    }
  } finally {
    if (admin) await admin.$disconnect()
    mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

describe('F01 account lifecycle integration', () => {
  it('registers unverified without membership/session, confirms owner-selected password and logs in', async () => {
    const result = await post('register', { email: pendingEmail.toUpperCase(), password: oldPassword })
    expect(result.status).toBe(202); expect(result.data).toEqual({ accepted: true })
    expect(result.response.headers.get('set-cookie')).toBeNull(); expect(result.response.headers.get('cache-control')).toBe('no-store')
    const user = await db.user.findUniqueOrThrow({ where: { emailNormalized: pendingEmail } })
    expect(user.emailVerifiedAt).toBeNull(); expect(await db.companyMembership.count()).toBe(0); expect(await db.userSession.count()).toBe(0)
    expect((await post('login', { email: pendingEmail, password: oldPassword })).status).toBe(401)
    const mail = await captured(pendingEmail, 'ATMS 이메일 확인'), token = mail.token!
    expect(mail.text).toContain(`${origin}/verify-email#token=`)
    const stored = await db.userActionToken.findFirstOrThrow()
    expect(stored.tokenHash).toBe(actionHash(token)); expect(JSON.stringify(stored)).not.toContain(token)
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(AUTH_POLICY.verificationMs)
    const confirmed = await post('email-verification/confirm', { token, newPassword })
    expect(confirmed.status).toBe(200); expect(confirmed.response.headers.get('set-cookie')).toBeNull()
    expect((await post('login', { email: pendingEmail, password: oldPassword })).status).toBe(401)
    expect(await session(await login(pendingEmail, newPassword))).toBe(200)
    await captured(pendingEmail, 'ATMS 비밀번호 변경 알림')
    evidence.registrationOwnerConfirmationAndSmtp = true
  })
  it('does not overwrite existing password/verified/disabled state on duplicate registration', async () => {
    await db.user.update({ where: { id: a.id }, data: { disabledAt: clock } })
    for (const email of [a.email, b.email]) expect((await post('register', { email, password: newPassword })).status).toBe(202)
    expect((await db.user.findUniqueOrThrow({ where: { id: a.id } })).disabledAt).toEqual(clock)
    expect((await db.user.findUniqueOrThrow({ where: { id: b.id } })).passwordHash).toBe(fixtureHash)
    expect(await db.userActionToken.count()).toBe(0)
    evidence.duplicateAccountPreserved = true
  })
  it('can confirm a pre-registered address with the owner password after a resend', async () => {
    expect((await post('register', { email: pendingEmail, password: oldPassword })).status).toBe(202)
    const first = (await captured(pendingEmail, 'ATMS 이메일 확인')).token!
    const next = await issue(pendingEmail, 'email-verification')
    expect((await post('email-verification/confirm', { token: first, newPassword })).status).toBe(400)
    expect((await post('email-verification/confirm', { token: next, newPassword })).status).toBe(200)
    expect(await session(await login(pendingEmail, newPassword))).toBe(200)
  })
  it('returns identical accepted responses for missing, disabled, verified/unverified recovery targets', async () => {
    await db.user.update({ where: { id: a.id }, data: { disabledAt: clock } })
    await db.user.update({ where: { id: b.id }, data: { emailVerifiedAt: null } })
    const times: number[] = []
    for (const email of [pendingEmail, a.email, b.email]) {
      const start = performance.now(), result = await post('password-reset/request', { email })
      times.push(performance.now() - start)
      expect(result.status).toBe(202); expect(result.data).toEqual({ accepted: true })
      expect(result.response.headers.get('set-cookie')).toBeNull()
    }
    expect(times.every(value => value >= AUTH_POLICY.emailResponseMinMs - 10)).toBe(true)
    const start = performance.now(); expect((await post('email-verification/request', { email: b.email })).status).toBe(202)
    expect(performance.now() - start).toBeGreaterThanOrEqual(AUTH_POLICY.emailResponseMinMs - 10)
    evidence.genericResponseAndTimingFloor = true
  })
  it('resets through captured SMTP, revokes all devices, preserves another user and sends a completion notice', async () => {
    const first = await login(), second = await login(), other = await login(b.email)
    const token = await issue()
    const result = await post('password-reset/confirm', { token, newPassword })
    expect(result.status).toBe(200); expect(result.response.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970')
    expect(await session(first)).toBe(401); expect(await session(second)).toBe(401); expect(await session(other)).toBe(200)
    expect(await session(await login(a.email, newPassword))).toBe(200)
    expect((await post('password-reset/confirm', { token, newPassword })).status).toBe(400)
    await captured(a.email, 'ATMS 비밀번호 변경 알림')
    evidence.resetAllDevicesAndNotice = true
  })
  it.each(['EMAIL_VERIFICATION', 'PASSWORD_RESET'] as const)('expires %s exactly at its boundary', async purpose => {
    if (purpose === 'EMAIL_VERIFICATION') await db.user.update({ where: { id: a.id }, data: { emailVerifiedAt: null } })
    const kind = purpose === 'EMAIL_VERIFICATION' ? 'email-verification' : 'password-reset'
    const token = await issue(a.email, kind)
    clock = new Date(baseTime.getTime() + (purpose === 'EMAIL_VERIFICATION' ? AUTH_POLICY.verificationMs : AUTH_POLICY.resetMs))
    expect((await post(`${kind}/confirm`, { token, newPassword })).status).toBe(400)
    expect((await db.userActionToken.findFirstOrThrow()).usedAt).toBeNull()
    evidence.tokenExpiryBoundaries = true
  })
  it('accepts a token 1ms before expiry and rejects wrong-purpose, unknown and spent tokens', async () => {
    const token = await issue()
    expect((await post('email-verification/confirm', { token, newPassword })).status).toBe(400)
    expect((await post('password-reset/confirm', { token: 'a'.repeat(64), newPassword })).status).toBe(400)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.resetMs - 1)
    expect((await post('password-reset/confirm', { token, newPassword })).status).toBe(200)
    expect((await post('password-reset/confirm', { token, newPassword })).status).toBe(400)
  })
  it('invalidates resend tokens and permits only one simultaneous consumer', async () => {
    const first = await issue(), second = await issue()
    expect((await post('password-reset/confirm', { token: first, newPassword })).status).toBe(400)
    const results = await Promise.all([post('password-reset/confirm', { token: second, newPassword }), post('password-reset/confirm', { token: second, newPassword })])
    expect(results.map(row => row.status).sort()).toEqual([200, 400])
    expect(await db.auditEvent.count({ where: { type: 'PASSWORD_RESET' } })).toBe(1)
    evidence.oneTimeResendAndConcurrentConsume = true
  })
  it('uses one three-request account quota across signup, verification and recovery, including missing accounts', async () => {
    for (const kind of ['email-verification/request', 'password-reset/request', 'email-verification/request']) {
      expect((await post(kind, { email: pendingEmail })).status).toBe(202)
    }
    expect((await post('register', { email: pendingEmail, password: oldPassword })).status).toBe(429)
    expect(await db.user.count({ where: { emailNormalized: pendingEmail } })).toBe(0)
    await db.$disconnect(); await db.$connect()
    expect((await post('password-reset/request', { email: pendingEmail })).status).toBe(429)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.emailWindowMs)
    expect((await post('password-reset/request', { email: pendingEmail })).status).toBe(202)
    evidence.sharedAccountQuotaAndBoundary = true
  })
  it('allows twenty IP attempts and counts malformed requests before the input pipe', async () => {
    for (let index = 0; index < 20; index++) expect((await post('password-reset/request', { email: `bad-${index}` })).status).toBe(400)
    expect((await post('email-verification/request', { email: pendingEmail })).status).toBe(429)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.emailWindowMs)
    expect((await post('password-reset/request', { email: pendingEmail })).status).toBe(202)
    evidence.ipQuotaAndInvalidInput = true
  })
  it('reserves quotas atomically under simultaneous account/IP attempts and persists across service instances', async () => {
    const rate = new LoginRateLimitService(app.get(require('../dist/prisma.service.js').PrismaService))
    const account = await Promise.allSettled(Array.from({ length: 8 }, () => rate.reserveEmailAccount(pendingEmail, clock)))
    expect(account.filter(row => row.status === 'fulfilled')).toHaveLength(3)
    const ip = await Promise.allSettled(Array.from({ length: 25 }, () => rate.reserveEmailIp('test-ip', clock)))
    expect(ip.filter(row => row.status === 'fulfilled')).toHaveLength(20)
    await expect(rate.reserveEmailAccount(pendingEmail, clock)).rejects.toMatchObject({ status: 429 })
    evidence.concurrentPersistentQuotas = true
  })
  it('requires Origin, strict schema, authenticated CSRF and recent password confirmation', async () => {
    expect((await post('register', { email: pendingEmail, password: oldPassword }, undefined, { origin: 'https://evil.invalid' })).status).toBe(403)
    expect((await post('register', { email: pendingEmail, password: oldPassword, role: 'COMPANY_ADMIN' })).status).toBe(400)
    expect((await post('password/change', { newPassword })).status).toBe(401)
    const device = await login()
    expect((await post('password/change', { newPassword }, device)).status).toBe(403)
    expect((await post('reauthenticate', { password: oldPassword }, device)).status).toBe(200)
    expect((await post('password/change', { newPassword }, device, { 'x-csrf-token': 'bad' })).status).toBe(403)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs)
    expect((await post('password/change', { newPassword }, device)).status).toBe(403)
    clock = new Date(baseTime.getTime() + AUTH_POLICY.reauthMs - 1)
    expect((await post('password/change', { newPassword }, device)).status).toBe(200)
    expect(await session(device)).toBe(401)
    evidence.protectionAndReauthBoundary = true
  })
  it('rechecks current session after a slow password lookup and cannot revive a concurrently revoked session', async () => {
    const device = await login()
    await post('reauthenticate', { password: oldPassword }, device)
    const policy = app.get(PasswordPolicyService)
    const original = policy.hash.bind(policy)
    const spy = vi.spyOn(policy, 'hash').mockImplementation(async (password, email) => {
      await db.userSession.updateMany({ data: { revokedAt: clock } })
      return original(password, email)
    })
    try { expect((await post('password/change', { newPassword }, device)).status).toBe(403) }
    finally { spy.mockRestore() }
    expect((await db.user.findUniqueOrThrow({ where: { id: a.id } })).passwordHash).toBe(fixtureHash)
  })
  it('prevents an overlapping old-password login from leaving a valid session after reset', async () => {
    const token = await issue()
    const results = await Promise.all([post('login', { email: a.email, password: oldPassword }), post('password-reset/confirm', { token, newPassword })])
    expect(results[1].status).toBe(200)
    expect([200, 401]).toContain(results[0].status)
    if (results[0].status === 200) {
      const cookie = results[0].response.headers.get('set-cookie')!.split(';')[0]
      expect(await session({ cookie, csrf: results[0].data.csrfToken })).toBe(401)
    }
    expect(await db.userSession.count({ where: { userId: a.id, revokedAt: null } })).toBe(0)
    evidence.loginResetRace = true
  })
  it('fails closed before saving when password screening is unavailable or exposed', async () => {
    const policy = app.get(PasswordPolicyService)
    const spy = vi.spyOn(policy, 'hash').mockRejectedValue(new (require('@nestjs/common').ServiceUnavailableException)())
    try {
      expect((await post('register', { email: pendingEmail, password: oldPassword })).status).toBe(503)
      expect(await db.user.count({ where: { emailNormalized: pendingEmail } })).toBe(0)
    } finally { spy.mockRestore() }
    evidence.lookupFailureDoesNotSave = true
  })
  it('rolls back token/password/session changes when the success audit fails', async () => {
    const device = await login(), token = await issue()
    const audit = app.get(AuditService), original = audit.record.bind(audit)
    const spy = vi.spyOn(audit, 'record').mockImplementation((tx, event) => event.type === 'PASSWORD_RESET' ? Promise.reject(new Error('audit failed')) : original(tx, event))
    try { expect((await post('password-reset/confirm', { token, newPassword })).status).toBe(500) }
    finally { spy.mockRestore() }
    expect((await db.user.findUniqueOrThrow({ where: { id: a.id } })).passwordHash).toBe(fixtureHash)
    expect((await db.userActionToken.findUniqueOrThrow({ where: { tokenHash: actionHash(token) } })).usedAt).toBeNull()
    expect(await session(device)).toBe(200)
    evidence.auditAtomicRollback = true
  })
  it('keeps generic acceptance on SMTP failure, invalidates only that token and permits resend', async () => {
    const mail = app.get(MailService), spy = vi.spyOn(mail, 'send').mockResolvedValue(false)
    try {
      const result = await post('password-reset/request', { email: a.email })
      expect(result.status).toBe(202); expect(result.data).toEqual({ accepted: true })
      await app.get(AccountLifecycleService).flushMail()
      expect((await db.userActionToken.findFirstOrThrow()).invalidatedAt).toEqual(clock)
      expect(await db.auditEvent.count({ where: { type: 'MAIL_FAILED' } })).toBe(1)
    } finally { spy.mockRestore() }
    const token = await issue()
    expect((await post('password-reset/confirm', { token, newPassword })).status).toBe(200)
    evidence.mailFailureAndResend = true
  })
  it('does not undo committed credential/session changes when notification delivery fails', async () => {
    const device = await login(), token = await issue()
    const spy = vi.spyOn(app.get(MailService), 'send').mockResolvedValue(false)
    try {
      expect((await post('password-reset/confirm', { token, newPassword })).status).toBe(200)
      await app.get(AccountLifecycleService).flushMail()
    } finally { spy.mockRestore() }
    expect(await session(device)).toBe(401)
    expect(await session(await login(a.email, newPassword))).toBe(200)
  })
  it('recovers from a committed but undelivered token by issuing a replacement without raw token persistence', async () => {
    const token = await db.userActionToken.create({ data: { userId: a.id, purpose: 'PASSWORD_RESET', tokenHash: actionHash('d'.repeat(64)),
      createdAt: clock, expiresAt: new Date(clock.getTime() + AUTH_POLICY.resetMs) } })
    const next = await issue()
    expect((await db.userActionToken.findUniqueOrThrow({ where: { id: token.id } })).invalidatedAt).toEqual(clock)
    expect((await post('password-reset/confirm', { token: next, newPassword })).status).toBe(200)
    evidence.interruptedDeliveryReplacement = true
  })
  it('keeps GET read-only, rejects inactive targets and never includes credentials in audit details', async () => {
    const token = await issue()
    const get = await fetch(`${address}/api/auth/password-reset/confirm?token=${token}`)
    expect(get.status).toBe(404)
    expect((await db.userActionToken.findFirstOrThrow()).usedAt).toBeNull()
    await db.user.update({ where: { id: a.id }, data: { disabledAt: clock } })
    expect((await post('password-reset/confirm', { token, newPassword })).status).toBe(400)
    const logs = JSON.stringify(await db.auditEvent.findMany())
    for (const secret of [oldPassword, newPassword, token, a.email, fixtureHash]) expect(logs).not.toContain(secret)
    evidence.readOnlyGetAndSafeAudit = true
  })
  it('enforces token hash, purpose, time and terminal-state constraints in PostgreSQL', async () => {
    const base = { userId: a.id, purpose: 'PASSWORD_RESET', tokenHash: actionHash('c'.repeat(64)), createdAt: clock,
      expiresAt: new Date(clock.getTime() + AUTH_POLICY.resetMs) }
    for (const data of [{ ...base, purpose: 'OTHER' }, { ...base, tokenHash: 'x'.repeat(64) }, { ...base, expiresAt: clock },
      { ...base, usedAt: clock, invalidatedAt: clock }]) await expect(db.userActionToken.create({ data })).rejects.toThrow()
    expect(await db.userActionToken.count()).toBe(0)
    evidence.databaseConstraints = true
  })
})
