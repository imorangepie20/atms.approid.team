import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { config as loadEnv } from 'dotenv'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { readAppConfig, AUTH_POLICY } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const { AuditService } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
const argon2 = require('argon2') as typeof import('argon2')

const server = fileURLToPath(new URL('../', import.meta.url)), origin = 'http://127.0.0.1:4173'
const password = 'isolated approval test passphrase', date = new Date('2026-10-07T00:00:00Z')
let originalUrl = '', databaseName = '', created = false, address = ''
let admin: InstanceType<typeof PrismaClient>, db: InstanceType<typeof PrismaClient>, app: INestApplication
let company: { id: string }, foreignCompany: { id: string }, year: { id: string }, writer: { id: string; email: string }, reviewer: { id: string; email: string }
let writerMembership: { id: string }, accountA: { id: string }, accountB: { id: string }, evidence: { id: string }
type Login = { cookie: string; csrf: string }
let writerLogin: Login, reviewerLogin: Login
const path = (suffix: string, companyId = company.id) => `/api/companies/${companyId}/journals${suffix}`
const action = (version: number) => ({ version, actionRequestId: randomUUID() })

async function snapshotBase() {
  const tables = await admin.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
  const out: Record<string, unknown> = {}
  for (const { tablename } of tables) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unknown base table')
    out[tablename] = await admin.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${tablename}" t`)
  }
  return out
}
let baseBefore: unknown
async function request(url: string, options: { method?: string; login?: Login; body?: unknown; csrf?: string } = {}) {
  const method = options.method ?? 'GET', headers: Record<string, string> = {}
  if (method !== 'GET') { headers.origin = origin; headers['content-type'] = 'application/json' }
  if (options.login) { headers.cookie = options.login.cookie; headers['x-csrf-token'] = options.csrf ?? options.login.csrf }
  const response = await fetch(address + url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}) })
  return { status: response.status, headers: response.headers, data: await response.json() as Record<string, any> }
}
async function login(email: string): Promise<Login> {
  const response = await request('/api/auth/login', { method: 'POST', body: { email, password } })
  expect(response.status).toBe(200)
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: response.data.csrfToken }
}
const draft = () => ({ creationRequestId: randomUUID(), fiscalYearId: year.id, accountingDate: '2026-10-07',
  memo: 'Workflow draft', counterpartyId: null, evidenceIds: [evidence.id],
  lines: [{ accountId: accountA.id, debit: '9007199254740993', credit: '0' },
    { accountId: accountB.id, debit: '0', credit: '9007199254740993' }] })
async function create() {
  const response = await request(path(''), { method: 'POST', login: writerLogin, body: draft() })
  expect(response.status).toBe(200)
  return response.data
}
async function run(id: string, kind: 'submit' | 'approve' | 'reject' | 'return-to-draft' | 'confirm', login: Login, body: unknown) {
  return request(path(`/${id}/${kind}`), { method: 'POST', login, body })
}

beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true }); originalUrl = process.env.DATABASE_URL ?? ''
  const url = new URL(originalUrl)
  if (!['127.0.0.1','localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/atms')
    throw new Error('Expected local isolated atms database source')
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl, max: 2 }) }); baseBefore = await snapshotBase()
  databaseName = `atms_verify_approval_${randomBytes(8).toString('hex')}`
  if (!/^atms_verify_approval_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Unsafe isolated DB name')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true
  url.pathname = '/' + databaseName; process.env.DATABASE_URL = url.toString(); process.env.AUTH_WEB_ORIGIN = origin
  execFileSync(process.execPath, [resolve(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: server, env: process.env, stdio: 'pipe', timeout: 60000 })
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }) })
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: AUTH_POLICY.argonMemoryKiB,
    timeCost: AUTH_POLICY.argonIterations, parallelism: AUTH_POLICY.argonParallelism })
  writer = await db.user.create({ data: { email: 'workflow-a@example.invalid', emailNormalized: 'workflow-a@example.invalid', passwordHash: hash,
    emailVerifiedAt: date } })
  reviewer = await db.user.create({ data: { email: 'workflow-b@example.invalid', emailNormalized: 'workflow-b@example.invalid', passwordHash: hash,
    emailVerifiedAt: date } })
  company = await db.company.create({ data: { name: 'Isolated workflow company' } })
  foreignCompany = await db.company.create({ data: { name: 'Isolated foreign company' } })
  year = await db.fiscalYear.create({ data: { companyId: company.id, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } })
  writerMembership = await db.companyMembership.create({ data: { companyId: company.id, userId: writer.id } })
  const reviewerMembership = await db.companyMembership.create({ data: { companyId: company.id, userId: reviewer.id } })
  const foreignMembership = await db.companyMembership.create({ data: { companyId: foreignCompany.id, userId: reviewer.id } })
  await db.companyMemberRole.createMany({ data: [
    { companyId: company.id, membershipId: writerMembership.id, role: 'COMPANY_ADMIN' },
    { companyId: company.id, membershipId: reviewerMembership.id, role: 'APPROVER' },
    { companyId: foreignCompany.id, membershipId: foreignMembership.id, role: 'COMPANY_ADMIN' },
  ] })
  accountA = await db.companyAccount.create({ data: { companyId: company.id, code: 'DR', name: 'Debit', category: 'ASSET', normalBalance: 'DEBIT' } })
  accountB = await db.companyAccount.create({ data: { companyId: company.id, code: 'CR', name: 'Credit', category: 'LIABILITY', normalBalance: 'CREDIT' } })
  const attempt = randomUUID(), upload = await db.evidenceUpload.create({ data: { companyId: company.id, ownerId: writer.id,
    creationRequestId: randomUUID(), inputHash: 'a'.repeat(64), attemptId: attempt, state: 'READY', leaseExpiresAt: new Date('2026-10-08') } })
  evidence = await db.evidence.create({ data: { companyId: company.id, uploadId: upload.id, kind: 'RECEIPT', title: 'Workflow evidence',
    originalFileName: 'evidence.pdf', mediaType: 'application/pdf', byteSize: 20, sha256: 'b'.repeat(64),
    originalKey: `originals/${company.id}/${upload.id}/${attempt}`, createdById: writer.id } })
  app = await NestFactory.create(AppModule, { logger: false }); configureApp(app, readAppConfig())
  await app.listen(0, '127.0.0.1'); address = await app.getUrl()
  writerLogin = await login(writer.email); reviewerLogin = await login(reviewer.email)
}, 120000)

afterAll(async () => {
  try {
    if (app) await app.close()
    if (db) await db.$disconnect()
    process.env.DATABASE_URL = originalUrl
    if (admin) {
      expect(await snapshotBase()).toEqual(baseBefore)
      if (created && /^atms_verify_approval_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
        const rows = await admin.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_database WHERE datname=${databaseName}`
        expect(rows[0].count).toBe(0)
      }
    }
  } finally { if (admin) await admin.$disconnect() }
}, 120000)

describe('F05 isolated workflow HTTP + DB', () => {
  it('K1/K3/K4/K5/K6 preserves content and history across rejection, revision and approval', async () => {
    const row = await create(), original = await db.journalLine.findMany({ where: { companyId: company.id, journalId: row.id } })
    expect((await request(path(`/${row.id}/submit`), { method: 'POST', body: action(1) })).status).toBe(401)
    expect((await request(path(`/${row.id}/submit`), { method: 'POST', login: writerLogin, csrf: 'invalid', body: action(1) })).status).toBe(403)
    expect((await request(path(`/${row.id}/submit`), { method: 'POST', login: writerLogin, body: { version: 1, actionRequestId: 'bad' } })).status).toBe(400)
    const first = action(row.version), submitted = await run(row.id, 'submit', writerLogin, first)
    expect(submitted.status).toBe(200); expect(submitted.data).toMatchObject({ status: 'SUBMITTED', version: 2 })
    expect(submitted.headers.get('cache-control')).toContain('no-store')
    expect((await run(row.id, 'submit', writerLogin, first)).data).toEqual(submitted.data)
    expect((await run(row.id, 'submit', writerLogin, { ...first, version: 999 })).status).toBe(409)
    expect((await run(row.id, 'submit', writerLogin, { ...first, actionRequestId: randomUUID() })).status).toBe(409)
    expect((await run(row.id, 'approve', writerLogin, action(2))).status).toBe(403)
    expect((await request(path(`/${row.id}`), { method: 'PATCH', login: writerLogin,
      body: { version: 2, accountingDate: row.accountingDate, memo: 'forged', counterpartyId: null, evidenceIds: [evidence.id], lines: draft().lines } })).status).toBe(409)
    const reason = '재검토 필요', rejected = await run(row.id, 'reject', reviewerLogin, { ...action(2), reason })
    expect(rejected.status).toBe(200); expect(rejected.data.status).toBe('REJECTED')
    expect((await run(row.id, 'return-to-draft', writerLogin, action(3))).data).toMatchObject({ status: 'DRAFT', version: 4 })
    const revised = await request(path(`/${row.id}`), { method: 'PATCH', login: writerLogin,
      body: { version: 4, accountingDate: row.accountingDate, memo: 'Revised memo', counterpartyId: null,
        evidenceIds: [evidence.id], lines: draft().lines } })
    expect(revised.status).toBe(200); expect(revised.data.version).toBe(5)
    expect((await run(row.id, 'submit', writerLogin, action(5))).data).toMatchObject({ status: 'SUBMITTED', version: 6 })
    const approved = await run(row.id, 'approve', reviewerLogin, action(6))
    expect(approved.status).toBe(200); expect(approved.data).toMatchObject({ status: 'APPROVED', version: 7 })
    expect((await run(row.id, 'return-to-draft', writerLogin, action(7))).status).toBe(409)
    const history = await request(path(`/${row.id}/workflow?limit=20`), { login: writerLogin })
    expect(history.status).toBe(200)
    expect(history.data.allowedActions).toEqual([])
    expect(history.data.history.items.map((item: any) => item.action)).toEqual(['SUBMIT','REJECT','RETURN_TO_DRAFT','SUBMIT','APPROVE'])
    expect(history.data.history.items[1].reason).toBe(reason)
    expect(history.data.history.items[0].submission.content.memo).toBe('Workflow draft')
    expect(history.data.history.items[3].submission.content.memo).toBe('Revised memo')
    expect(history.data.history.items[0].submission.content.lines.map((line: any) => line.id)).toEqual(original.map(line => line.id))
    expect(await db.journalSubmission.count({ where: { companyId: company.id, journalId: row.id } })).toBe(2)
    expect(await db.journalWorkflowAction.count({ where: { companyId: company.id, journalId: row.id } })).toBe(5)
    const audits = await db.auditEvent.findMany({ where: { companyId: company.id, type: { startsWith: 'JOURNAL_' } } })
    expect(audits.filter(item => item.type !== 'JOURNAL_DRAFT_CREATED' && item.type !== 'JOURNAL_DRAFT_UPDATED')).toHaveLength(5)
    expect(JSON.stringify(audits)).not.toContain(reason)
    expect((await request(path(''), { login: writerLogin })).data.items).toEqual([])
    expect((await request(`/api/companies/${company.id}/journal-approval-requests?status=APPROVED`, { login: writerLogin })).data.items[0].id).toBe(row.id)
    expect((await request(path(`/${row.id}`), { login: writerLogin })).data.status).toBe('APPROVED')
    const currentLines = await db.journalLine.findMany({ where: { companyId: company.id, journalId: row.id } })
    expect(currentLines.map(line => [line.position, line.accountId, line.debit.toString(), line.credit.toString()]))
      .toEqual(original.map(line => [line.position, line.accountId, line.debit.toString(), line.credit.toString()]))
    await expect(db.journalEntry.update({ where: { id: row.id }, data: { status: 'REJECTED', version: 8 } })).rejects.toThrow()
    await expect(db.journalLine.update({ where: { id: currentLines[0].id }, data: { memo: 'direct change' } })).rejects.toThrow()
    await expect(db.journalEvidence.delete({ where: { companyId_journalId_evidenceId: { companyId: company.id,
      journalId: row.id, evidenceId: evidence.id } } })).rejects.toThrow()
    await expect(db.journalWorkflowAction.delete({ where: { id: history.data.history.items[0].id } })).rejects.toThrow()
    await expect(db.journalSubmission.update({ where: { id: history.data.history.items[0].submission.id }, data: { content: { forged: true } } })).rejects.toThrow()
    await expect(db.journalSubmission.create({ data: { companyId: company.id, journalId: row.id,
      content: { forged: true }, createdById: writer.id } })).rejects.toThrow()
    await expect(db.journalWorkflowAction.create({ data: { companyId: company.id, journalId: row.id,
      submissionId: history.data.history.items[0].submission.id, actionRequestId: randomUUID(), action: 'APPROVE',
      inputHash: 'a'.repeat(64), statusBefore: 'SUBMITTED', statusAfter: 'APPROVED', versionBefore: 7,
      versionAfter: 8, actorId: reviewer.id } })).rejects.toThrow()
    expect((await request(path(`/${row.id}/workflow?cursor=${randomUUID()}`), { login: writerLogin })).status).toBe(400)
    expect((await request(path(`/${row.id}/workflow?limit=2`), { login: writerLogin })).data.history.nextCursor).toBeTruthy()
  }, 60000)

  it('K2/K4/K5 checks current roles, company isolation, self approval and concurrent reviewers', async () => {
    const row = await create()
    await db.companyMemberRole.deleteMany({ where: { membershipId: writerMembership.id } })
    await db.companyMemberRole.create({ data: { companyId: company.id, membershipId: writerMembership.id, role: 'EXTERNAL_TAX' } })
    expect((await run(row.id, 'submit', writerLogin, action(1))).status).toBe(403)
    await db.companyMemberRole.deleteMany({ where: { membershipId: writerMembership.id } })
    await db.companyMemberRole.create({ data: { companyId: company.id, membershipId: writerMembership.id, role: 'COMPANY_ADMIN' } })
    await db.companyAccount.update({ where: { id: accountA.id }, data: { active: false } })
    expect((await run(row.id, 'submit', writerLogin, action(1))).status).toBe(409)
    await db.companyAccount.update({ where: { id: accountA.id }, data: { active: true } })
    expect((await run(row.id, 'submit', writerLogin, action(1))).status).toBe(200)
    expect((await run(row.id, 'reject', writerLogin, { ...action(2), reason: 'own review' })).status).toBe(403)
    expect((await request(path(`/${row.id}/workflow`, foreignCompany.id), { login: reviewerLogin })).status).toBe(404)
    await db.company.update({ where: { id: company.id }, data: { allowSelfApproval: true } })
    const a = action(2), b = action(2)
    const result = await Promise.all([run(row.id, 'approve', writerLogin, a), run(row.id, 'reject', reviewerLogin, { ...b, reason: 'review' })])
    expect(result.map(item => item.status).sort()).toEqual([200,409])
    expect(await db.journalWorkflowAction.count({ where: { companyId: company.id, journalId: row.id } })).toBe(2)
    expect(await db.journalEntry.findUnique({ where: { id: row.id } })).toMatchObject({ version: 3 })
    expect((await request(path(`/${row.id}/workflow`, foreignCompany.id), { login: writerLogin })).status).toBe(403)
  }, 60000)

  it('K5 rolls back state, submission and action if audit storage fails', async () => {
    const row = await create(), before = await db.journalEntry.findUnique({ where: { id: row.id } })
    const spy = vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('isolated audit failure'))
    try { expect((await run(row.id, 'submit', writerLogin, action(1))).status).toBe(500) }
    finally { spy.mockRestore() }
    expect(await db.journalEntry.findUnique({ where: { id: row.id } })).toEqual(before)
    expect(await db.journalSubmission.count({ where: { companyId: company.id, journalId: row.id } })).toBe(0)
    expect(await db.journalWorkflowAction.count({ where: { companyId: company.id, journalId: row.id } })).toBe(0)
    await expect(db.journalEntry.update({ where: { id: row.id }, data: { number: '20260101-999999' } })).rejects.toThrow()
  }, 30000)

  it('posting K1/K2/K3 makes one immutable POSTED record and rejects every other source state', async () => {
    await db.company.update({ where: { id: company.id }, data: { allowSelfApproval: false } })
    const draftRow = await create()
    expect((await run(draftRow.id, 'confirm', reviewerLogin, action(1))).status).toBe(409)
    expect((await run(draftRow.id, 'submit', writerLogin, action(1))).status).toBe(200)
    expect((await run(draftRow.id, 'confirm', reviewerLogin, action(2))).status).toBe(409)
    const rejected = await create()
    await run(rejected.id, 'submit', writerLogin, action(1))
    await run(rejected.id, 'reject', reviewerLogin, { ...action(2), reason: 'state boundary' })
    expect((await run(rejected.id, 'confirm', reviewerLogin, action(3))).status).toBe(409)

    const row = await create(); await run(row.id, 'submit', writerLogin, action(1)); await run(row.id, 'approve', reviewerLogin, action(2))
    expect((await run(row.id, 'confirm', writerLogin, action(3))).status).toBe(403)
    const first = action(3), second = action(3)
    const results = await Promise.all([run(row.id, 'confirm', reviewerLogin, first), run(row.id, 'confirm', reviewerLogin, second)])
    expect(results.map(result => result.status).sort()).toEqual([200,409])
    const success = results.find(result => result.status === 200)!, successfulInput = results[0].status === 200 ? first : second
    expect(success.data).toMatchObject({ status: 'POSTED', version: 4 })
    expect((await run(row.id, 'confirm', reviewerLogin, successfulInput)).data).toEqual(success.data)
    expect((await run(row.id, 'confirm', reviewerLogin, action(4))).status).toBe(409)
    const posting = await db.journalPosting.findUnique({ where: { companyId_journalId: { companyId: company.id, journalId: row.id } } })
    expect(posting).toMatchObject({ submissionId: expect.any(String), actionId: success.data.id, actorId: reviewer.id })
    expect(await db.journalPosting.count({ where: { companyId: company.id, journalId: row.id } })).toBe(1)
    expect(await db.journalWorkflowAction.count({ where: { companyId: company.id, journalId: row.id, action: 'CONFIRM' } })).toBe(1)
    expect(await db.auditEvent.count({ where: { companyId: company.id, type: 'JOURNAL_POSTED' } })).toBe(1)
    await expect(db.journalPosting.update({ where: { id: posting!.id }, data: { postedAt: new Date() } })).rejects.toThrow()
    await expect(db.journalPosting.delete({ where: { id: posting!.id } })).rejects.toThrow()
  }, 60000)

  it('B4 exposes CONFIRM only to a current confirmer allowed by self-approval policy', async () => {
    await db.company.update({ where: { id: company.id }, data: { allowSelfApproval: false } })
    const row = await create(); await run(row.id, 'submit', writerLogin, action(1)); await run(row.id, 'approve', reviewerLogin, action(2))
    const writerView = await request(path(`/${row.id}/workflow`), { login: writerLogin })
    const reviewerView = await request(path(`/${row.id}/workflow`), { login: reviewerLogin })
    expect(writerView.status).toBe(200); expect(writerView.data.allowedActions).toEqual([])
    expect(reviewerView.status).toBe(200); expect(reviewerView.data.allowedActions).toEqual(['CONFIRM'])
    await db.company.update({ where: { id: company.id }, data: { allowSelfApproval: true } })
    try {
      const selfAllowed = await request(path(`/${row.id}/workflow`), { login: writerLogin })
      expect(selfAllowed.status).toBe(200); expect(selfAllowed.data.allowedActions).toEqual(['CONFIRM'])
    } finally { await db.company.update({ where: { id: company.id }, data: { allowSelfApproval: false } }) }
  }, 60000)

  it('posting K4 rolls back POSTED state, action and posting when audit or SQL integrity fails', async () => {
    const row = await create(); await run(row.id, 'submit', writerLogin, action(1)); await run(row.id, 'approve', reviewerLogin, action(2))
    const before = await db.journalEntry.findUnique({ where: { id: row.id } })
    const spy = vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('isolated posting audit failure'))
    try { expect((await run(row.id, 'confirm', reviewerLogin, action(3))).status).toBe(500) } finally { spy.mockRestore() }
    expect(await db.journalEntry.findUnique({ where: { id: row.id } })).toEqual(before)
    expect(await db.journalPosting.count({ where: { companyId: company.id, journalId: row.id } })).toBe(0)
    expect(await db.journalWorkflowAction.count({ where: { companyId: company.id, journalId: row.id, action: 'CONFIRM' } })).toBe(0)
    const submission = await db.journalSubmission.findFirstOrThrow({ where: { companyId: company.id, journalId: row.id }, orderBy: { createdAt: 'desc' } })
    await expect(db.$transaction(async tx => {
      await tx.journalEntry.update({ where: { id: row.id }, data: { status: 'POSTED', version: 4 } })
      await tx.journalWorkflowAction.create({ data: { companyId: company.id, journalId: row.id, submissionId: submission.id,
        actionRequestId: randomUUID(), action: 'CONFIRM', inputHash: 'a'.repeat(64), statusBefore: 'APPROVED', statusAfter: 'POSTED',
        versionBefore: 3, versionAfter: 4, actorId: reviewer.id } })
    })).rejects.toThrow()
    expect(await db.journalEntry.findUnique({ where: { id: row.id } })).toEqual(before)
  }, 60000)

  it('opening K4/K5/K6 freezes kind, source and lines through the existing approval and posting workflow', async () => {
    await db.company.update({ where: { id: company.id }, data: { allowSelfApproval: false } })
    const opening = await request(`/api/companies/${company.id}/fiscal-years/${year.id}/opening-balance`, {
      method: 'POST', login: writerLogin, body: { creationRequestId: randomUUID(), sourceFiscalYearId: null,
        evidenceIds: [evidence.id], lines: [
          { accountId: accountA.id, debit: '101', credit: '0', memo: null },
          { accountId: accountB.id, debit: '0', credit: '101', memo: 'opening' },
        ] },
    })
    expect(opening.status).toBe(200); expect(opening.data).toMatchObject({ kind: 'OPENING', status: 'DRAFT', version: 1 })
    expect((await run(opening.data.id, 'submit', writerLogin, action(1))).data).toMatchObject({ status: 'SUBMITTED', version: 2 })
    expect((await run(opening.data.id, 'approve', reviewerLogin, action(2))).data).toMatchObject({ status: 'APPROVED', version: 3 })
    expect((await run(opening.data.id, 'confirm', reviewerLogin, action(3))).data).toMatchObject({ status: 'POSTED', version: 4 })

    const history = await request(path(`/${opening.data.id}/workflow`), { login: writerLogin })
    expect(history.data.history.items.map((item: any) => item.action)).toEqual(['SUBMIT', 'APPROVE', 'CONFIRM'])
    expect(history.data.history.items[0].submission.content).toMatchObject({ kind: 'OPENING', sourceFiscalYearId: null,
      isZero: false, evidenceIds: [evidence.id], lines: [{ position: 1, debit: '101', credit: '0' },
        { position: 2, debit: '0', credit: '101', memo: 'opening' }] })
    const stored = await db.journalEntry.findUniqueOrThrow({ where: { id: opening.data.id } })
    expect(stored).toMatchObject({ kind: 'OPENING', openingSourceFiscalYearId: null, status: 'POSTED', lineCount: 2, evidenceCount: 1 })
    expect(await db.journalPosting.count({ where: { companyId: company.id, journalId: opening.data.id } })).toBe(1)
    await expect(db.journalEntry.update({ where: { id: opening.data.id }, data: { kind: 'STANDARD' } })).rejects.toThrow()
    await expect(db.journalLine.updateMany({ where: { companyId: company.id, journalId: opening.data.id }, data: { debit: '102' } })).rejects.toThrow()
    await expect(db.journalEvidence.deleteMany({ where: { companyId: company.id, journalId: opening.data.id } })).rejects.toThrow()
  }, 60000)
})
