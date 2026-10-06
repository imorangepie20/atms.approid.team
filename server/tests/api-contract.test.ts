import 'reflect-metadata'
import { createRequire } from 'node:module'
import { Body, Controller, Get, HttpException, Module, Param, Post, Query, type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/* [F08-10 검증 추가]
 * npm test는 먼저 서버 전체를 빌드한다. 아래 require는 실제 배포될 dist 코드를 읽는다.
 * 테스트 전용 컨트롤러는 이 파일에만 존재한다. 운영 경로나 업무 DB 스키마를 추가하지 않는다.
 * 실제 HealthController에 DB 대역을 주입해 네트워크·민감정보 실패 흐름을 재현한다.
 */
const require = createRequire(import.meta.url)
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const { HealthController } = require('../dist/health.controller.js') as typeof import('../src/health.controller')
const { PrismaService } = require('../dist/prisma.service.js') as typeof import('../src/prisma.service')
const { HealthModule } = require('../dist/health.module.js') as typeof import('../src/health.module')
const { CompaniesModule } = require('../dist/companies/companies.module.js') as typeof import('../src/companies/companies.module')
const { RulesModule } = require('../dist/rules/rules.module.js') as typeof import('../src/rules/rules.module')
// [F02 재개 수리] 승인된 거래처 모듈도 루트의 실제 연결 계약에 포함한다.
const { CounterpartiesModule } = require('../dist/counterparties/counterparties.module.js') as typeof import('../src/counterparties/counterparties.module')
// [F03 모듈 연결 회귀] 승인된 증빙 서버 모듈이 실제 루트에 등록됐는지 확인한다.
const { EvidenceModule } = require('../dist/evidence/evidence.module.js') as typeof import('../src/evidence/evidence.module')
// [F04-01 연결 회귀] 실제 루트가 새 계정 모듈을 등록하되 기존 모듈 순서는 유지한다.
const { AccountsModule } = require('../dist/accounts/accounts.module.js') as typeof import('../src/accounts/accounts.module')
// [F04 J1/J8] 승인된 초안/증빙 역조회 모듈까지 실제 루트 계약으로 확인한다.
const { JournalsModule } = require('../dist/journals/journals.module.js') as typeof import('../src/journals/journals.module')
const { JournalWorkflowController } = require('../dist/journals/journal-workflow.controller.js') as typeof import('../src/journals/journal-workflow.controller')
const { JournalWorkflowService } = require('../dist/journals/journal-workflow.service.js') as typeof import('../src/journals/journal-workflow.service')
const { LedgerController } = require('../dist/journals/ledger.controller.js') as typeof import('../src/journals/ledger.controller')
const { LedgerService } = require('../dist/journals/ledger.service.js') as typeof import('../src/journals/ledger.service')
const { OpeningBalanceController } = require('../dist/journals/opening-balance.controller.js') as typeof import('../src/journals/opening-balance.controller')
const { OpeningBalanceService } = require('../dist/journals/opening-balance.service.js') as typeof import('../src/journals/opening-balance.service')
const { AppModule } = require('../dist/app.module.js') as typeof import('../src/app.module')
const { AuthModule } = require('../dist/auth/auth.module.js') as typeof import('../src/auth/auth.module')
const { DatabaseModule } = require('../dist/database.module.js') as typeof import('../src/database.module')

const secret = 'RAW_INPUT_SECRET_DO_NOT_EXPOSE'
const accepted = vi.fn()
const database = { $queryRaw: vi.fn() }
const bodySchema = z.strictObject({ name: z.string().min(1), amount: z.string().regex(/^\d+$/) })
  .refine(value => value.name !== secret, { message: secret, path: ['name'] })
const querySchema = z.strictObject({ search: z.string().min(1) })
const paramSchema = z.strictObject({ id: z.uuid() })

@Controller('contract')
class ContractFixtureController {
  @Post('body')
  body(@Body({ schema: bodySchema }) body: z.infer<typeof bodySchema>) {
    accepted(body)
    return body
  }

  @Get('query')
  query(@Query({ schema: querySchema }) query: z.infer<typeof querySchema>) {
    accepted(query)
    return query
  }

  @Get('item/:id')
  item(@Param({ schema: paramSchema }) params: z.infer<typeof paramSchema>) {
    accepted(params)
    return params
  }

  @Get('http-error/:status')
  httpError(@Param('status') status: string) {
    // 내부 메시지·임의 details를 가진 HttpException도 그대로 응답에 복사하면 안 된다.
    throw new HttpException({ message: secret, details: [{ password: secret }] }, Number(status))
  }

  @Get('failure')
  failure() { throw new Error(secret) }
}

@Module({
  controllers: [HealthController, ContractFixtureController],
  providers: [{ provide: PrismaService, useValue: database }],
})
class ContractFixtureModule {}

let app: INestApplication
let baseUrl: string

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  return { status: response.status, headers: response.headers, text, body: JSON.parse(text) }
}

async function post(body: unknown) {
  return request('/api/contract/body', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

function expectError(response: Awaited<ReturnType<typeof request>>, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(Object.keys(response.body).sort()).toEqual(['code', 'details', 'message'])
  expect(response.body.code).toBe(code)
  expect(typeof response.body.message).toBe('string')
  expect(Array.isArray(response.body.details)).toBe(true)
  expect(response.headers.get('content-type')).toContain('application/json')
}

beforeAll(async () => {
  app = await NestFactory.create(ContractFixtureModule, { logger: false })
  const config = readAppConfig({})
  configureApp(app, config)
  // 테스트만 운영 포트 대신 OS가 배정한 빈 포트(0)를 사용한다. 운영 설정은 변경하지 않는다.
  await app.listen(0, config.host)
  baseUrl = await app.getUrl()
})
beforeEach(() => {
  accepted.mockClear()
  database.$queryRaw.mockReset().mockResolvedValue([{ result: 1 }])
})
afterAll(async () => { if (app) await app.close() })

describe('F08-10 HTTP contract', () => {
  it('preserves health liveness and Helmet headers without querying DB', async () => {
    const response = await request('/api/health/live')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', service: 'atms-api' })
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(database.$queryRaw).not.toHaveBeenCalled()
  })

  it('preserves successful DB readiness response', async () => {
    const response = await request('/api/health/ready')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', database: 'up' })
    expect(database.$queryRaw).toHaveBeenCalledOnce()
  })

  it('passes valid body and preserves decimal strings without Number coercion', async () => {
    const input = { name: '검증 예시', amount: '9007199254740993' }
    const response = await post(input)
    expect(response.status).toBe(201)
    expect(response.body).toEqual(input)
    expect(accepted).toHaveBeenCalledExactlyOnceWith(input)
  })

  it.each([
    ['missing field', { amount: '10' }],
    ['empty field', { name: '', amount: '10' }],
    ['wrong name type', { name: 10, amount: '10' }],
    ['numeric amount', { name: 'A', amount: 10 }],
    ['unknown field', { name: 'A', amount: '10', unexpected: true }],
    ['wrong whole body', ['A', '10']],
  ])('rejects %s before handler execution', async (_description, input) => {
    const response = await post(input)
    expectError(response, 400, 'VALIDATION_ERROR')
    expect(response.body.details.length).toBeGreaterThan(0)
    expect(accepted).not.toHaveBeenCalled()
  })

  it('passes valid query to handler', async () => {
    const response = await request('/api/contract/query?search=ledger')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ search: 'ledger' })
    expect(accepted).toHaveBeenCalledExactlyOnceWith({ search: 'ledger' })
  })
  it.each(['', '?search=', '?search=a&extra=b', '?search=a&search=b'])('rejects invalid query %s', async query => {
    expectError(await request(`/api/contract/query${query}`), 400, 'VALIDATION_ERROR')
    expect(accepted).not.toHaveBeenCalled()
  })

  it('passes valid path to handler', async () => {
    const id = 'b8d6b57d-dd1f-4f83-b1bc-d874ba1932d8'
    const response = await request(`/api/contract/item/${id}`)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id })
    expect(accepted).toHaveBeenCalledExactlyOnceWith({ id })
  })
  it('rejects invalid path before handler execution', async () => {
    expectError(await request('/api/contract/item/invalid-id'), 400, 'VALIDATION_ERROR')
    expect(accepted).not.toHaveBeenCalled()
  })

  it('security: hides raw validation message, value and unknown field name', async () => {
    const response = await post({ name: secret, amount: '10', [secret]: secret })
    expectError(response, 400, 'VALIDATION_ERROR')
    expect(response.text).not.toContain(secret)
    expect(accepted).not.toHaveBeenCalled()
    const customMessage = await post({ name: secret, amount: '10' })
    expect(customMessage.body.details).toEqual([{ field: 'name', message: '값의 형식이나 범위를 확인해 주세요.' }])
    expect(customMessage.text).not.toContain(secret)
  })
  it('security: rejects malformed JSON without leaking parser input', async () => {
    const response = await request('/api/contract/body', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `{"name":"${secret}",`,
    })
    expectError(response, 400, 'BAD_REQUEST')
    expect(response.body.details).toEqual([])
    expect(response.text).not.toContain(secret)
    expect(accepted).not.toHaveBeenCalled()
  })
  it('security: returns 404 without copying URL, query or token', async () => {
    const response = await request(`/api/missing/${secret}?token=${secret}`)
    expectError(response, 404, 'NOT_FOUND')
    expect(response.text).not.toContain(secret)
    expect(response.body.details).toEqual([])
  })
  it('security: returns DB readiness 503 without connection details', async () => {
    database.$queryRaw.mockRejectedValue(new Error(`postgresql://${secret}@database/private`))
    const response = await request('/api/health/ready')
    expectError(response, 503, 'SERVICE_UNAVAILABLE')
    expect(response.text).not.toMatch(/postgresql|private|RAW_INPUT_SECRET/)
    expect(response.body.details).toEqual([])
  })
  it('security: returns 500 without error message or stack', async () => {
    const response = await request('/api/contract/failure')
    expectError(response, 500, 'INTERNAL_ERROR')
    expect(response.text).not.toMatch(/RAW_INPUT_SECRET|stack|Error:|api-contract/)
    expect(response.body.details).toEqual([])
  })
  it.each([
    [400, 'BAD_REQUEST'], [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [409, 'CONFLICT'],
    [413, 'PAYLOAD_TOO_LARGE'], [429, 'TOO_MANY_REQUESTS'], [422, 'HTTP_ERROR'],
  ])('security: preserves HTTP %s with safe %s response', async (status, code) => {
    const response = await request(`/api/contract/http-error/${status}`)
    expectError(response, status, code)
    expect(response.text).not.toContain(secret)
    expect(response.body.details).toEqual([])
  })
  it('rejects oversized JSON with 413 before handler', async () => {
    const response = await post({ name: 'x'.repeat(110 * 1024), amount: '10' })
    expectError(response, 413, 'PAYLOAD_TOO_LARGE')
    expect(accepted).not.toHaveBeenCalled()
  })
  it('applies /api prefix; unprefixed health is unavailable', async () => {
    expectError(await request('/health/live'), 404, 'NOT_FOUND')
  })
  it.each(['/api', '/api/'])('returns a common 404 for empty API resource %s', async path => {
    expectError(await request(path), 404, 'NOT_FOUND')
  })
  it.each(['/health/live', '/missing'])('security: hides query token outside API prefix %s', async path => {
    const response = await request(`${path}?token=${secret}`)
    expectError(response, 404, 'NOT_FOUND')
    expect(response.text).not.toContain(secret)
  })
})

describe('F08-10 configuration and module wiring', () => {
  it('F05 K2 wires confirmation and both ledger reads with explicit permissions', () => {
    expect(Reflect.getMetadata('controllers', JournalsModule)).toContain(JournalWorkflowController)
    expect(Reflect.getMetadata('providers', JournalsModule)).toContain(JournalWorkflowService)
    for (const [method, path, permission] of [
      ['list','journal-approval-requests','journal.read'], ['detail','journals/:journalId/workflow','journal.read'],
      ['submit','journals/:journalId/submit','journal.request'], ['approve','journals/:journalId/approve','journal.approve'],
      ['reject','journals/:journalId/reject','journal.approve'], ['returnToDraft','journals/:journalId/return-to-draft','journal.draft'],
      ['confirm','journals/:journalId/confirm','journal.confirm'],
    ]) {
      const handler = (JournalWorkflowController.prototype as unknown as Record<string, (...args: unknown[]) => unknown>)[method]
      expect(Reflect.getMetadata('path', handler)).toBe(path)
      expect(Reflect.getMetadata('atms.permission', handler)).toBe(permission)
    }
    expect(Reflect.getMetadata('controllers', JournalsModule)).toContain(LedgerController)
    expect(Reflect.getMetadata('providers', JournalsModule)).toContain(LedgerService)
    for (const [method, path] of [['journalBook','journal-book'], ['accountLedger','accounts/:accountId']]) {
      const handler = (LedgerController.prototype as unknown as Record<string, (...args: unknown[]) => unknown>)[method]
      expect(Reflect.getMetadata('path', handler)).toBe(path)
      expect(Reflect.getMetadata('atms.permission', handler)).toBe('journal.read')
    }
    expect(Reflect.getMetadata('controllers', JournalsModule)).toContain(OpeningBalanceController)
    expect(Reflect.getMetadata('providers', JournalsModule)).toContain(OpeningBalanceService)
    expect(Reflect.getMetadata('path', OpeningBalanceController)).toBe('companies/:companyId/fiscal-years/:fiscalYearId/opening-balance')
    for (const [method, requestMethod, permission] of [
      ['get', 0, 'journal.read'], ['create', 1, 'journal.draft'], ['update', 4, 'journal.draft'],
    ] as const) {
      const handler = (OpeningBalanceController.prototype as unknown as Record<string, (...args: unknown[]) => unknown>)[method]
      expect(Reflect.getMetadata('path', handler)).toBe('/')
      expect(Reflect.getMetadata('method', handler)).toBe(requestMethod)
      expect(Reflect.getMetadata('atms.permission', handler)).toBe(permission)
    }
  })
  it('uses a single configuration source with unchanged defaults', () => {
    expect(readAppConfig({})).toEqual({ port: 4300, host: '127.0.0.1', apiPrefix: 'api' })
    expect(Object.isFrozen(readAppConfig({}))).toBe(true)
    expect(readAppConfig({ PORT: '4500', HOST: '0.0.0.0' })).toEqual({ port: 4500, host: '0.0.0.0', apiPrefix: 'api' })
  })
  it.each(['', 'abc', '0', '-1', '1.5', '65536', 'Infinity'])('rejects invalid PORT %s', port => {
    expect(() => readAppConfig({ PORT: port })).toThrow('Invalid PORT')
  })
  it('rejects blank host without echoing the input', () => {
    expect(() => readAppConfig({ HOST: '   ' })).toThrow('Invalid HOST')
  })
  it('connects root → feature modules → existing controller and Prisma provider', () => {
    // [F13-01~03 수정] 읽기 전용 규칙 모듈까지 루트 연결 계약에 포함한다.
    expect(Reflect.getMetadata('imports', AppModule)).toEqual([HealthModule, AuthModule, CompaniesModule, RulesModule, CounterpartiesModule, EvidenceModule, AccountsModule, JournalsModule])
    expect(Reflect.getMetadata('controllers', HealthModule)).toEqual([HealthController])
    expect(Reflect.getMetadata('imports', HealthModule)).toEqual([DatabaseModule])
    expect(Reflect.getMetadata('providers', DatabaseModule)).toEqual([PrismaService])
    expect(Reflect.getMetadata('exports', DatabaseModule)).toEqual([PrismaService])
    expect(Reflect.getMetadata('design:paramtypes', HealthController)).toEqual([PrismaService])
  })
})
