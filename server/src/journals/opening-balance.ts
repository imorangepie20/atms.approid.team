import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { addAmounts, assertStorable, parseWon, serializeAmount } from '../common/money'
import type { OpeningBalanceContentInput } from './opening-balance.schemas'

// [F04-02 O4/O5] 0원은 빈 분개로 명시하고, 비영 잔액은 기존 원 단위·한쪽 금액·균형 규칙을 그대로 쓴다.
export function normalizeOpeningBalance(input: OpeningBalanceContentInput) {
  let debitTotal = parseWon('0'), creditTotal = parseWon('0')
  const lines = input.lines.map((line, index) => {
    const debit = parseWon(line.debit), credit = parseWon(line.credit)
    if (debit.lt(0) || credit.lt(0) || (debit.gt(0) === credit.gt(0))) throw new BadRequestException()
    debitTotal = assertStorable(addAmounts(debitTotal, debit)); creditTotal = assertStorable(addAmounts(creditTotal, credit))
    return { position: index + 1, accountId: line.accountId, debit: serializeAmount(debit),
      credit: serializeAmount(credit), memo: line.memo }
  })
  if (lines.length === 1 || !debitTotal.equals(creditTotal) || (lines.length > 0 && !debitTotal.gt(0))) throw new BadRequestException()
  const evidenceIds = [...input.evidenceIds].sort()
  if (lines.length > 0 && evidenceIds.length === 0) throw new BadRequestException()
  return { sourceFiscalYearId: input.sourceFiscalYearId, evidenceIds, lines,
    debitTotal: serializeAmount(debitTotal), creditTotal: serializeAmount(creditTotal), isZero: lines.length === 0 }
}

export type NormalizedOpeningBalance = ReturnType<typeof normalizeOpeningBalance>

export function openingBalanceCreationHash(fiscalYearId: string, content: NormalizedOpeningBalance): string {
  return createHash('sha256').update(JSON.stringify({ fiscalYearId, ...content })).digest('hex')
}
