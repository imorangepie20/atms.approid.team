import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { PrismaPg } from '@prisma/adapter-pg'
import { NestFactory } from '@nestjs/core'
import { ServiceUnavailableException, UnprocessableEntityException, type INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { SessionService, csrfFor } = require('../dist/auth/session.service.js') as typeof import('../src/auth/session.service')
const { AuditService } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
const { EvidenceService } = require('../dist/evidence/evidence.service.js') as typeof import('../src/evidence/evidence.service')
const { EvidenceStorageService } = require('../dist/evidence/evidence-storage.service.js') as typeof import('../src/evidence/evidence-storage.service')
const { EvidenceScannerService } = require('../dist/evidence/evidence-scanner.service.js') as typeof import('../src/evidence/evidence-scanner.service')
const { EvidenceCleanupService } = require('../dist/evidence/evidence-cleanup.service.js') as typeof import('../src/evidence/evidence-cleanup.service')
const { EVIDENCE_CONFIG: limits, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const server = fileURLToPath(new URL('../', import.meta.url)), proof = resolve(server, '../.artifacts/implementation-f03-evidence')
loadEnv({ path: resolve(server, '.env'), quiet: true })
const realR2Configured = new EvidenceStorageService().configured()
const origin = 'http://127.0.0.1:4173', pdf = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n')
let app: INestApplication, db: InstanceType<typeof PrismaClient>, admin: InstanceType<typeof PrismaClient>, originalUrl: string, databaseName: string, address: string
let clock = new Date(), snapshot: unknown, created = false
let companyA: { id: string }, companyB: { id: string }, userA: { id: string; email: string }, userB: { id: string; email: string }, member: { id: string }
let session: { cookie: string; csrf: string; raw: string }, otherSession: typeof session
const objects = new Map<string, Buffer>(), report: Record<string, unknown> = {}
async function snapshotBase() {
  const tables = await admin.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
  const result: Record<string, unknown> = {}
  for (const { tablename } of tables) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('Invalid known table')
    result[tablename] = await admin.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${tablename}" t`)
  }
  return result
}
async function newSession(user = userA) {
  const issued = await db.$transaction(tx => app.get(SessionService).create(tx, user, clock))
  return { cookie: `atms_dev_session=${issued.rawToken}`, raw: issued.rawToken, csrf: csrfFor(issued.rawToken) }
}
const path = (suffix = '', company = companyA.id) => `/api/companies/${company}/evidence${suffix}`
const input = (extra: Record<string, unknown> = {}) => ({ creationRequestId: randomUUID(), kind: 'RECEIPT', title: 'Receipt', ...extra })
async function request(url: string, options: { method?: string; body?: BodyInit; login?: typeof session | null; origin?: string; csrf?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = {}, method = options.method ?? 'GET', login = options.login === undefined ? session : options.login
  if (login) { headers.cookie = login.cookie; headers['x-csrf-token'] = options.csrf ?? login.csrf }
  if (method !== 'GET') headers.origin = options.origin ?? origin
  if (options.json) headers['content-type'] = 'application/json'
  const response = await fetch(address + url, { method, headers, body: options.json ? JSON.stringify(options.json) : options.body })
  const bytes = Buffer.from(await response.arrayBuffer()), contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json') ? JSON.parse(bytes.toString()) : undefined
  return { status: response.status, response, data, bytes }
}
function post(metadata = input(), options: Parameters<typeof request>[1] = {}, file = pdf) {
  const body = new FormData(); body.append('metadata', JSON.stringify(metadata)); body.append('file', new Blob([new Uint8Array(file)], { type: 'application/pdf' }), 'receipt.pdf')
  return request(path(), { method: 'POST', body, ...options })
}
async function roles(role: 'COMPANY_ADMIN' | 'ACCOUNTANT' | 'APPROVER' | 'READ_ONLY' | 'EXTERNAL_TAX') {
  await db.companyMemberRole.deleteMany({ where: { membershipId: member.id } }); await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: member.id, role } })
}
async function party(company = companyA.id) { return db.counterparty.create({ data: { companyId: company, name: 'Linked party', kind: 'BOTH', creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64) } }) }
async function reserved(state: 'PENDING' | 'FAILED' | 'READY' | 'CLEANING' | 'EXPIRED', age = limits.expiryMs, active = false) {
  const id = randomUUID(), attemptId = randomUUID(), now = clock.getTime(), attempt = { id: attemptId, tmp: `tmp/${companyA.id}/${id}/${attemptId}`, original: `originals/${companyA.id}/${id}/${attemptId}` }
  objects.set(attempt.tmp, pdf); objects.set(attempt.original, pdf)
  return db.evidenceUpload.create({ data: { id, companyId: companyA.id, creationRequestId: randomUUID(), ownerId: userA.id, inputHash: 'a'.repeat(64), attemptId,
    attempts: [attempt], state, lastActivityAt: new Date(now - age), leaseExpiresAt: new Date(now + (active ? limits.leaseMs : -1)) } })
}
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true }); originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Local isolated database required')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) }); snapshot = await snapshotBase()
  databaseName = `atms_verify_evidence_${randomBytes(8).toString('hex')}`
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true; url.pathname = `/${databaseName}`
  process.env.DATABASE_URL = url.toString(); process.env.AUTH_WEB_ORIGIN = origin
  try { execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env: process.env, stdio: 'pipe', timeout: 30000 }) }
  catch { throw new Error('Isolated evidence migration failed') }
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }) })
  const passwordHash = await require('argon2').hash('isolated evidence test passphrase')
  userA = await db.user.create({ data: { email: 'evidence-a@example.invalid', emailNormalized: 'evidence-a@example.invalid', emailVerifiedAt: clock, passwordHash } })
  userB = await db.user.create({ data: { email: 'evidence-b@example.invalid', emailNormalized: 'evidence-b@example.invalid', emailVerifiedAt: clock, passwordHash } })
  companyA = await db.company.create({ data: { name: 'Evidence company A' } }); companyB = await db.company.create({ data: { name: 'Evidence company B' } })
  member = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userA.id } })
  const otherMember = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userB.id } })
  await db.companyMemberRole.create({ data: { companyId: companyB.id, membershipId: otherMember.id, role: 'COMPANY_ADMIN' } })
  app = await NestFactory.create(AppModule, { logger: false }); configureApp(app, readAppConfig()); await app.listen(0, '127.0.0.1'); address = await app.getUrl()
  report.database = databaseName
}, 120000)
beforeEach(async () => {
  vi.restoreAllMocks(); clock = new Date(); await roles('COMPANY_ADMIN')
  vi.spyOn(SessionService.prototype, 'now').mockImplementation(() => new Date(clock))
  vi.spyOn(EvidenceService.prototype, 'now').mockImplementation(() => new Date(clock))
  vi.spyOn(EvidenceCleanupService.prototype, 'now').mockImplementation(() => new Date(clock))
  vi.spyOn(EvidenceStorageService.prototype, 'configured').mockReturnValue(true)
  vi.spyOn(EvidenceStorageService.prototype, 'put').mockImplementation(async (key, bytes) => { objects.set(key, bytes) })
  vi.spyOn(EvidenceStorageService.prototype, 'copy').mockImplementation(async (source, target) => { objects.set(target, objects.get(source)!) })
  vi.spyOn(EvidenceStorageService.prototype, 'verify').mockImplementation(async key => { if (!objects.has(key)) throw new ServiceUnavailableException() })
  vi.spyOn(EvidenceStorageService.prototype, 'read').mockImplementation(async key => { if (!objects.has(key)) throw new ServiceUnavailableException(); return objects.get(key)! })
  vi.spyOn(EvidenceStorageService.prototype, 'remove').mockImplementation(async key => { objects.delete(key) })
  vi.spyOn(EvidenceScannerService.prototype, 'scan').mockResolvedValue()
  session = await newSession(); otherSession = await newSession(userB)
})
afterAll(async () => {
  vi.restoreAllMocks()
  try {
    if (app) await app.close(); if (db) await db.$disconnect(); process.env.DATABASE_URL = originalUrl
    if (admin) {
      const after = await snapshotBase(); expect(after).toEqual(snapshot); report.baseBefore = snapshot; report.baseAfter = after; report.baseUnchanged = true
      if (created && /^atms_verify_evidence_[a-f0-9]{16}$/.test(databaseName)) { await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); report.onlyCreatedDatabaseRemoved = true }
    }
  } finally { if (admin) await admin.$disconnect(); mkdirSync(proof, { recursive: true }); writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(report, null, 2)) }
}, 30000)
describe('F03 real HTTP and isolated database', () => {
  it.skipIf(!realR2Configured)('V7 registers and downloads through the real API using actual private R2 and actual ClamAV', async () => {
    for (const method of ['configured', 'put', 'copy', 'verify', 'read', 'remove'] as const) vi.mocked(EvidenceStorageService.prototype[method]).mockRestore()
    vi.mocked(EvidenceScannerService.prototype.scan).mockRestore()
    const metadata = input(), result = await post(metadata)
    const upload = await db.evidenceUpload.findUniqueOrThrow({ where: { companyId_creationRequestId: { companyId: companyA.id, creationRequestId: metadata.creationRequestId } } })
    const attempts = upload.attempts as { tmp: string; original: string }[]
    try {
      expect(result.status).toBe(201)
      const downloaded = await request(path('/' + result.data.evidence.id + '/original')); expect(downloaded.status).toBe(200); expect(downloaded.bytes).toEqual(pdf)
      expect((await post(metadata)).status).toBe(200); report.actualR2ApiVerified = true
    } finally {
      for (const attempt of attempts) { await app.get(EvidenceStorageService).remove(attempt.tmp); await app.get(EvidenceStorageService).remove(attempt.original) }
      report.ownedActualR2ApiFixturesRemoved = true
    }
  }, 240000)
  it('V1 registers metadata and one original without reauthentication', async () => {
    const cp = await party(), result = await post(input({ counterpartyId: cp.id, occurredOn: '2024-02-29', title: ' Receipt ' }))
    expect(result.status).toBe(201); expect(result.data.created).toBe(true); expect(result.data.evidence.title).toBe('Receipt')
    expect(Object.keys(result.data.evidence)).toHaveLength(11); expect(result.data.evidence.counterpartyId).toBe(cp.id)
    expect(result.response.headers.get('cache-control')).toBe('no-store'); expect(result.response.headers.get('set-cookie')).toBeNull()
  })
  it.each(['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX', 'APPROVER', 'READ_ONLY'] as const)('V2 preserves %s read/create grants', async role => {
    await roles(role); const registered = await post()
    expect(registered.status).toBe(['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role) ? 201 : 403)
    expect((await request(path())).status).toBe(200)
  })
  it.each(['session', 'origin', 'csrf', 'company'])('V2 rejects %s before reading/uploading a file', async invalid => {
    const result = await post(input(), invalid === 'session' ? { login: null } : invalid === 'origin' ? { origin: 'http://evil.invalid' } : invalid === 'csrf' ? { csrf: 'bad' } : { login: otherSession })
    expect(result.status).toBe(invalid === 'session' ? 401 : 403)
    expect(EvidenceStorageService.prototype.put).not.toHaveBeenCalled()
  })
  it('V2 preserves read-only behavior of session activity and other sessions', async () => {
    const before = await db.userSession.findMany({ where: { userId: userA.id }, orderBy: { id: 'asc' } })
    clock = new Date(clock.getTime() + 1000); expect((await request(path())).status).toBe(200)
    expect(await db.userSession.findMany({ where: { userId: userA.id }, orderBy: { id: 'asc' } })).toEqual(before)
    const result = await post(); expect(result.status).toBe(201); expect((await request(path('', companyB.id), { login: otherSession })).status).toBe(200)
  })
  it.each(['role', 'session', 'counterparty'])('V2 rechecks %s after external I/O', async revoked => {
    const cp = await party()
    vi.mocked(EvidenceStorageService.prototype.verify).mockImplementationOnce(async () => {
      if (revoked === 'role') await roles('READ_ONLY')
      if (revoked === 'session') await db.userSession.updateMany({ where: { userId: userA.id }, data: { revokedAt: clock } })
      if (revoked === 'counterparty') await db.counterparty.update({ where: { id: cp.id }, data: { active: false } })
    })
    const metadata = input({ counterpartyId: cp.id }), result = await post(metadata)
    expect(result.status).toBe(revoked === 'role' ? 403 : revoked === 'session' ? 401 : 422)
    expect((await db.evidenceUpload.findUniqueOrThrow({ where: { companyId_creationRequestId: { companyId: companyA.id, creationRequestId: metadata.creationRequestId } } })).state).toBe('FAILED')
  })
  it.each(['infected', 'unavailable'])('V3 rejects %s scanner result without storing/committing', async reason => {
    vi.mocked(EvidenceScannerService.prototype.scan).mockRejectedValueOnce(reason === 'infected' ? new UnprocessableEntityException() : new ServiceUnavailableException())
    const metadata = input(); const result = await post(metadata); expect(result.status).toBe(reason === 'infected' ? 422 : 503)
    expect(EvidenceStorageService.prototype.put).not.toHaveBeenCalled()
    expect((await db.evidenceUpload.findUniqueOrThrow({ where: { companyId_creationRequestId: { companyId: companyA.id, creationRequestId: metadata.creationRequestId } } })).state).toBe('FAILED')
  })
  it('V4 replays same completed ID without duplicate evidence or audit; conflicts on changed body', async () => {
    const metadata = input(), first = await post(metadata), second = await post(metadata)
    expect(first.status).toBe(201); expect(second.status).toBe(200); expect(second.data.created).toBe(false)
    expect(second.data.evidence.id).toBe(first.data.evidence.id); expect((await post({ ...metadata, title: 'changed' })).status).toBe(409)
    expect(await db.auditEvent.count({ where: { type: 'EVIDENCE_REGISTERED', details: { path: ['evidenceId'], equals: first.data.evidence.id } } })).toBe(1)
    expect(EvidenceStorageService.prototype.put).toHaveBeenCalledTimes(1)
  })
  it('V4 returns progress without automatically resubmitting a concurrent request', async () => {
    let release!: () => void, entered!: () => void
    const waiting = new Promise<void>(resolve => { entered = resolve }), blocked = new Promise<void>(resolve => { release = resolve })
    vi.mocked(EvidenceScannerService.prototype.scan).mockImplementationOnce(async () => { entered(); await blocked })
    const metadata = input(), first = post(metadata); await waiting
    try {
      expect((await post(metadata)).status).toBe(409)
      const status = await request(path('/requests/' + metadata.creationRequestId)); expect(status.status).toBe(200); expect(status.data.state).toBe('PENDING'); expect(status.data.evidenceId).toBeNull()
    } finally { release() }
    expect((await first).status).toBe(201)
  })
  it('V4 retries FAILED only with identical content and rejects expired ID reuse', async () => {
    const metadata = input(); vi.mocked(EvidenceStorageService.prototype.put).mockRejectedValueOnce(new ServiceUnavailableException())
    expect((await post(metadata)).status).toBe(503); expect((await request(path('/requests/' + metadata.creationRequestId))).data.retryable).toBe(true)
    expect((await post({ ...metadata, title: 'changed' })).status).toBe(409); expect((await post(metadata)).status).toBe(201)
    const expired = input(); vi.mocked(EvidenceStorageService.prototype.put).mockRejectedValueOnce(new ServiceUnavailableException())
    expect((await post(expired)).status).toBe(503)
    const row = await db.evidenceUpload.findUniqueOrThrow({ where: { companyId_creationRequestId: { companyId: companyA.id, creationRequestId: expired.creationRequestId } } })
    await db.evidenceUpload.update({ where: { id: row.id }, data: { state: 'EXPIRED' } }); expect((await post(expired)).status).toBe(409)
  })
  it('V4 hides other owners request state and preserves inactive historical counterparty on replay', async () => {
    const cp = await party(), metadata = input({ counterpartyId: cp.id }), result = await post(metadata)
    await db.counterparty.update({ where: { id: cp.id }, data: { active: false } })
    expect((await post(metadata)).status).toBe(200); expect((await request(path('/' + result.data.evidence.id))).data.evidence.counterpartyId).toBe(cp.id)
    const second = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userB.id } })
    await db.companyMemberRole.create({ data: { companyId: companyA.id, membershipId: second.id, role: 'ACCOUNTANT' } })
    expect((await request(path('/requests/' + metadata.creationRequestId), { login: otherSession })).status).toBe(404)
    expect((await post(metadata, { login: otherSession })).status).toBe(409)
  })
  it.each(['put', 'copy', 'verify', 'audit'])('V5 preserves tracked unfinished keys on %s failure', async phase => {
    if (phase === 'audit') vi.spyOn(AuditService.prototype, 'record').mockImplementationOnce(async () => { throw new Error('private failure') })
    else vi.mocked(EvidenceStorageService.prototype[phase as 'put' | 'copy' | 'verify']).mockRejectedValueOnce(new ServiceUnavailableException())
    const metadata = input(), result = await post(metadata); expect(result.status).toBe(503); expect(JSON.stringify(result.data)).not.toContain('private')
    const row = await db.evidenceUpload.findUniqueOrThrow({ where: { companyId_creationRequestId: { companyId: companyA.id, creationRequestId: metadata.creationRequestId } }, include: { evidence: true } })
    expect(row.state).toBe('FAILED'); expect(row.evidence).toBeNull(); expect(row.attempts).toHaveLength(1)
  })
  it('V5 keeps active/recent uploads, expires old ones, and reconciles late writes', async () => {
    const active = await reserved('PENDING', limits.expiryMs, true), recent = await reserved('FAILED', limits.expiryMs - 1), old = await reserved('FAILED')
    const cleaner = app.get(EvidenceCleanupService); await cleaner.tick()
    expect((await db.evidenceUpload.findUniqueOrThrow({ where: { id: active.id } })).state).toBe('PENDING')
    expect((await db.evidenceUpload.findUniqueOrThrow({ where: { id: recent.id } })).state).toBe('FAILED')
    expect((await db.evidenceUpload.findUniqueOrThrow({ where: { id: old.id } })).state).toBe('EXPIRED')
    const attempt = (old.attempts as { original: string }[])[0]; objects.set(attempt.original, pdf)
    await cleaner.tick(); expect(objects.has(attempt.original)).toBe(false)
  })
  it('V5 preserves tracking on deletion failure and never deletes completed originals under competing cleaners', async () => {
    // [F03 시험 준비 수리] 이전 예약의 처리 순서에 의존하지 않고 이 예약에만 한 번 실패를 주입한다.
    const old = await reserved('FAILED'); let injected = false
    vi.mocked(EvidenceStorageService.prototype.remove).mockImplementation(async key => {
      if (!injected && key.split('/')[2] === old.id) { injected = true; throw new ServiceUnavailableException() }
      objects.delete(key)
    })
    await app.get(EvidenceCleanupService).tick(); const failed = await db.evidenceUpload.findUniqueOrThrow({ where: { id: old.id } })
    expect(failed.state).toBe('CLEANING'); expect(failed.attempts).toEqual(old.attempts)
    const result = await post(), row = await db.evidence.findUniqueOrThrow({ where: { id: result.data.evidence.id } })
    clock = new Date(clock.getTime() + limits.expiryMs + limits.leaseMs)
    await Promise.all([app.get(EvidenceCleanupService).tick(), new EvidenceCleanupService(db as never, app.get(EvidenceStorageService)).tick()])
    expect(objects.has(row.originalKey)).toBe(true); expect((await db.evidenceUpload.findUniqueOrThrow({ where: { id: old.id } })).state).toBe('EXPIRED')
  })
  it('V6 returns safe list/detail/original fields and keeps other companies and cursors separate', async () => {
    const metadata = input({ title: 'Unique downloadable original' }), result = await post(metadata), id = result.data.evidence.id
    const list = await request(path('?q=Unique%20downloadable&limit=1')); expect(list.data.items.map((row: any) => row.id)).toContain(id)
    // [F03 상세 계약 회귀] 실제 HTTP가 승인된 바깥 객체와 공개 11필드만 반환하는지 확인한다.
    const detail = await request(path('/' + id)); expect(detail.status).toBe(200)
    expect(Object.keys(detail.data)).toEqual(['evidence'])
    expect(Object.keys(detail.data.evidence).sort()).toEqual(['id', 'companyId', 'kind', 'title', 'occurredOn', 'counterpartyId',
      'originalFileName', 'mediaType', 'byteSize', 'createdById', 'createdAt'].sort())
    expect(detail.data.evidence).toEqual(result.data.evidence)
    expect(detail.response.headers.get('cache-control')).toBe('no-store')
    const download = await request(path('/' + id + '/original')); expect(download.status).toBe(200); expect(download.bytes).toEqual(pdf)
    expect(download.response.headers.get('content-disposition')).toContain('attachment'); expect(download.response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(download.response.headers.get('cache-control')).toBe('no-store'); expect((await request(path('/' + id, companyB.id), { login: otherSession })).status).toBe(404)
    expect((await request(path('?cursor=' + id + '&q=nonmatching'))).status).toBe(400)
    expect(JSON.stringify(list.data)).not.toMatch(/originalKey|sha256|inputHash|cloudflarestorage/)
    const audit = await db.auditEvent.findFirstOrThrow({ where: { type: 'EVIDENCE_REGISTERED', details: { path: ['evidenceId'], equals: id } } })
    expect(audit.details).toEqual({ evidenceId: id, kind: 'RECEIPT' })
  })
  it('V6 blocks download if permission changes during storage access', async () => {
    const result = await post()
    vi.mocked(EvidenceStorageService.prototype.read).mockImplementationOnce(async () => { await db.companyMembership.update({ where: { id: member.id }, data: { active: false } }); return pdf })
    expect((await request(path('/' + result.data.evidence.id + '/original'))).status).toBe(403)
    await db.companyMembership.update({ where: { id: member.id }, data: { active: true } })
  })
})
