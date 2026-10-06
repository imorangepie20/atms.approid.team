import { createRequire } from 'node:module'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { PrismaClient, Prisma } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
// [F08-16 IDE 수리] require로 받은 Prisma는 실행 값이다. typeof로 Decimal 생성자 타입을 읽고
// InstanceType으로 생성된 인스턴스의 타입을 얻는다. Prisma를 타입 namespace처럼 사용하지 않는다.
type PrismaDecimal = InstanceType<typeof Prisma.Decimal>
const { parseAmount, assertStorable, serializeAmount, MoneyError } = require('../dist/common/money.js') as typeof import('../src/common/money')
const server = fileURLToPath(new URL('../', import.meta.url))
const proof = resolve(server, '../.artifacts/implementation-f08-11-12')
const prismaCli = resolve(server, 'node_modules/prisma/build/index.js')
const tsxCli = resolve(server, 'node_modules/tsx/dist/cli.mjs')
const companyA = 'a0000000-0000-4000-8000-000000000001'
const companyB = 'a0000000-0000-4000-8000-000000000002'

/* [F08-11 DB 통합 검증]
 * 기본 개발 DB는 메타데이터 조회와 새 검증 DB 생성에만 사용한다.
 * 모든 업무 쓰기는 테스트가 직접 생성한 고유 DB에서 수행한다. 기존 DB reset은 없다.
 * 검증 종료 시 연결을 닫고 자신이 생성한 DB만 제거한다. 이름은 사용자 입력이 아닌 난수다.
 */
let admin: InstanceType<typeof PrismaClient>
let client: InstanceType<typeof PrismaClient>
let databaseName: string
let testUrl: string
let created = false
let metadataBefore: unknown
const evidence: Record<string, unknown> = {}

function command(args: string[], environment: NodeJS.ProcessEnv): string {
  try { return execFileSync(process.execPath, args, { cwd: server, env: environment, encoding: 'utf8', timeout: 30000, stdio: 'pipe' }) }
  catch { throw new Error('Isolated database command failed; inspect migration or seed implementation.') }
}
function seed(): void {
  // [F03 시험 준비 수리] node로 Vitest를 직접 실행하면 npm의 .bin PATH가 없다.
  // 설치된 tsx 진입점을 명시해 같은 seed를 실행한다. seed 내부의 격리 DB/명시적 허용 검사는 유지한다.
  command([tsxCli, 'prisma/seed.ts'], { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test', ATMS_ALLOW_DEV_SEED: '1' })
}
// [F04-01 최초 회귀 실패 수리] 과거 SQL 시험은 해당 SQL의 고정 허용값을 읽는다.
// 현재 서비스 사건 목록에 미래 사건을 추가해도 과거 SQL의 예상 개수/허용 범위는 늘어나지 않는다.
function auditTypesFromMigration(name: string): string[] {
  if (!/^\d{14}_[a-z_]+$/.test(name)) throw new Error('Invalid known migration')
  const sql = readFileSync(resolve(server, `prisma/migrations/${name}/migration.sql`), 'utf8')
  const values = sql.match(/CHECK\s*\(\s*"type"\s+IN\s*\(([\s\S]*?)\)\s*\)/)?.[1]
  if (!values) throw new Error('Missing fixed audit constraint')
  return [...values.matchAll(/'([A-Z_]+)'/g)].map(match => match[1])
}
async function counts() {
  return {
    companies: await client.company.count(), users: await client.user.count(), memberships: await client.companyMembership.count(),
    roles: await client.companyMemberRole.count(), sessions: await client.userSession.count(), fiscalYears: await client.fiscalYear.count(),
    templates: await client.accountTemplate.count(), templateItems: await client.accountTemplateItem.count(), accounts: await client.companyAccount.count(),
  }
}

beforeAll(async () => {
  loadEnv({ path: resolve(server, '.env'), quiet: true })
  const base = new URL(process.env.DATABASE_URL ?? '')
  // 외부·운영·다른 프로젝트 DB를 검증 대상으로 사용하지 않는다. 실패 시 URL을 출력하지 않는다.
  if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.port !== '55432' || base.pathname !== '/atms') {
    throw new Error('Database verification requires the configured local atms PostgreSQL service.')
  }
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.toString(), max: 2 }) })
  metadataBefore = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
  databaseName = `atms_verify_f081112_${randomBytes(8).toString('hex')}`
  // SQL 식별자는 파라미터 바인딩할 수 없다. 고정 접두사·난수 hex만 만든 뒤 별도로 검사한다.
  if (!/^atms_verify_f081112_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Invalid verification identifier')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  base.pathname = `/${databaseName}`
  testUrl = base.toString()
  const output = command([prismaCli, 'migrate', 'deploy'], { ...process.env, DATABASE_URL: testUrl })
  mkdirSync(proof, { recursive: true })
  writeFileSync(resolve(proof, 'migration.log'), output)
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 2 }) })
  evidence.database = databaseName
  evidence.initialMetadata = await client.appMetadata.findUnique({ where: { key: 'environment_schema' } }).then(row => row?.value)
  seed()
}, 120000)

afterAll(async () => {
  try {
    if (client) await client.$disconnect()
    if (admin) {
      const after = await admin.appMetadata.findMany({ orderBy: { key: 'asc' } })
      expect(after).toEqual(metadataBefore)
      evidence.originalMetadataPreserved = true
      // 기존 값의 원문을 기록하지 않고 보존 확인용 해시만 남긴다.
      evidence.originalMetadataHash = createHash('sha256').update(JSON.stringify(after)).digest('hex')
      if (created && /^atms_verify_f081112_[a-f0-9]{16}$/.test(databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
        evidence.onlyCreatedTestDatabaseRemoved = true
      }
    }
  } finally {
    if (admin) await admin.$disconnect()
    mkdirSync(proof, { recursive: true })
    writeFileSync(resolve(proof, 'database-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}, 30000)

describe('database foundation', () => {
  // [F04-01 K7] nullable쌍은 기존 계정을 유지하되 새 API 식별자가 있으면 완전한 입력을 강제한다.
  it('enforces account pairs, request uniqueness and version while retaining unclassified legacy rows', async () => {
    const base = { companyId: companyA, code: 'K7-ACCOUNT', name: 'Account', category: 'ASSET' as const, normalBalance: 'DEBIT' as const,
      creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64) }
    const before = await client.companyAccount.findMany({ orderBy: { id: 'asc' } })
    expect(before.every(row => row.category === null && row.normalBalance === null && row.version === 1 && row.creationRequestId === null)).toBe(true)
    const row = await client.companyAccount.create({ data: base })
    for (const invalid of [{ category: null }, { normalBalance: null }, { creationInputHash: null }, { creationRequestId: null },
      { creationInputHash: 'g'.repeat(64) }, { version: 0 }, { code: 'lowercase' }, { code: 'A'.repeat(21) }, { name: '' },
      { category: null, normalBalance: null }]) {
      await expect(client.companyAccount.create({ data: { ...base, code: randomUUID().slice(0, 8).toUpperCase(), creationRequestId: randomUUID(), ...invalid } as never })).rejects.toThrow()
    }
    await expect(client.companyAccount.create({ data: { ...base, code: 'K7-DUPLICATE' } })).rejects.toThrow()
    await client.companyAccount.create({ data: { ...base, companyId: companyB } })
    expect(await client.companyAccount.findMany({ where: { id: { in: before.map(row => row.id) } }, orderBy: { id: 'asc' } })).toEqual(before)
    await client.companyAccount.deleteMany({ where: { code: { in: [row.code, 'K7-DUPLICATE'] } } })
    evidence.accountPairsAndRequestConstraints = true
  })
  it('upgrades all legacy tables without changing account identity, codes, names or template references', async () => {
    const { Pool } = require('pg'), ownedName = `atms_verify_accounts_upgrade_${randomBytes(8).toString('hex')}`
    if (!/^atms_verify_accounts_upgrade_[a-f0-9]{16}$/.test(ownedName)) throw new Error('Invalid owned account database')
    await admin.$executeRawUnsafe(`CREATE DATABASE "${ownedName}"`)
    const url = new URL(testUrl); url.pathname = `/${ownedName}`
    const pool = new Pool({ connectionString: url.toString(), max: 1 }), connection = await pool.connect()
    const migration = '20261007000000_company_accounts_foundation'
    try {
      // [F04 J8 과거 시험 보존] 해당 시점보다 앞선 SQL만 적용한다. 후속 전표 SQL을 과거로 역적용하지 않는다.
      for (const name of readdirSync(resolve(server, 'prisma/migrations')).filter(name => /^\d{14}_/.test(name) && name < migration).sort())
        await connection.query(readFileSync(resolve(server, `prisma/migrations/${name}/migration.sql`), 'utf8'))
      const companyId = randomUUID(), templateId = randomUUID(), itemId = randomUUID()
      await connection.query("INSERT INTO companies(id,name,updated_at) VALUES($1,'Preserved account company',now())", [companyId])
      await connection.query("INSERT INTO account_templates(id,code,version,name,is_development_only) VALUES($1,'LEGACY',1,'Legacy',true)", [templateId])
      await connection.query("INSERT INTO account_template_items(id,template_id,code,name) VALUES($1,$2,'legacy','Original')", [itemId, templateId])
      await connection.query("INSERT INTO company_accounts(id,company_id,code,name,active,source_template_item_id) VALUES($1,$2,' legacy ','Original name',false,$3)", [randomUUID(), companyId, itemId])
      const tables: string[] = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row: any) => row.tablename)
      const snapshot = async (upgraded: boolean) => {
        const result: Record<string, unknown> = {}
        for (const table of tables) {
          if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid known table')
          const expression = upgraded && table === 'company_accounts' ? "to_jsonb(t)-'category'-'normal_balance'-'version'-'creation_request_id'-'creation_input_hash'" : 'to_jsonb(t)'
          result[table] = (await connection.query(`SELECT ${expression} AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows
        }
        return result
      }
      const before = await snapshot(false)
      await connection.query(readFileSync(resolve(server, `prisma/migrations/${migration}/migration.sql`), 'utf8'))
      expect(await snapshot(true)).toEqual(before)
      expect((await connection.query('SELECT category,normal_balance,version,creation_request_id,creation_input_hash FROM company_accounts')).rows)
        .toEqual([{ category: null, normal_balance: null, version: 1, creation_request_id: null, creation_input_hash: null }])
      const { auditTypes } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
      // 현재 서비스의 새 사건을 과거 SQL의 허용 목록으로 가정하지 않는다.
      for (const type of auditTypesFromMigration(migration)) {
        expect(auditTypes).toContain(type)
        await connection.query("INSERT INTO audit_events(id,type,request_id,details) VALUES($1,$2,$3,'{}')", [randomUUID(), type, randomUUID()])
      }
      await expect(connection.query("INSERT INTO audit_events(id,type,request_id,details) VALUES($1,'UNKNOWN_EVENT',$2,'{}')", [randomUUID(), randomUUID()])).rejects.toThrow()
      evidence.accountUpgradeLegacyTables = tables.length; evidence.accountUpgradePreservesLegacyRows = true; evidence.accountAuditTypeConstraint = true
    } finally { connection.release(); await pool.end(); await admin.$executeRawUnsafe(`DROP DATABASE "${ownedName}"`) }
  }, 30000)
  // [F03 DB] 실제 FK/유일성/보존 trigger를 시험한다. 쓰기는 난수 전용 DB에만 발생한다.
  it('enforces evidence company references, original immutability and bounded content metadata', async () => {
    const owner = await client.user.findFirstOrThrow(), uploadId = randomUUID(), attemptId = randomUUID()
    const upload = await client.evidenceUpload.create({ data: { id: uploadId, companyId: companyA, ownerId: owner.id,
      creationRequestId: randomUUID(), inputHash: 'a'.repeat(64), attemptId, leaseExpiresAt: new Date(), state: 'READY' } })
    const party = await client.counterparty.create({ data: { companyId: companyB, name: 'other-company evidence party', kind: 'BOTH', creationRequestId: randomUUID(), creationInputHash: 'b'.repeat(64) } })
    const data = { companyId: companyA, uploadId, kind: 'RECEIPT' as const, title: 'Immutable original', originalFileName: 'receipt.pdf',
      mediaType: 'application/pdf', byteSize: 20, sha256: 'c'.repeat(64), originalKey: `originals/${companyA}/${uploadId}/${attemptId}`, createdById: owner.id }
    await expect(client.evidence.create({ data: { ...data, counterpartyId: party.id } })).rejects.toThrow()
    await expect(client.evidence.create({ data: { ...data, companyId: companyB } })).rejects.toThrow()
    for (const invalid of [{ byteSize: 0 }, { byteSize: 10485761 }, { mediaType: 'text/html' }, { sha256: 'g'.repeat(64) }, { title: '' }]) {
      await expect(client.evidence.create({ data: { ...data, ...invalid } })).rejects.toThrow()
    }
    const row = await client.evidence.create({ data })
    await expect(client.evidence.create({ data })).rejects.toThrow()
    await expect(client.evidence.update({ where: { id: row.id }, data: { title: 'changed' } })).rejects.toThrow()
    await expect(client.evidence.delete({ where: { id: row.id } })).rejects.toThrow()
    await expect(client.evidenceUpload.delete({ where: { id: upload.id } })).rejects.toThrow()
    expect((await client.evidence.findUniqueOrThrow({ where: { id: row.id } })).originalKey).toBe(data.originalKey)
    evidence.evidenceCompanyFkAndOriginalPreserved = true
  })
  // [F02 추가] 같은 회사의 번호/요청ID와 회사+거래처 외래키를 실제 DB가 강제한다.
  it('enforces counterparty company keys, nullable duplicate policy and database constraints', async () => {
    const base = { companyId: companyA, name: 'Counterparty', kind: 'BOTH' as const, creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64) }
    const row = await client.counterparty.create({ data: { ...base, businessNumber: '1234567890' } })
    const another = (overrides: Record<string, unknown> = {}) => client.counterparty.create({ data: { ...base, creationRequestId: randomUUID(), ...overrides } as never })
    await expect(another({ businessNumber: '1234567890' })).rejects.toThrow()
    await client.counterparty.update({ where: { id: row.id }, data: { active: false } })
    await expect(another({ businessNumber: '1234567890' })).rejects.toThrow()
    await another({ companyId: companyB, businessNumber: '1234567890' }); await another(); await another()
    await expect(another({ creationRequestId: base.creationRequestId })).rejects.toThrow()
    for (const invalid of [{ version: 0 }, { name: '' }, { name: 'x'.repeat(101) }, { businessNumber: '123-45-67890' },
      { creationInputHash: 'g'.repeat(64) }, { phone: 'x'.repeat(41) }, { companyId: randomUUID() }]) await expect(another(invalid)).rejects.toThrow()
    await client.$transaction(async tx => {
      // [F02 재개 수리] PostgreSQL 임시 테이블은 일반 테이블을 참조할 수 없다.
      // 이 난수 검증 DB 안에서 일반 테이블을 만들고 같은 TX에서 삭제한다. 기본 DB에는 실행하지 않는다.
      await tx.$executeRaw`CREATE TABLE counterparty_ref_verify(company_id UUID, counterparty_id UUID,
        FOREIGN KEY(company_id,counterparty_id) REFERENCES counterparties(company_id,id))`
      await tx.$executeRaw`INSERT INTO counterparty_ref_verify VALUES(${companyA}::uuid,${row.id}::uuid)`
      await tx.$executeRaw`DROP TABLE counterparty_ref_verify`
    })
    await expect(client.$transaction(async tx => {
      await tx.$executeRaw`CREATE TABLE counterparty_ref_invalid(company_id UUID, counterparty_id UUID,
        FOREIGN KEY(company_id,counterparty_id) REFERENCES counterparties(company_id,id))`
      await tx.$executeRaw`INSERT INTO counterparty_ref_invalid VALUES(${companyB}::uuid,${row.id}::uuid)`
    })).rejects.toThrow()
    await client.counterparty.deleteMany(); evidence.counterpartyDatabaseConstraints = true
  })
  it('adds counterparty migration without changing any of the nineteen legacy tables', async () => {
    const { Pool } = require('pg'), ownedName = `atms_verify_counterparty_upgrade_${randomBytes(8).toString('hex')}`
    if (!/^atms_verify_counterparty_upgrade_[a-f0-9]{16}$/.test(ownedName)) throw new Error('Invalid owned database')
    await admin.$executeRawUnsafe(`CREATE DATABASE "${ownedName}"`)
    const url = new URL(testUrl); url.pathname = `/${ownedName}`
    const pool = new Pool({ connectionString: url.toString(), max: 1 }), connection = await pool.connect()
    try {
      for (const migration of ['20261005000000_environment', '20261005010000_business_foundation', '20261005020000_auth_audit_foundation',
        '20261005030000_account_lifecycle', '20261005040000_company_foundation', '20261005050000_company_members', '20261005060000_company_access_flows',
        '20261005070000_company_self_approval', '20261006000000_rule_version_foundation']) {
        await connection.query(readFileSync(resolve(server, `prisma/migrations/${migration}/migration.sql`), 'utf8'))
      }
      await connection.query("INSERT INTO companies(id,name,updated_at) VALUES($1,'Preserved',now())", [randomUUID()])
      await connection.query("INSERT INTO audit_events(id,type,request_id,details) VALUES($1,'LOGOUT',$2,'{}')", [randomUUID(), randomUUID()])
      const tables: string[] = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row: any) => row.tablename)
      expect(tables).toHaveLength(19)
      const snapshot = async () => {
        const result: Record<string, unknown> = {}
        for (const table of tables) {
          if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid known table')
          result[table] = (await connection.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows
        }
        return result
      }
      const before = await snapshot()
      await connection.query(readFileSync(resolve(server, 'prisma/migrations/20261006010000_counterparty_foundation/migration.sql'), 'utf8'))
      expect(await snapshot()).toEqual(before)
      const { auditTypes } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
      // [F04-01 수리] 시험 대상 SQL의31사건을 유지한다. 현재 서비스도 그 사건들을 계속 지원해야 한다.
      const historicalTypes = auditTypesFromMigration('20261006010000_counterparty_foundation')
      expect(historicalTypes).toHaveLength(31)
      for (const type of historicalTypes) expect(auditTypes).toContain(type)
      for (const type of historicalTypes) await connection.query("INSERT INTO audit_events(id,type,request_id,details) VALUES($1,$2,$3,'{}')", [randomUUID(), type, randomUUID()])
      await expect(connection.query("INSERT INTO audit_events(id,type,request_id,details) VALUES($1,'UNKNOWN_EVENT',$2,'{}')", [randomUUID(), randomUUID()])).rejects.toThrow()
    } finally { connection.release(); await pool.end(); await admin.$executeRawUnsafe(`DROP DATABASE "${ownedName}"`) }
    evidence.counterpartyUpgradePreservesAllLegacyRows = true; evidence.counterpartyAuditTypeConstraint = true
  }, 30000)
  it('applies all migrations and preserves initial metadata', async () => {
    expect(evidence.initialMetadata).toBe('1')
    const rows = await client.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
    // [J8 첫 실패 수리] 새 SQL을 추가하면 고정 개수도 낡는다. 적용 이력을 실제 승인 SQL 폴더
    // 목록과 정확히 대조해 누락/중복/예상 밖 적용을 검출한다. 과거 SQL 시험의 고정 목록은 유지한다.
    const expectedMigrations = readdirSync(resolve(server, 'prisma/migrations')).filter(name => /^\d{14}_[a-z_]+$/.test(name)).sort()
    const applied = await client.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`
    expect(applied.map(row => row.migration_name)).toEqual(expectedMigrations)
    expect(rows[0].count).toBe(BigInt(expectedMigrations.length))
    const tables = await client.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name`
    expect(tables.map(row => row.table_name)).toEqual([
      'account_template_items', 'account_templates', 'app_metadata', 'audit_events', 'companies', 'company_access_requests', 'company_accounts', 'company_invitations',
      'company_member_roles', 'company_memberships', 'company_rule_applications', 'counterparties', 'evidence_uploads', 'evidences', 'fiscal_years', 'login_rate_buckets',
      'rule_artifact_versions', 'rule_sets', 'rule_versions', 'user_action_tokens', 'user_sessions', 'users',
      // [F05 W6] 새 승인 제출본·전이 이력 2테이블도 추가 migration의 정확한 목록에 포함한다.
      'journal_entries', 'journal_evidences', 'journal_lines', 'journal_number_sequences', 'journal_postings', 'journal_submissions', 'journal_workflow_actions',
    ].sort())
    evidence.businessModels = 12 // [F05-01] 기존11개와 불변 확정 기록1개
    evidence.totalTables = tables.length
    evidence.appliedMigrations = Number(rows[0].count)
  })
  it('upgrades existing company and period rows additively and rolls back an incompatible legacy period', async () => {
    // [F01 추가 마이그레이션 검증] 먼저 실제 과거 SQL 4개를 적용하고 구 데이터를 넣는다.
    // 정상 데이터는 그대로 유지되어야 한다. 366일 초과 구 데이터가 있으면 전체 추가 SQL이 실패해야 한다.
    const { Pool } = require('pg')
    const previous = ['20261005000000_environment', '20261005010000_business_foundation',
      '20261005020000_auth_audit_foundation', '20261005030000_account_lifecycle']
    for (const compatible of [true, false]) {
      const ownedName = `atms_verify_company_upgrade_${randomBytes(8).toString('hex')}`
      if (!/^atms_verify_company_upgrade_[a-f0-9]{16}$/.test(ownedName)) throw new Error('Invalid owned upgrade database')
      await admin.$executeRawUnsafe(`CREATE DATABASE "${ownedName}"`)
      const url = new URL(testUrl); url.pathname = `/${ownedName}`
      const pool = new Pool({ connectionString: url.toString(), max: 1 }), connection = await pool.connect()
      try {
        for (const name of previous) await connection.query(readFileSync(resolve(server, `prisma/migrations/${name}/migration.sql`), 'utf8'))
        const companyId = randomUUID(), yearId = randomUUID()
        await connection.query('INSERT INTO companies (id,name,updated_at) VALUES ($1,$2,now())', [companyId, 'Preserved legacy company'])
        await connection.query('INSERT INTO fiscal_years (id,company_id,start_date,end_date) VALUES ($1,$2,$3,$4)',
          [yearId, companyId, '2024-01-01', compatible ? '2024-12-31' : '2025-01-01'])
        const before = (await connection.query('SELECT to_jsonb(c) AS value FROM companies c')).rows
        const periods = (await connection.query('SELECT to_jsonb(f) AS value FROM fiscal_years f')).rows
        const sql = readFileSync(resolve(server, 'prisma/migrations/20261005040000_company_foundation/migration.sql'), 'utf8')
        if (compatible) {
          await connection.query(sql)
          const after = (await connection.query(`SELECT to_jsonb(c)-'version'-'created_by_id'-'creation_request_id'-'creation_input_hash' AS value FROM companies c`)).rows
          expect(after).toEqual(before)
          expect((await connection.query('SELECT version,created_by_id,creation_request_id,creation_input_hash FROM companies')).rows[0])
            .toEqual({ version: 1, created_by_id: null, creation_request_id: null, creation_input_hash: null })
        } else {
          await expect(connection.query(sql)).rejects.toThrow()
          await connection.query('ROLLBACK')
          expect((await connection.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='companies' AND column_name='version'")).rows[0].count).toBe(0)
          expect((await connection.query('SELECT to_jsonb(c) AS value FROM companies c')).rows).toEqual(before)
        }
        expect((await connection.query('SELECT to_jsonb(f) AS value FROM fiscal_years f')).rows).toEqual(periods)
      } finally {
        connection.release(); await pool.end()
        await admin.$executeRawUnsafe(`DROP DATABASE "${ownedName}"`)
      }
    }
    evidence.companyUpgradePreservesRowsAndRejectsIncompatiblePeriod = true
  }, 30000)
  it('adds membership version without changing legacy users, companies, memberships or roles', async () => {
    // [F01 네 번째 묶음] 이전 5개 SQL에 실제 구 소속을 넣고 여섯 번째 SQL을 적용하여 행 보존을 비교한다.
    const { Pool } = require('pg'), ownedName = `atms_verify_member_upgrade_${randomBytes(8).toString('hex')}`
    if (!/^atms_verify_member_upgrade_[a-f0-9]{16}$/.test(ownedName)) throw new Error('Invalid owned member database')
    await admin.$executeRawUnsafe(`CREATE DATABASE "${ownedName}"`)
    const url = new URL(testUrl); url.pathname = `/${ownedName}`
    const pool = new Pool({ connectionString: url.toString(), max: 1 }), connection = await pool.connect()
    try {
      for (const name of ['20261005000000_environment', '20261005010000_business_foundation', '20261005020000_auth_audit_foundation',
        '20261005030000_account_lifecycle', '20261005040000_company_foundation']) {
        await connection.query(readFileSync(resolve(server, `prisma/migrations/${name}/migration.sql`), 'utf8'))
      }
      const userId = randomUUID(), companyId = randomUUID(), membershipId = randomUUID()
      await connection.query("INSERT INTO users (id,email,email_normalized,disabled_at) VALUES ($1,'legacy-member@example.invalid','legacy-member@example.invalid',now())", [userId])
      await connection.query("INSERT INTO companies (id,name) VALUES ($1,'Legacy member company')", [companyId])
      await connection.query('INSERT INTO company_memberships (id,company_id,user_id) VALUES ($1,$2,$3)', [membershipId, companyId, userId])
      await connection.query("INSERT INTO company_member_roles (company_id,membership_id,role) VALUES ($1,$2,'READ_ONLY')", [companyId, membershipId])
      const snapshot = async () => ({
        users: (await connection.query('SELECT to_jsonb(u) AS value FROM users u ORDER BY id')).rows,
        companies: (await connection.query('SELECT to_jsonb(c) AS value FROM companies c ORDER BY id')).rows,
        memberships: (await connection.query("SELECT to_jsonb(m)-'version' AS value FROM company_memberships m ORDER BY id")).rows,
        roles: (await connection.query('SELECT to_jsonb(r) AS value FROM company_member_roles r ORDER BY membership_id,role')).rows,
      })
      const before = await snapshot()
      await connection.query(readFileSync(resolve(server, 'prisma/migrations/20261005050000_company_members/migration.sql'), 'utf8'))
      expect(await snapshot()).toEqual(before)
      expect((await connection.query('SELECT version FROM company_memberships')).rows).toEqual([{ version: 1 }])
      await expect(connection.query('UPDATE company_memberships SET version=0')).rejects.toThrow()
      expect((await connection.query('SELECT version FROM company_memberships')).rows).toEqual([{ version: 1 }])
    } finally {
      connection.release(); await pool.end(); await admin.$executeRawUnsafe(`DROP DATABASE "${ownedName}"`)
    }
    evidence.memberUpgradePreservesRowsAndChecksVersion = true
  }, 30000)
  it('adds access-flow tables without changing any legacy table rows', async () => {
    // [F01 다섯 번째 묶음] 실제 첫 6개 SQL에 구 자료를 넣고 일곱 번째 SQL만 적용한다.
    // 기본 atms는 읽기만 하며 이름을 검증한 자체 DB만 닫고 제거한다.
    const { Pool } = require('pg'), ownedName = `atms_verify_access_upgrade_${randomBytes(8).toString('hex')}`
    if (!/^atms_verify_access_upgrade_[a-f0-9]{16}$/.test(ownedName)) throw new Error('Invalid owned database')
    await admin.$executeRawUnsafe(`CREATE DATABASE "${ownedName}"`)
    const url = new URL(testUrl); url.pathname = `/${ownedName}`
    const pool = new Pool({ connectionString: url.toString(), max: 1 }), connection = await pool.connect()
    try {
      for (const migration of ['20261005000000_environment', '20261005010000_business_foundation', '20261005020000_auth_audit_foundation',
        '20261005030000_account_lifecycle', '20261005040000_company_foundation', '20261005050000_company_members']) {
        await connection.query(readFileSync(resolve(server, `prisma/migrations/${migration}/migration.sql`), 'utf8'))
      }
      const userId = randomUUID(), companyId = randomUUID(), memberId = randomUUID()
      await connection.query("INSERT INTO users (id,email,email_normalized,disabled_at) VALUES ($1,'legacy-access@example.invalid','legacy-access@example.invalid',now())", [userId])
      await connection.query("INSERT INTO companies (id,name,updated_at) VALUES ($1,'Legacy access company',now())", [companyId])
      await connection.query('INSERT INTO company_memberships (id,company_id,user_id,version) VALUES ($1,$2,$3,5)', [memberId, companyId, userId])
      await connection.query("INSERT INTO company_member_roles (company_id,membership_id,role) VALUES ($1,$2,'READ_ONLY')", [companyId, memberId])
      const tables: string[] = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row: any) => row.tablename)
      expect(tables).toHaveLength(13)
      const snapshot = async () => {
        const result: Record<string, unknown> = {}
        for (const table of tables) {
          if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid known table')
          result[table] = (await connection.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows
        }
        return result
      }
      const before = await snapshot()
      await connection.query(readFileSync(resolve(server, 'prisma/migrations/20261005060000_company_access_flows/migration.sql'), 'utf8'))
      expect(await snapshot()).toEqual(before)
      expect((await connection.query('SELECT version FROM company_memberships')).rows).toEqual([{ version: 5 }])
      expect((await connection.query('SELECT count(*)::int AS count FROM company_invitations')).rows[0].count).toBe(0)
      expect((await connection.query('SELECT count(*)::int AS count FROM company_access_requests')).rows[0].count).toBe(0)
    } finally { connection.release(); await pool.end(); await admin.$executeRawUnsafe(`DROP DATABASE "${ownedName}"`) }
    evidence.accessUpgradePreservesAllLegacyRows = true
  }, 30000)
  it('enforces access-flow statuses, roles, times, pending uniqueness, positive versions and restrictive foreign keys', async () => {
    const users = await client.user.findMany({ orderBy: { id: 'asc' } }), now = new Date('2026-10-05T00:00:00Z')
    const data = { companyId: companyA, issuerId: users[0].id, email: 'db-target@example.invalid', emailNormalized: 'db-target@example.invalid',
      roles: ['READ_ONLY'] as const, tokenHash: 'c'.repeat(64), createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 604800000) }
    const create = (overrides: Record<string, unknown>) => client.companyInvitation.create({ data: { ...data, roles: [...data.roles], ...overrides } as any })
    for (const overrides of [{ status: 'UNKNOWN' }, { version: 0 }, { roles: [] }, { roles: ['READ_ONLY', 'READ_ONLY'] },
      { roles: [null] }, { tokenHash: 'g'.repeat(64) }, { emailNormalized: 'UPPER@EXAMPLE.INVALID' }, { expiresAt: now },
      { status: 'ACCEPTED' }, { issuerId: randomUUID() }]) await expect(create(overrides)).rejects.toThrow()
    const first = await create({})
    await expect(create({ tokenHash: 'd'.repeat(64) })).rejects.toThrow()
    await client.companyInvitation.update({ where: { id: first.id }, data: { status: 'CANCELLED', processedAt: now, tokenInvalidatedAt: now } })
    await create({ tokenHash: 'd'.repeat(64) })
    const requestData = { companyId: companyA, requesterId: users[0].id, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 604800000) }
    const row = await client.companyAccessRequest.create({ data: requestData })
    await expect(client.companyAccessRequest.create({ data: requestData })).rejects.toThrow()
    for (const overrides of [{ status: 'UNKNOWN' }, { version: 0 }, { expiresAt: now }, { status: 'APPROVED', processedAt: now }, { requesterId: randomUUID() }]) {
      await expect(client.companyAccessRequest.create({ data: { ...requestData, requesterId: users[1].id, ...overrides } })).rejects.toThrow()
    }
    await expect(client.user.delete({ where: { id: users[0].id } })).rejects.toThrow()
    await client.companyAccessRequest.update({ where: { id: row.id }, data: { status: 'CANCELLED', processedAt: now } })
    await client.companyAccessRequest.create({ data: requestData })
    await client.companyInvitation.deleteMany(); await client.companyAccessRequest.deleteMany()
    evidence.accessFlowConstraints = true
  })
  it('extends the fixed audit event constraint while preserving all legacy rows and both setting values', async () => {
    // [F01 설정 SQL 검증] 앞선 7개 실제 SQL과 구 자료에 여덟 번째 SQL만 적용한다.
    // 실제 기본 DB는 읽기/난수 DB 생성에만 사용하며 자신이 만든 DB만 제거한다.
    const { Pool } = require('pg'), ownedName = `atms_verify_settings_upgrade_${randomBytes(8).toString('hex')}`
    if (!/^atms_verify_settings_upgrade_[a-f0-9]{16}$/.test(ownedName)) throw new Error('Invalid owned database')
    await admin.$executeRawUnsafe(`CREATE DATABASE "${ownedName}"`)
    const url = new URL(testUrl); url.pathname = `/${ownedName}`
    const pool = new Pool({ connectionString: url.toString(), max: 1 }), connection = await pool.connect()
    try {
      for (const migration of ['20261005000000_environment', '20261005010000_business_foundation', '20261005020000_auth_audit_foundation',
        '20261005030000_account_lifecycle', '20261005040000_company_foundation', '20261005050000_company_members', '20261005060000_company_access_flows']) {
        await connection.query(readFileSync(resolve(server, `prisma/migrations/${migration}/migration.sql`), 'utf8'))
      }
      const first = randomUUID(), second = randomUUID(), eventId = randomUUID()
      await connection.query("INSERT INTO companies (id,name,allow_self_approval,version,updated_at) VALUES ($1,'Legacy false',false,4,now()),($2,'Legacy true',true,7,now())", [first, second])
      // [F01 시험 자료 수정] request_id는 UUID이며 details는 NOT NULL JSON 객체다. 실제 DB 계약에 맞춘다.
      await connection.query("INSERT INTO audit_events (id,type,request_id,details) VALUES ($1,'INVITATION_CREATED',$2,'{}'::jsonb)", [eventId, randomUUID()])
      const tables: string[] = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row: any) => row.tablename)
      expect(tables).toHaveLength(15)
      const snapshot = async () => {
        const result: Record<string, unknown> = {}
        for (const table of tables) {
          if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid known table')
          result[table] = (await connection.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows
        }
        return result
      }
      const before = await snapshot()
      await expect(connection.query("INSERT INTO audit_events (id,type,request_id,details) VALUES ($1,'COMPANY_SELF_APPROVAL_CHANGED',$2,'{}'::jsonb)", [randomUUID(), randomUUID()])).rejects.toThrow()
      await connection.query(readFileSync(resolve(server, 'prisma/migrations/20261005070000_company_self_approval/migration.sql'), 'utf8'))
      expect(await snapshot()).toEqual(before)
      const { auditTypes } = require('../dist/audit/audit.service.js') as typeof import('../src/audit/audit.service')
      // [F04-01 수리] 현재 전체 목록에서 빼는 방식 대신 당시 SQL의28허용값을 직접 확인한다.
      const historicalTypes = auditTypesFromMigration('20261005070000_company_self_approval')
      expect(historicalTypes).toHaveLength(28)
      for (const type of historicalTypes) expect(auditTypes).toContain(type)
      for (const type of historicalTypes) await connection.query("INSERT INTO audit_events (id,type,request_id,details) VALUES ($1,$2,$3,'{}'::jsonb)", [randomUUID(), type, randomUUID()])
      await expect(connection.query("INSERT INTO audit_events (id,type,request_id,details) VALUES ($1,'UNKNOWN_EVENT',$2,'{}'::jsonb)", [randomUUID(), randomUUID()])).rejects.toThrow()
    } finally { connection.release(); await pool.end(); await admin.$executeRawUnsafe(`DROP DATABASE "${ownedName}"`) }
    evidence.settingUpgradePreservesAllLegacyRows = true; evidence.settingAuditTypeConstraint = true
  }, 30000)
  it('adds immutable rule versions and company periods without changing any legacy table row', async () => {
    // [F13 DB 검증] 앞선 8개 실제 SQL과 구 자료 위에 아홉 번째 SQL만 적용한다.
    const { Pool } = require('pg'), ownedName = `atms_verify_rules_upgrade_${randomBytes(8).toString('hex')}`
    if (!/^atms_verify_rules_upgrade_[a-f0-9]{16}$/.test(ownedName)) throw new Error('Invalid owned database')
    await admin.$executeRawUnsafe(`CREATE DATABASE "${ownedName}"`)
    const url = new URL(testUrl); url.pathname = `/${ownedName}`
    const pool = new Pool({ connectionString: url.toString(), max: 1 }), connection = await pool.connect()
    try {
      for (const migration of ['20261005000000_environment', '20261005010000_business_foundation', '20261005020000_auth_audit_foundation',
        '20261005030000_account_lifecycle', '20261005040000_company_foundation', '20261005050000_company_members',
        '20261005060000_company_access_flows', '20261005070000_company_self_approval']) {
        await connection.query(readFileSync(resolve(server, `prisma/migrations/${migration}/migration.sql`), 'utf8'))
      }
      const companyId = randomUUID()
      await connection.query('INSERT INTO companies (id,name,updated_at) VALUES ($1,$2,now())', [companyId, 'Legacy company'])
      const legacyTables: string[] = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row: any) => row.tablename)
      expect(legacyTables).toHaveLength(15)
      const snapshot = async () => {
        const result: Record<string, unknown> = {}
        for (const table of legacyTables) {
          if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid known table')
          result[table] = (await connection.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows
        }
        return result
      }
      const before = await snapshot()
      await connection.query(readFileSync(resolve(server, 'prisma/migrations/20261006000000_rule_version_foundation/migration.sql'), 'utf8'))
      expect(await snapshot()).toEqual(before)
      expect((await connection.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count).toBe(19)

      const ruleSetId = randomUUID(), otherRuleSetId = randomUUID(), versionId = randomUUID()
      await connection.query('INSERT INTO rule_sets (id,domain,jurisdiction,code,name) VALUES ($1,\'ACCOUNTING\',\'KR\',\'TEST_RULE\',\'Test rule\'),($2,\'TAX\',\'KR\',\'TEST_TAX\',\'Test tax\')', [ruleSetId, otherRuleSetId])
      await connection.query(`INSERT INTO rule_versions (id,rule_set_id,version,official_source_title,official_source_url,legal_provision,
        effective_from,applicable_from,applicable_to,company_conditions,transitional_provisions)
        VALUES ($1,$2,'test-1','Test source','https://example.invalid/test','TEST-1','2026-01-01','2026-01-01','2026-12-31','{}'::jsonb,'{}'::jsonb)`, [versionId, ruleSetId])
      for (const [index, kind] of ['CONFIG', 'CALCULATION', 'ACCOUNT_MAPPING', 'FORM'].entries()) {
        await connection.query(`INSERT INTO rule_artifact_versions (id,rule_version_id,kind,version,repository_locator,content_sha256,metadata)
          VALUES ($1,$2,$3,'test-1',$4,$5,'{}'::jsonb)`, [randomUUID(), versionId, kind, `repo://rules/test/${kind.toLowerCase()}@test-1`, String(index + 1).repeat(64)])
      }
      await connection.query(`INSERT INTO company_rule_applications (id,company_id,rule_set_id,rule_version_id,effective_from,effective_to)
        VALUES ($1,$2,$3,$4,'2026-01-01','2026-06-30')`, [randomUUID(), companyId, ruleSetId, versionId])
      await expect(connection.query(`INSERT INTO company_rule_applications (id,company_id,rule_set_id,rule_version_id,effective_from,effective_to)
        VALUES ($1,$2,$3,$4,'2026-06-01','2026-12-31')`, [randomUUID(), companyId, ruleSetId, versionId])).rejects.toThrow()
      await expect(connection.query(`INSERT INTO company_rule_applications (id,company_id,rule_set_id,rule_version_id,effective_from,effective_to)
        VALUES ($1,$2,$3,$4,'2026-07-01','2026-12-31')`, [randomUUID(), companyId, otherRuleSetId, versionId])).rejects.toThrow()
      await expect(connection.query(`INSERT INTO company_rule_applications (id,company_id,rule_set_id,rule_version_id,effective_from,effective_to)
        VALUES ($1,$2,$3,$4,'2027-01-01','2027-12-31')`, [randomUUID(), companyId, ruleSetId, versionId])).rejects.toThrow()
      await expect(connection.query(`INSERT INTO rule_artifact_versions (id,rule_version_id,kind,version,repository_locator,content_sha256,metadata)
        VALUES ($1,$2,'CONFIG','bad','repo://bad','not-a-hash','{}'::jsonb)`, [randomUUID(), versionId])).rejects.toThrow()
      await expect(connection.query('UPDATE rule_versions SET version=\'changed\' WHERE id=$1', [versionId])).rejects.toThrow()
      await expect(connection.query('DELETE FROM rule_artifact_versions WHERE rule_version_id=$1', [versionId])).rejects.toThrow()
      const artifactColumns = (await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='rule_artifact_versions' ORDER BY ordinal_position")).rows.map((row: any) => row.column_name)
      expect(artifactColumns).toEqual(['id', 'rule_version_id', 'kind', 'version', 'repository_locator', 'content_sha256', 'metadata', 'created_at'])
      evidence.ruleUpgradePreservesAllLegacyRows = true; evidence.ruleVersionIntegrity = true; evidence.ruleArtifactReferenceOnly = true
    } finally { connection.release(); await pool.end(); await admin.$executeRawUnsafe(`DROP DATABASE "${ownedName}"`) }
  }, 30000)
  it('seeds twice without duplicates, credentials or active sessions', async () => {
    const before = await counts()
    expect(before).toEqual({ companies: 2, users: 2, memberships: 2, roles: 5, sessions: 0, fiscalYears: 2, templates: 1, templateItems: 2, accounts: 4 })
    seed()
    expect(await counts()).toEqual(before)
    const users = await client.user.findMany()
    expect(users.every(user => user.passwordHash === null && user.disabledAt !== null)).toBe(true)
    expect((await client.accountTemplate.findMany()).every(template => template.isDevelopmentOnly)).toBe(true)
    evidence.seedCounts = before
    evidence.seedRepeatPreserved = true
  }, 30000)
  it.each([
    { NODE_ENV: 'production', ATMS_ALLOW_DEV_SEED: '1' },
    { NODE_ENV: 'test', ATMS_ALLOW_DEV_SEED: '0' },
    { NODE_ENV: 'test', ATMS_ALLOW_DEV_SEED: '1', useOriginalDatabase: true },
  ])('rejects unsafe seed before any writes: %j', async options => {
    const before = await counts()
    const result = spawnSync(process.execPath, [tsxCli, 'prisma/seed.ts'], {
      cwd: server, env: { ...process.env, NODE_ENV: options.NODE_ENV, ATMS_ALLOW_DEV_SEED: options.ATMS_ALLOW_DEV_SEED,
        DATABASE_URL: options.useOriginalDatabase ? process.env.DATABASE_URL : testUrl },
      encoding: 'utf8', timeout: 30000,
    })
    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toContain('Development seed failed')
    expect(`${result.stdout}${result.stderr}`).not.toContain(new URL(testUrl).password)
    expect(await counts()).toEqual(before)
  })
  it('rejects cross-company role links and duplicate memberships/roles', async () => {
    const membership = await client.companyMembership.findFirstOrThrow({ where: { companyId: companyA } })
    await expect(client.companyMemberRole.create({ data: { companyId: companyB, membershipId: membership.id, role: 'ACCOUNTANT' } })).rejects.toThrow()
    await expect(client.companyMemberRole.create({ data: { companyId: companyA, membershipId: membership.id, role: 'ACCOUNTANT' } })).rejects.toThrow()
    await expect(client.companyMembership.create({ data: { companyId: companyA, userId: membership.userId } })).rejects.toThrow()
  })
  it('rejects foreign currency and self-approval defaults to false', async () => {
    await expect(client.company.create({ data: { name: 'Invalid currency', currency: 'USD' } })).rejects.toThrow()
    expect((await client.company.findUniqueOrThrow({ where: { id: companyA } })).allowSelfApproval).toBe(false)
  })
  it('rejects normalized email duplicates and active accounts without password hashes', async () => {
    await expect(client.user.create({ data: { email: 'A@EXAMPLE.INVALID', emailNormalized: 'a@example.invalid', disabledAt: new Date() } })).rejects.toThrow()
    await expect(client.user.create({ data: { email: 'new@example.invalid', emailNormalized: 'new@example.invalid' } })).rejects.toThrow()
    await expect(client.user.create({ data: { email: 'lower@example.invalid', emailNormalized: 'UPPER@example.invalid', disabledAt: new Date() } })).rejects.toThrow()
  })
  it('allows separate company periods and rejects overlaps or date inversion', async () => {
    const company = await client.company.create({ data: { name: 'Period boundary test' } })
    for (const [start, end] of [['2025-01-01', '2025-12-31'], ['2026-01-01', '2026-12-31']]) {
      await client.fiscalYear.create({ data: { companyId: company.id, startDate: new Date(start), endDate: new Date(end) } })
    }
    await expect(client.fiscalYear.create({ data: { companyId: company.id, startDate: new Date('2025-12-31'), endDate: new Date('2026-01-01') } })).rejects.toThrow()
    await expect(client.fiscalYear.create({ data: { companyId: company.id, startDate: new Date('2028-12-31'), endDate: new Date('2028-01-01') } })).rejects.toThrow()
  })
  it('preserves referenced company/template records and account uniqueness', async () => {
    await expect(client.company.delete({ where: { id: companyA } })).rejects.toThrow()
    const item = await client.accountTemplateItem.findFirstOrThrow()
    await expect(client.accountTemplateItem.delete({ where: { id: item.id } })).rejects.toThrow()
    await expect(client.companyAccount.create({ data: { companyId: companyA, code: '1100', name: 'Duplicate' } })).rejects.toThrow()
    // 같은 코드는 다른 회사에 존재할 수 있다. seed의 A/B 계정이 별도 레코드임을 확인한다.
    expect(await client.companyAccount.count({ where: { code: '1100' } })).toBe(2)
  })
  it('stores only token hashes and rejects invalid session time ordering', async () => {
    const user = await client.user.findFirstOrThrow()
    const data = { userId: user.id, tokenHash: 'a'.repeat(64), createdAt: new Date('2026-01-01T00:00:00Z'),
      lastActivityAt: new Date('2026-01-01T00:00:00Z'), idleExpiresAt: new Date('2026-01-01T01:00:00Z'), absoluteExpiresAt: new Date('2026-01-01T08:00:00Z') }
    await client.userSession.create({ data })
    await expect(client.userSession.create({ data })).rejects.toThrow()
    await expect(client.userSession.create({ data: { ...data, tokenHash: 'g'.repeat(64) } })).rejects.toThrow()
    await expect(client.userSession.create({ data: { ...data, tokenHash: 'b'.repeat(64), idleExpiresAt: new Date('2026-01-01T09:00:00Z') } })).rejects.toThrow()
  })
  it('rolls back the entire transaction on an invalid business row', async () => {
    const id = randomUUID()
    await expect(client.$transaction(async tx => {
      await tx.company.create({ data: { id, name: 'Must roll back' } })
      await tx.fiscalYear.create({ data: { companyId: id, startDate: new Date('2026-12-31'), endDate: new Date('2026-01-01') } })
    })).rejects.toThrow()
    expect(await client.company.findUnique({ where: { id } })).toBeNull()
  })
  it('round-trips NUMERIC(24,6) exactly and rejects excessive scale before DB coercion', async () => {
    await client.$transaction(async tx => {
      await tx.$executeRaw`CREATE TEMPORARY TABLE money_verify (amount NUMERIC(24,6)) ON COMMIT DROP`
      for (const input of ['9007199254740993', '999999999999999999.999999', '-0.123456']) {
        await tx.$executeRaw`INSERT INTO money_verify(amount) VALUES (${serializeAmount(assertStorable(parseAmount(input)))}::numeric)`
      }
      const rows = await tx.$queryRaw<{ amount: PrismaDecimal }[]>`SELECT amount FROM money_verify`
      expect(rows.map(row => row.amount.toFixed())).toEqual(['9007199254740993', '999999999999999999.999999', '-0.123456'])
      expect(() => parseAmount('1.1234567')).toThrow(MoneyError)
      // DB 자체는 초과 소수를 반올림하므로 원문 검사가 저장 전에 필요하다는 실제 동작 확인.
      const coercion = await tx.$queryRaw<{ value: PrismaDecimal }[]>`SELECT 1.1234567::numeric(24,6) AS value`
      expect(coercion[0].value.toFixed()).toBe('1.123457')
    })
    evidence.numericRoundTrip = true
  })
  it('K8 applies the posting migration with exact enum, table, constraints and audit contract', async () => {
    const statuses = await client.$queryRaw<{ value: string }[]>`SELECT unnest(enum_range(NULL::"JournalStatus"))::text AS value`
    const actions = await client.$queryRaw<{ value: string }[]>`SELECT unnest(enum_range(NULL::"JournalWorkflowActionKind"))::text AS value`
    expect(statuses.map(row => row.value)).toEqual(['DRAFT','SUBMITTED','APPROVED','REJECTED','POSTED'])
    expect(actions.map(row => row.value)).toEqual(['SUBMIT','APPROVE','REJECT','RETURN_TO_DRAFT','CONFIRM'])
    const constraints = await client.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint
      WHERE conrelid='journal_postings'::regclass ORDER BY conname`
    expect(constraints.map(row => row.conname)).toEqual(expect.arrayContaining([
      'journal_posting_company_journal_key','journal_posting_company_submission_key','journal_posting_company_action_key',
      'journal_posting_journal_fk','journal_posting_submission_fk','journal_posting_action_fk']))
    expect(auditTypesFromMigration('20261007030000_journal_posting_ledger_foundation')).toContain('JOURNAL_POSTED')
    expect(await client.journalPosting.count()).toBe(0)
  })
  it('opening K1/K2 applies the conditional journal kind, source and singleton database contract', async () => {
    const kinds = await client.$queryRaw<{ value: string }[]>`SELECT unnest(enum_range(NULL::"JournalKind"))::text AS value`
    expect(kinds.map(row => row.value)).toEqual(['STANDARD', 'OPENING'])
    expect(auditTypesFromMigration('20261007040000_opening_balance_foundation'))
      .toEqual(expect.arrayContaining(['OPENING_BALANCE_CREATED', 'OPENING_BALANCE_UPDATED']))
    const indexes = await client.$queryRaw<{ indexname: string; indexdef: string }[]>`SELECT indexname,indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename='journal_entries' AND indexname IN
        ('journal_entries_one_opening_per_year','journal_entries_company_kind_year_idx') ORDER BY indexname`
    expect(indexes).toHaveLength(2)
    expect(indexes.find(row => row.indexname === 'journal_entries_one_opening_per_year')?.indexdef)
      .toContain('WHERE (kind = \'OPENING\'::"JournalKind")')
    const functions = await client.$queryRaw<{ name: string }[]>`SELECT proname AS name FROM pg_proc
      WHERE proname IN ('check_journal_draft_integrity','journal_workflow_guard') ORDER BY proname`
    expect(functions.map(row => row.name)).toEqual(['check_journal_draft_integrity', 'journal_workflow_guard'])

    const source = await client.fiscalYear.findFirstOrThrow({ where: { companyId: companyA }, orderBy: { endDate: 'desc' } })
    const target = await client.fiscalYear.create({ data: { companyId: companyA,
      startDate: new Date('2099-01-01'), endDate: new Date('2099-12-31') } })
    const owner = await client.user.findFirstOrThrow()
    const header = { companyId: companyA, fiscalYearId: target.id, kind: 'OPENING' as const,
      openingSourceFiscalYearId: source.id, number: '20990101-990001', accountingDate: target.startDate,
      memo: '기초 잔액', debitTotal: '0', creditTotal: '0', lineCount: 0, evidenceCount: 0,
      createdById: owner.id, creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64) }
    const opening = await client.journalEntry.create({ data: header })
    expect(opening).toMatchObject({ kind: 'OPENING', openingSourceFiscalYearId: source.id, lineCount: 0 })
    await expect(client.journalEntry.create({ data: { ...header, number: '20990101-990002',
      creationRequestId: randomUUID(), creationInputHash: 'b'.repeat(64) } })).rejects.toThrow()
    await expect(client.journalEntry.create({ data: { ...header, id: randomUUID(), kind: 'STANDARD',
      openingSourceFiscalYearId: null, number: '20990101-990003', creationRequestId: randomUUID(),
      creationInputHash: 'c'.repeat(64) } })).rejects.toThrow()
    await expect(client.journalEntry.update({ where: { id: opening.id }, data: { accountingDate: new Date('2099-01-02') } })).rejects.toThrow()
  })
  // [F04 J7/K3] 직접 SQL/Prisma 경로에서도 커밋 시 실제 분개와 헤더를 대조한다.
  it('K3 enforces deferred journal balance, positions and integer amounts while allowing a full draft replacement', async () => {
    const year = await client.fiscalYear.findFirstOrThrow({ where: { companyId: companyA } }), owner = await client.user.findFirstOrThrow()
    const account = await client.companyAccount.findFirstOrThrow({ where: { companyId: companyA } })
    const id = randomUUID(), prefix = year.startDate.toISOString().slice(0,10).replaceAll('-','')
    const header = { id, companyId: companyA, fiscalYearId: year.id, number: prefix + '-990001', accountingDate: year.startDate,
      memo: 'Direct SQL integrity', debitTotal: '10', creditTotal: '10', lineCount: 2, evidenceCount: 0,
      createdById: owner.id, creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64) }
    // 정상 헤더만 저장하고 분개를 누락하면 커밋 자체가 실패한다.
    await expect(client.journalEntry.create({ data: header })).rejects.toThrow()
    expect(await client.journalEntry.findUnique({ where: { id } })).toBeNull()
    await client.$transaction(async tx => {
      await tx.journalEntry.create({ data: header })
      await tx.journalLine.createMany({ data: [{ companyId: companyA, journalId: id, accountId: account.id, position: 1, debit: '10', credit: '0' },
        { companyId: companyA, journalId: id, accountId: account.id, position: 2, debit: '0', credit: '10' }] })
    })
    const before = await client.journalLine.findMany({ where: { journalId: id }, orderBy: { position: 'asc' } })
    for (const sql of [
      "UPDATE journal_lines SET debit=11 WHERE journal_id=$1::uuid AND position=1",
      "UPDATE journal_lines SET debit=1.5 WHERE journal_id=$1::uuid AND position=1",
      "UPDATE journal_lines SET credit=1 WHERE journal_id=$1::uuid AND position=1",
      "UPDATE journal_lines SET position=3 WHERE journal_id=$1::uuid AND position=2",
      "UPDATE journal_entries SET evidence_count=1 WHERE id=$1::uuid",
    ]) await expect(client.$transaction(tx => tx.$executeRawUnsafe(sql, id))).rejects.toThrow()
    expect(await client.journalLine.findMany({ where: { journalId: id }, orderBy: { position: 'asc' } })).toEqual(before)
    // 중간에 행0개가 되어도 최종2행/합계가 맞으면 승인한 DRAFT 전체 교체를 허용한다.
    await client.$transaction(async tx => {
      await tx.journalLine.deleteMany({ where: { journalId: id } })
      await tx.journalEntry.update({ where: { id }, data: { debitTotal: '20', creditTotal: '20', version: 2 } })
      await tx.journalLine.createMany({ data: [{ companyId: companyA, journalId: id, accountId: account.id, position: 1, debit: '20', credit: '0' },
        { companyId: companyA, journalId: id, accountId: account.id, position: 2, debit: '0', credit: '20' }] })
    })
    expect((await client.journalEntry.findUniqueOrThrow({ where: { id } })).debitTotal.toFixed()).toBe('20')
    const triggers = await client.$queryRaw<{ name: string; deferred: boolean; initially: boolean }[]>`SELECT tgname AS name,tgdeferrable AS deferred,tginitdeferred AS initially FROM pg_trigger WHERE tgname IN ('journal_header_integrity','journal_line_integrity','journal_evidence_integrity') ORDER BY tgname`
    expect(triggers).toHaveLength(3); expect(triggers.every(t => t.deferred && t.initially)).toBe(true)
    evidence.journalDeferredIntegrity = true
  })
  it('K3 rejects cross-company journal references and invalid currency, date, sequence or stored status', async () => {
    const year = await client.fiscalYear.findFirstOrThrow({ where: { companyId: companyA } }), owner = await client.user.findFirstOrThrow()
    const account = await client.companyAccount.findFirstOrThrow({ where: { companyId: companyB } })
    const id = randomUUID(), prefix = year.startDate.toISOString().slice(0,10).replaceAll('-','')
    const header = { id, companyId: companyA, fiscalYearId: year.id, number: prefix + '-990002', accountingDate: year.startDate,
      memo: 'Cross company', debitTotal: '1', creditTotal: '1', lineCount: 2, evidenceCount: 0,
      createdById: owner.id, creationRequestId: randomUUID(), creationInputHash: 'a'.repeat(64) }
    await expect(client.$transaction(async tx => {
      await tx.journalEntry.create({ data: header })
      await tx.journalLine.create({ data: { companyId: companyA, journalId: id, accountId: account.id, position: 1, debit: '1', credit: '0' } })
    })).rejects.toThrow()
    for (const invalid of [{ currency: 'USD' }, { version: 0 }, { number: prefix + '-000000' }, { debitTotal: '1.5', creditTotal: '1.5' }])
      await expect(client.journalEntry.create({ data: { ...header, ...invalid } })).rejects.toThrow()
    for (const lastNumber of [0,1000000]) await expect(client.journalNumberSequence.create({ data: { companyId: companyA, fiscalYearId: year.id, lastNumber } })).rejects.toThrow()
    expect(await client.journalEntry.findUnique({ where: { id } })).toBeNull()
  })
  it('K7 preserves all pre-journal tables and historical audit types when applying only the approved additive migration', async () => {
    const { Pool } = require('pg'), ownedName = `atms_verify_journal_upgrade_${randomBytes(8).toString('hex')}`
    if (!/^atms_verify_journal_upgrade_[a-f0-9]{16}$/.test(ownedName)) throw new Error('Invalid owned journal upgrade database')
    await admin.$executeRawUnsafe(`CREATE DATABASE "${ownedName}"`)
    const url = new URL(testUrl); url.pathname = '/' + ownedName
    const pool = new Pool({ connectionString: url.toString(), max: 1 }), connection = await pool.connect()
    const migration = '20261007010000_journal_draft_foundation'
    try {
      for (const name of readdirSync(resolve(server, 'prisma/migrations')).filter(name => /^\d{14}_/.test(name) && name < migration).sort())
        await connection.query(readFileSync(resolve(server, `prisma/migrations/${name}/migration.sql`), 'utf8'))
      const id = randomUUID(); await connection.query("INSERT INTO companies(id,name,updated_at) VALUES($1,'Preserved before journal',now())", [id])
      const tables: string[] = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((r: any) => r.tablename)
      const snapshot = async () => {
        const values: Record<string, unknown> = {}
        for (const table of tables) {
          if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid known table')
          values[table] = (await connection.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows
        }
        return values
      }
      const before = await snapshot(); await connection.query(readFileSync(resolve(server, `prisma/migrations/${migration}/migration.sql`), 'utf8'))
      expect(await snapshot()).toEqual(before)
      const newTables = (await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'journal_%' ORDER BY tablename")).rows.map((r: any) => r.tablename)
      expect(newTables).toEqual(['journal_entries','journal_evidences','journal_lines','journal_number_sequences'])
      const historical = auditTypesFromMigration('20261007000000_company_accounts_foundation')
      for (const type of historical.concat(['JOURNAL_DRAFT_CREATED','JOURNAL_DRAFT_UPDATED']))
        await connection.query("INSERT INTO audit_events(id,type,request_id,details) VALUES($1,$2,$3,'{}')", [randomUUID(),type,randomUUID()])
      evidence.journalUpgradeLegacyTables = tables.length; evidence.journalUpgradePreservedRows = true; evidence.journalAddedTables = 4
    } finally { connection.release(); await pool.end(); await admin.$executeRawUnsafe(`DROP DATABASE "${ownedName}"`) }
  }, 30000)
})
