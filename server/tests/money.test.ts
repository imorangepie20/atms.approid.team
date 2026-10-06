import { createRequire } from 'node:module'
import { Body, Controller, Module, Post, type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { z } from 'zod'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { Prisma } = require('../dist/generated/prisma/client.js') as typeof import('../src/generated/prisma/client')
const { MONEY_CONFIG } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')
const { parseAmount, parseWon, addAmounts, multiplyAmounts, divideAmounts, assertStorable, finalizeWon, serializeAmount, MoneyError } =
  require('../dist/common/money.js') as typeof import('../src/common/money')
const { amountStringSchema, wonStringSchema } = require('../dist/common/money.schema.js') as typeof import('../src/common/money.schema')
const { configureApp } = require('../dist/configure-app.js') as typeof import('../src/configure-app')
const { readAppConfig } = require('../dist/config/app.config.js') as typeof import('../src/config/app.config')

// 기존 API 테스트를 변경하지 않고 새 공통 스키마가 실제 HTTP 파이프에서도 작동하는지 확인한다.
const schema = z.strictObject({ amount: amountStringSchema })
const accepted = vi.fn()
@Controller('money-contract')
class MoneyFixtureController {
  @Post()
  accept(@Body({ schema }) body: { amount: string }) { accepted(body); return body }
}
@Module({ controllers: [MoneyFixtureController] })
class MoneyFixtureModule {}
let app: INestApplication
let url: string
beforeAll(async () => {
  app = await NestFactory.create(MoneyFixtureModule, { logger: false })
  configureApp(app, readAppConfig({}))
  await app.listen(0, '127.0.0.1')
  url = await app.getUrl()
})
beforeEach(() => accepted.mockClear())
afterAll(async () => { if (app) await app.close() })

// [F08-12 검증] 실제 배포 코드에서 돈의 정밀도·입력·저장 경계를 확인한다.
describe('money contract', () => {
  it('passes a large decimal string through actual HTTP without Number coercion', async () => {
    const response = await fetch(`${url}/api/money-contract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: '9007199254740993.123456' }) })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ amount: '9007199254740993.123456' })
    expect(accepted).toHaveBeenCalledOnce()
  })
  it.each([10, '1.1234567', '1000000000000000000'])('rejects invalid money at HTTP boundary before handler: %s', async amount => {
    const response = await fetch(`${url}/api/money-contract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('VALIDATION_ERROR')
    expect(accepted).not.toHaveBeenCalled()
  })
  it.each(['0', '-0', '1234', '-1234', '0.123456', '999999999999999999.999999', '-999999999999999999.999999'])('accepts decimal string %s', input => {
    expect(amountStringSchema.safeParse(input).success).toBe(true)
    expect(assertStorable(parseAmount(input)).isFinite()).toBe(true)
  })
  it.each([1, NaN, Infinity, null, '', ' 1', '1 ', '1e3', 'NaN', 'Infinity', '1,000', '+1', '01', '.1', '1.'])('rejects non-contract input %s', input => {
    expect(() => parseAmount(input)).toThrow(MoneyError)
    expect(amountStringSchema.safeParse(input).success).toBe(false)
  })
  it.each(['1.1234567', '1.0000000', '1000000000000000000', '-1000000000000000000'])('rejects scale or range overflow %s', input => {
    expect(() => parseAmount(input)).toThrow(MoneyError)
  })
  it('requires whole-won journal input; schema preserves source strings', () => {
    expect(wonStringSchema.parse('9007199254740993')).toBe('9007199254740993')
    expect(parseWon('9007199254740993').toFixed()).toBe('9007199254740993')
    expect(() => parseWon('1.0')).toThrow(MoneyError)
    expect(wonStringSchema.safeParse('1.0').success).toBe(false)
  })
  it('adds 0.1 and 0.2 exactly without mutating operands', () => {
    const left = parseAmount('0.1'), right = parseAmount('0.2')
    expect(serializeAmount(addAmounts(left, right))).toBe('0.3')
    expect(left.toFixed()).toBe('0.1')
  })
  it('keeps full multiplication precision until explicit finalization', () => {
    const value = multiplyAmounts(parseAmount('0.123456'), parseAmount('0.123456'))
    expect(value.toFixed()).toBe('0.015241383936')
    expect(() => serializeAmount(value)).toThrow(MoneyError)
    expect(serializeAmount(finalizeWon(value, 'general'))).toBe('0')
  })
  it.each([['123.5', '124'], ['-123.5', '-124'], ['123.499999', '123'], ['-123.499999', '-123'], ['0.5', '1'], ['-0.5', '-1']])('rounds general final amount %s to %s', (input, output) => {
    expect(serializeAmount(finalizeWon(parseAmount(input), 'general'))).toBe(output)
  })
  it('does not silently round output or overflowing sums', () => {
    const sum = addAmounts(parseAmount('999999999999999999.999999'), parseAmount('0.000001'))
    expect(() => serializeAmount(sum)).toThrow(MoneyError)
    expect(() => finalizeWon(parseAmount('999999999999999999.5'), 'general')).toThrow(MoneyError)
    expect(serializeAmount(parseAmount('1.123456'))).toBe('1.123456')
  })
  it('preserves large integers and emits ordinary decimal strings', () => {
    expect(serializeAmount(parseAmount('9007199254740993'))).toBe('9007199254740993')
    expect(serializeAmount(parseAmount('0.000001'))).toBe('0.000001')
    expect(serializeAmount(parseAmount('-0'))).toBe('0')
  })
  it('supports division without intermediate won rounding and rejects zero divisors', () => {
    expect(divideAmounts(parseWon('1'), parseWon('3')).toFixed()).toMatch(/^0\.3{80}$/)
    expect(() => divideAmounts(parseWon('1'), parseWon('0'))).toThrow(MoneyError)
    expect(serializeAmount(divideAmounts(parseWon('1'), parseWon('2')))).toBe('0.5')
  })
  it('rejects non-finite intermediate Decimal values', () => {
    expect(() => assertStorable(new Prisma.Decimal('NaN'))).toThrow(MoneyError)
    expect(() => assertStorable(new Prisma.Decimal('Infinity'))).toThrow(MoneyError)
  })
  it('requires tax rule execution; never defaults tax or missing purpose to general rounding', () => {
    expect(() => finalizeWon(parseAmount('123.5'), 'tax')).toThrow(MoneyError)
    expect(() => finalizeWon(parseAmount('123.5'), undefined as never)).toThrow(MoneyError)
  })
  it('uses central settings without mutating global Prisma Decimal precision', () => {
    expect(MONEY_CONFIG.storagePrecision).toBe(24)
    expect(MONEY_CONFIG.storageScale).toBe(6)
    expect(MONEY_CONFIG.calculationPrecision).toBe(80)
    const precision = Prisma.Decimal.precision
    multiplyAmounts(parseAmount('123.123456'), parseAmount('123.123456'))
    expect(Prisma.Decimal.precision).toBe(precision)
  })
})
