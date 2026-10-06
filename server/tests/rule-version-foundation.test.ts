import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { config as loadEnv } from 'dotenv'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { RulesService } = require('../dist/rules/rules.service.js') as typeof import('../src/rules/rules.service')
const { AUTH_POLICY, readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const argon2 = require('argon2') as typeof import('argon2')

const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f13-rule-foundation')
const origin = 'http://127.0.0.1:4173'
const password = 'isolated F13 rule test passphrase '
const baseTime = new Date('2026-10-06T00:00:00Z')
const companyA = 'a1000000-0000-4000-8000-000000000001'
const companyB = 'a1000000-0000-4000-8000-000000000002'
const companyEmpty = 'a1000000-0000-4000-8000-000000000003'
const ruleSetId = 'b1000000-0000-4000-8000-000000000001'
const ruleVersionId = 'b1000000-0000-4000-8000-000000000002'
const pastApplicationId = 'c1000000-0000-4000-8000-000000000001'
const currentApplicationId = 'c1000000-0000-4000-8000-000000000002'
const foreignApplicationId = 'c1000000-0000-4000-8000-000000000003'

let app: INestApplication
let db: InstanceType<typeof PrismaClient>, admin: InstanceType<typeof PrismaClient>
let originalUrl: string, databaseName: string, address: string, metadata: unknown
let created = false
let userA: { id: string; email: string }, userB: { id: string; email: string }
let membershipA: { id: string }, membershipB: { id: string }, membershipEmpty: { id: string }
const evidence: Record<string, unknown> = {}
type Login = { cookie: string; csrf: string }

async function request(path: string, options: { method?: string; login?: Login; body?: unknown } = {}) {
  const method = options.method ?? 'GET', headers: Record<string, string> = {}
  if (method !== 'GET') { headers['content-type'] = 'application/json'; headers.origin = origin }
  if (options.login) { headers.cookie = options.login.cookie; headers['x-csrf-token'] = options.login.csrf }
  const response = await fetch(`${address}${path}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}) })
  return { response, status: response.status, data: await response.json() }
}
async function login(user = userA): Promise<Login> {
  const result = await request('/api/auth/login', { method: 'POST', body: { email: user.email, password } })
  expect(result.status).toBe(200)
  return { cookie: result.response.headers.get('set-cookie')!.split(';')[0], csrf: result.data.csrfToken }
}
const path = (id = companyA, query = '') => `/api/companies/${id}/rule-applications${query}`

// [F13 통합 검증] 기본 DB는 메타데이터 읽기/난수 DB 생성에만 쓰고 모든 규칙 자료는 전용 DB에 만든다.
beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms') throw new Error('Expected isolated local database setup')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) })
  metadata = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
  databaseName = `atms_verify_rules_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_rules_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification database')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true
  url.pathname = `/${databaseName}`; process.env.DATABASE_URL = url.toString(); process.env.AUTH_WEB_ORIGIN = origin
  try { execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: server, env: process.env, stdio: 'pipe', timeout: 30000 }) }
  catch { throw new Error('Isolated rule migration failed') }
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }) })
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB,
    timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  userA = await db.user.create({ data: { email: 'rule-a@example.invalid', emailNormalized: 'rule-a@example.invalid', passwordHash: hash, emailVerifiedAt: baseTime } })
  userB = await db.user.create({ data: { email: 'rule-b@example.invalid', emailNormalized: 'rule-b@example.invalid', passwordHash: hash, emailVerifiedAt: baseTime } })
  await db.company.createMany({ data: [{ id: companyA, name: 'Rule company A' }, { id: companyB, name: 'Rule company B' }, { id: companyEmpty, name: 'Rule company empty' }] })
  membershipA = await db.companyMembership.create({ data: { companyId: companyA, userId: userA.id } })
  membershipB = await db.companyMembership.create({ data: { companyId: companyB, userId: userB.id } })
  membershipEmpty = await db.companyMembership.create({ data: { companyId: companyEmpty, userId: userA.id } })
  await db.companyMemberRole.createMany({ data: [
    { companyId: companyA, membershipId: membershipA.id, role: 'READ_ONLY' },
    { companyId: companyB, membershipId: membershipB.id, role: 'READ_ONLY' },
    { companyId: companyEmpty, membershipId: membershipEmpty.id, role: 'READ_ONLY' },
  ] })
  await db.ruleSet.create({ data: { id: ruleSetId, domain: 'ACCOUNTING', jurisdiction: 'KR', code: 'TEST_K_GAAP', name: '격리 검증 회계 규칙' } })
  await db.ruleVersion.create({ data: { id: ruleVersionId, ruleSetId, version: 'test-2026.1',
    officialSourceTitle: '격리 검증 공식 근거', officialSourceUrl: 'https://example.invalid/test-source', legalProvision: 'TEST-1',
    promulgatedOn: new Date('2025-12-01'), effectiveFrom: new Date('2026-01-01'), applicableFrom: new Date('2025-01-01'), applicableTo: new Date('2026-12-31'),
    companyConditions: { fixture: true }, transitionalProvisions: { fixture: true } } })
  await db.ruleArtifactVersion.createMany({ data: ['CONFIG', 'CALCULATION', 'ACCOUNT_MAPPING', 'FORM'].map((kind, index) => ({
    id: `d1000000-0000-4000-8000-00000000000${index + 1}`, ruleVersionId, kind: kind as 'CONFIG', version: 'test-1',
    repositoryLocator: `repo://rules/test/${kind.toLowerCase()}@test-1`, contentSha256: String(index + 1).repeat(64), metadata: { fixture: true },
  })) })
  await db.companyRuleApplication.createMany({ data: [
    { id: pastApplicationId, companyId: companyA, ruleSetId, ruleVersionId, effectiveFrom: new Date('2025-01-01'), effectiveTo: new Date('2025-12-31') },
    { id: currentApplicationId, companyId: companyA, ruleSetId, ruleVersionId, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-12-31') },
    { id: foreignApplicationId, companyId: companyB, ruleSetId, ruleVersionId, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-12-31') },
  ] })
  app = await NestFactory.create(AppModule, { logger: false }); configureApp(app, readAppConfig())
  await app.listen(0, '127.0.0.1'); address = await app.getUrl(); evidence.isolatedDatabase = databaseName
}, 120000)

beforeEach(async () => {
  vi.restoreAllMocks()
  await db.auditEvent.deleteMany(); await db.loginRateBucket.deleteMany(); await db.userSession.deleteMany()
  await db.companyMembership.updateMany({ where: { id: { in: [membershipA.id, membershipB.id, membershipEmpty.id] } }, data: { active: true } })
})

afterAll(async () => {
  vi.restoreAllMocks()
  try {
    if (app) await app.close(); if (db) await db.$disconnect(); process.env.DATABASE_URL = originalUrl
    if (admin) {
      const after = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } }); expect(after).toEqual(metadata)
      evidence.originalMetadataHash = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      if (created && /^atms_verify_rules_[a-f0-9]{16}$/.test(databaseName)) { await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); evidence.onlyCreatedDatabaseRemoved = true }
    }
  } finally {
    if (admin) await admin.$disconnect(); mkdirSync(proof, { recursive: true })
    writeFileSync(resolve(proof, 'http-database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

describe('F13 rule version foundation integration', () => {
  it('returns the company rule effective on asOf with fixed source and artifact fields without extending GET activity', async () => {
    const session = await login(), before = await db.userSession.findMany({ orderBy: { id: 'asc' } })
    const result = await request(path(companyA, '?asOf=2026-06-30'), { login: session })
    expect(result.status).toBe(200); expect(result.data.items).toHaveLength(1)
    expect(result.data.items[0]).toMatchObject({ id: currentApplicationId, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
      rule: { id: ruleSetId, domain: 'ACCOUNTING', jurisdiction: 'KR', code: 'TEST_K_GAAP' },
      version: { id: ruleVersionId, version: 'test-2026.1', applicableFrom: '2025-01-01', applicableTo: '2026-12-31' } })
    expect(result.data.items[0].version.artifacts).toHaveLength(4)
    expect(result.data.items[0].version.artifacts.every((item: any) => /^[0-9a-f]{64}$/.test(item.contentSha256))).toBe(true)
    expect(JSON.stringify(result.data)).not.toMatch(/password|token|executable|sourceCode/)
    expect(result.response.headers.get('cache-control')).toBe('no-store'); expect(result.response.headers.get('set-cookie')).toBeNull()
    expect(await db.userSession.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
    evidence.currentVersionReadBoundary = true
  })
  it('filters historical dates and paginates only cursors inside the same company scope', async () => {
    const session = await login()
    expect((await request(path(companyA, '?asOf=2025-06-30'), { login: session })).data.items[0].id).toBe(pastApplicationId)
    const first = await request(path(companyA, '?limit=1'), { login: session })
    expect(first.data.items.map((item: any) => item.id)).toEqual([pastApplicationId]); expect(first.data.nextCursor).toBe(pastApplicationId)
    const second = await request(path(companyA, `?limit=1&cursor=${first.data.nextCursor}`), { login: session })
    expect(second.data.items.map((item: any) => item.id)).toEqual([currentApplicationId]); expect(second.data.nextCursor).toBeNull()
    expect((await request(path(companyA, `?cursor=${foreignApplicationId}`), { login: session })).status).toBe(400)
    evidence.periodAndCursorScope = true
  })
  it('requires authentication and current company membership without exposing foreign applications', async () => {
    expect((await request(path())).status).toBe(401)
    const session = await login()
    expect((await request(path(companyB), { login: session })).status).toBe(403)
    await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
    expect((await request(path(companyA), { login: session })).status).toBe(403)
    evidence.authenticationAndCompanyIsolation = true
  })
  it('returns an empty list instead of inventing a default rule for a company without applications', async () => {
    const result = await request(path(companyEmpty, '?asOf=2026-06-30'), { login: await login() })
    expect(result.status).toBe(200); expect(result.data).toEqual({ items: [], nextCursor: null })
    evidence.noImplicitRuleDefault = true
  })
  it('rechecks active membership inside the service query after the guard has allowed the request', async () => {
    const session = await login(), service = app.get(RulesService), original = service.list.bind(service)
    vi.spyOn(service, 'list').mockImplementationOnce(async (...args: Parameters<typeof original>) => {
      await db.companyMembership.update({ where: { id: membershipA.id }, data: { active: false } })
      return original(...args)
    })
    const result = await request(path(companyA), { login: session })
    expect(result.status).toBe(200); expect(result.data).toEqual({ items: [], nextCursor: null })
    evidence.postGuardScopeRecheck = true
  })
})
