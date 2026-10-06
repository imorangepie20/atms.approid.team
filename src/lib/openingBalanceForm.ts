import { journalTotals, journalUuid, validText, won } from './journalDraftForm'
import type { OpeningBalanceContent, OpeningBalanceView } from './api'

// [F04 B3] 화면 전용 0원 확인은 서버 본문에 보내지 않는다. 서버에는 출처·증빙·분개만 전달한다.
export interface OpeningBalanceValues {
    zero: boolean
    zeroConfirmed: boolean
    evidenceIds: string[]
    lines: { accountId: string; debit: string; credit: string; memo: string }[]
}
export type OpeningBalanceErrors = { path: string; message: string }[]
const blankLine = () => ({ accountId: '', debit: '0', credit: '0', memo: '' })

export function openingBalanceValues(row?: OpeningBalanceView): OpeningBalanceValues {
    if (!row) return { zero: false, zeroConfirmed: false, evidenceIds: [], lines: [blankLine(), blankLine()] }
    return { zero: row.isZero, zeroConfirmed: row.isZero, evidenceIds: [...row.evidenceIds],
        lines: row.isZero ? [blankLine(), blankLine()] : row.lines.map(line => ({ accountId: line.accountId,
            debit: line.debit, credit: line.credit, memo: line.memo ?? '' })) }
}

export function normalizeOpeningBalance(values: OpeningBalanceValues, sourceFiscalYearId: string | null):
    { content: OpeningBalanceContent; errors: [] } | { errors: OpeningBalanceErrors } {
    const errors: OpeningBalanceErrors = []
    if (values.zero) {
        if (!values.zeroConfirmed) errors.push({ path: 'zeroConfirmed', message: '0원 기초 잔액임을 확인해 주세요.' })
        return errors.length ? { errors } : { content: { sourceFiscalYearId, evidenceIds: [], lines: [] }, errors: [] }
    }
    if (values.lines.length < 2 || values.lines.length > 100) errors.push({ path: 'lines', message: '분개는 2~100행으로 입력해 주세요.' })
    if (!values.evidenceIds.length || values.evidenceIds.length > 20 || new Set(values.evidenceIds).size !== values.evidenceIds.length)
        errors.push({ path: 'evidenceIds', message: '비영 기초 잔액에는 중복 없는 READY 증빙을 1~20개 연결해 주세요.' })
    const lines: OpeningBalanceContent['lines'] = []
    values.lines.forEach((line, index) => {
        const account = journalUuid.safeParse(line.accountId)
        if (!account.success) errors.push({ path: `lines.${index}.accountId`, message: `${index + 1}행 계정을 선택해 주세요.` })
        let debit = 0n, credit = 0n
        try { debit = won(line.debit) } catch { errors.push({ path: `lines.${index}.debit`, message: `${index + 1}행 차변은 원 단위 정수 18자리 이내로 입력해 주세요.` }) }
        try { credit = won(line.credit) } catch { errors.push({ path: `lines.${index}.credit`, message: `${index + 1}행 대변은 원 단위 정수 18자리 이내로 입력해 주세요.` }) }
        if ((debit > 0n) === (credit > 0n)) errors.push({ path: `lines.${index}.debit`, message: `${index + 1}행은 차변과 대변 중 한쪽만 양수여야 합니다.` })
        const memo = line.memo.trim()
        if (!validText(memo, 500)) errors.push({ path: `lines.${index}.memo`, message: `${index + 1}행 메모는 500자 이내의 올바른 문자로 입력해 주세요.` })
        if (account.success) lines.push({ accountId: account.data, debit: debit.toString(), credit: credit.toString(), memo: memo || null })
    })
    const totals = journalTotals(values.lines)
    if (!totals || totals.overflow || totals.debit === '0' || totals.difference !== '0')
        errors.push({ path: 'lines', message: '기초 잔액 합계는 18자리 이내의 양수이며 차변과 대변이 같아야 합니다.' })
    const evidenceIds = values.evidenceIds.map(value => journalUuid.safeParse(value))
    if (evidenceIds.some(result => !result.success)) errors.push({ path: 'evidenceIds', message: '현재 회사의 증빙을 다시 선택해 주세요.' })
    if (errors.length) return { errors }
    return { content: { sourceFiscalYearId, evidenceIds: evidenceIds.map(result => result.data!).sort(), lines }, errors: [] }
}

export const openingFieldId = (path: string) => `ob-${path.replace(/\./g, '-')}`
