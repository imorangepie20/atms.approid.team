import { BadRequestException } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client'
import { MONEY_CONFIG } from '../config/app.config'

/* [F08-12 추가: 정확한 금액 처리]
 * Number로 장부 계산을 하지 않는다. 입력 검사 → Decimal 연산 → 명시적 최종 반올림
 * → 저장 범위 검사 → 10진수 문자열 출력 순서다. 오류에 입력 원문을 붙이지 않는다.
 * clone은 Prisma의 전역 Decimal 설정을 바꾸지 않는 독립 계산 컨텍스트다.
 */
const Decimal = Prisma.Decimal.clone({
  precision: MONEY_CONFIG.calculationPrecision, rounding: Prisma.Decimal.ROUND_HALF_UP,
})
export type Money = Prisma.Decimal

export class MoneyError extends BadRequestException {
  constructor(readonly reason: 'FORMAT' | 'SCALE' | 'RANGE' | 'NON_FINITE' | 'DIVISION_BY_ZERO' | 'TAX_RULE_REQUIRED') {
    super('금액의 형식과 허용 범위를 확인해 주세요.')
  }
}

function parseDecimal(input: unknown, scale: number): Money {
  // 일반 10진수 문자열만 허용한다. 부호는 음수의 -만, 정수부의 불필요한 선행 0은 허용하지 않는다.
  // 원문 소수 자릿수를 검사해 1.0000000처럼 Decimal 변환 후 0이 사라지는 초과 입력도 거부한다.
  if (typeof input !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(input)) throw new MoneyError('FORMAT')
  const unsigned = input.startsWith('-') ? input.slice(1) : input
  const [integer, fraction = ''] = unsigned.split('.')
  if (fraction.length > scale) throw new MoneyError('SCALE')
  if (integer.length > MONEY_CONFIG.integerDigits) throw new MoneyError('RANGE')
  return new Decimal(input)
}

export function parseAmount(input: unknown): Money {
  return parseDecimal(input, MONEY_CONFIG.inputScale)
}

export function parseWon(input: unknown): Money {
  return parseDecimal(input, MONEY_CONFIG.journalScale)
}

function finite(value: Money): Money {
  if (!Prisma.Decimal.isDecimal(value) || !value.isFinite()) throw new MoneyError('NON_FINITE')
  return new Decimal(value)
}

export function addAmounts(left: Money, right: Money): Money {
  return finite(left).plus(finite(right))
}
export function multiplyAmounts(left: Money, right: Money): Money {
  return finite(left).times(finite(right))
}
export function divideAmounts(left: Money, right: Money): Money {
  const divisor = finite(right)
  if (divisor.isZero()) throw new MoneyError('DIVISION_BY_ZERO')
  return finite(left).dividedBy(divisor)
}

export function assertStorable(value: Money): Money {
  const amount = finite(value)
  // NUMERIC(24,6) 실제 범위: 절댓값이 10^18 미만이고 소수 6자리 이하다.
  // 큰 중간 합계·산출값을 잘라 저장하거나 자동 반올림하지 않는다.
  if (amount.abs().gte(new Decimal(10).pow(MONEY_CONFIG.integerDigits))) throw new MoneyError('RANGE')
  if (amount.decimalPlaces() > MONEY_CONFIG.storageScale) throw new MoneyError('SCALE')
  return amount
}

export function finalizeWon(value: Money, purpose: 'general' | 'tax'): Money {
  // 호출자가 계산 목적을 반드시 명시한다. 세무 규칙 실행기가 없는 현재 단계에서는
  // tax 요청을 거부한다. 일반 HALF_UP을 세무 계산에 몰래 대입하지 않는다.
  if (purpose !== 'general') throw new MoneyError('TAX_RULE_REQUIRED')
  return assertStorable(finite(value).toDecimalPlaces(MONEY_CONFIG.journalScale, Decimal.ROUND_HALF_UP))
}

export function serializeAmount(value: Money): string {
  const amount = assertStorable(value)
  // toFixed는 지수 표기를 하지 않는다. 사전 검사한 자릿수 그대로 출력하므로 추가 반올림이 없다.
  return amount.toFixed(amount.decimalPlaces())
}
