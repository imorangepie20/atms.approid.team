import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { addAmounts, assertStorable, parseWon, serializeAmount } from '../common/money'
import type { JournalContentInput } from './journals.schemas'

// [J3/J6] 순수 정규화 함수. 금액은 Decimal로만 합산하고 0/-0 표현은 같은 "0"으로 저장한다.
// 증빙은 집합이므로 정렬, 분개는 입력 순서가 업무 의미를 가지므로 정렬하지 않는다.
export function normalizeJournal(input: JournalContentInput) {
  let debitTotal = parseWon('0'), creditTotal = parseWon('0')
  const lines = input.lines.map((line, index) => {
    const debit = parseWon(line.debit), credit = parseWon(line.credit)
    if (debit.lt(0) || credit.lt(0) || (debit.gt(0) === credit.gt(0))) throw new BadRequestException()
    debitTotal = assertStorable(addAmounts(debitTotal, debit)); creditTotal = assertStorable(addAmounts(creditTotal, credit))
    return { position: index + 1, accountId: line.accountId, debit: serializeAmount(debit), credit: serializeAmount(credit), memo: line.memo }
  })
  if (!debitTotal.gt(0) || !debitTotal.equals(creditTotal)) throw new BadRequestException()
  return { accountingDate: input.accountingDate, memo: input.memo, counterpartyId: input.counterpartyId,
    evidenceIds: [...input.evidenceIds].sort(), lines, debitTotal: serializeAmount(debitTotal), creditTotal: serializeAmount(creditTotal) }
}
export type NormalizedJournal = ReturnType<typeof normalizeJournal>
// [J6] 최초 정규화 내용만 해시한다. HTTP requestId/처리자/현재 version은 최초 입력에 섞지 않는다.
export function journalCreationHash(fiscalYearId: string, content: NormalizedJournal): string {
  return createHash('sha256').update(JSON.stringify({ fiscalYearId, ...content })).digest('hex')
}
