import { z } from 'zod'
import { MoneyError, parseAmount, parseWon } from './money'

/* [F08-12 추가] HTTP Body/Query 스키마 안에서 재사용하는 금액 문자열 검증.
 * Decimal로 변환하지 않고 원문 문자열을 유지한다. 컨트롤러의 업무 계산 때 money.ts를 호출한다.
 * NestJS 내장 파이프가 실패 시 메서드 실행을 차단하고 F08-10의 안전한 오류로 응답한다.
 */
function valid(input: string, parse: (value: unknown) => unknown): boolean {
  try { parse(input); return true }
  catch (error) { if (error instanceof MoneyError) return false; throw error }
}

export const amountStringSchema = z.string().refine(value => valid(value, parseAmount), {
  message: '금액의 형식과 허용 범위를 확인해 주세요.',
})
export const wonStringSchema = z.string().refine(value => valid(value, parseWon), {
  message: '원 단위 정수 금액을 입력해 주세요.',
})
