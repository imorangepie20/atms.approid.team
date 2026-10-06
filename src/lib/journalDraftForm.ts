import { z } from 'zod'
import type { FiscalYearView, JournalContent, JournalDetailView } from './api'

// [B4] BigInt는 원 단위 정수 계산에만 사용한다. 서버로는 문자열을 보내며 반올림/자동 보정은 없다.
const ceiling = 10n ** 18n
export const validText = (value: string, max: number) => [...value].length <= max && !value.includes('\0') &&
    [...value].every(ch => { const cp = ch.codePointAt(0)!; return cp < 0xd800 || cp > 0xdfff })
// [B4/K6] UUID는 서버 식별 형식이다. 사용자에게는 기술 용어 대신 올바른 항목 선택을 안내한다.
export const journalUuid = z.string().uuid('올바른 항목을 선택해 주세요.').transform(value => value.toLowerCase())
export function won(value: string): bigint {
    if (!/^-?(?:0|[1-9]\d*)$/.test(value) || value.replace(/^-/, '').length > 18) throw new Error('원 단위 정수 금액을 입력해 주세요.')
    const parsed = BigInt(value)
    if (parsed < 0n || parsed >= ceiling) throw new Error('금액은0 이상, 정수부18자리 이내로 입력해 주세요.')
    return parsed
}
export const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const memo = z.string().transform(value => value.trim()).refine(value => value.length > 0 && validText(value, 500), '적요는 올바른 문자로1~500자에 입력해 주세요.')
const amount = z.string().refine(value => { try { won(value); return true } catch { return false } }, '원 단위 금액의 형식과18자리 범위를 확인해 주세요.').transform(value => won(value).toString())
const line = z.strictObject({ accountId: journalUuid, debit: amount, credit: amount,
    memo: z.string().transform(value => value.trim()).refine(value => validText(value, 500), '행 메모는500자 이내의 올바른 문자로 입력해 주세요.').transform(value => value || null) })
const schema = z.strictObject({ fiscalYearId: journalUuid, accountingDate: z.string().refine(validDate, '올바른 회계일자를 선택해 주세요.'), memo,
    counterpartyId: journalUuid.nullable(), evidenceIds: z.array(journalUuid).max(20, '증빙은 최대20개입니다.').refine(ids => new Set(ids).size === ids.length, '중복 증빙을 선택할 수 없습니다.'),
    lines: z.array(line).min(2, '분개는 최소2행입니다.').max(100, '분개는 최대100행입니다.') })
export interface JournalDraftValues { fiscalYearId: string; accountingDate: string; memo: string; counterpartyId: string | null; evidenceIds: string[]; lines: { accountId: string; debit: string; credit: string; memo: string }[] }
export type DraftErrors = { path: string; message: string }[]
export function draftValues(row?: JournalDetailView): JournalDraftValues {
    return row ? { fiscalYearId: row.fiscalYearId, accountingDate: row.accountingDate, memo: row.memo, counterpartyId: row.counterpartyId,
        evidenceIds: [...row.evidenceIds], lines: row.lines.map(l => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo ?? '' })) }
        : { fiscalYearId: '', accountingDate: '', memo: '', counterpartyId: null, evidenceIds: [], lines: Array.from({ length: 2 }, () => ({ accountId: '', debit: '0', credit: '0', memo: '' })) }
}
export function journalTotals(lines: { debit: string; credit: string }[]) {
    try { let debit = 0n, credit = 0n; for (const l of lines) { debit += won(l.debit); credit += won(l.credit) }
        return { debit: debit.toString(), credit: credit.toString(), difference: (debit - credit).toString(), overflow: debit >= ceiling || credit >= ceiling }
    } catch { return null }
}
export function normalizeJournalDraft(values: JournalDraftValues, years: FiscalYearView[]): { fiscalYearId: string; content: JournalContent; errors: [] } | { errors: DraftErrors } {
    const result = schema.safeParse(values)
    if (!result.success) return { errors: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }
    const { fiscalYearId, ...content } = result.data, errors: DraftErrors = []
    const year = years.find(y => y.id === fiscalYearId)
    if (!year) errors.push({ path: 'fiscalYearId', message: '현재 회사의 회계연도를 선택해 주세요.' })
    else if (content.accountingDate < year.startDate || content.accountingDate > year.endDate) errors.push({ path: 'accountingDate', message: '선택한 회계연도 안의 날짜를 입력해 주세요.' })
    content.lines.forEach((l, i) => { if ((won(l.debit) > 0n) === (won(l.credit) > 0n)) errors.push({ path: `lines.${i}.debit`, message: `${i + 1}행은 차변/대변 한쪽만 양수로 입력해 주세요.` }) })
    const totals = journalTotals(content.lines)!
    if (totals.overflow || totals.debit === '0' || totals.difference !== '0') errors.push({ path: 'lines', message: '합계는18자리 이내의 양수이며 차변과 대변이 같아야 합니다.' })
    if (errors.length) return { errors }
    // 입력 순서는 보존하고 증빙 집합만 정렬한다. 내부 행 키/번호/작성자/상태는 이 본문에 없다.
    content.evidenceIds.sort()
    return { fiscalYearId, content, errors: [] }
}
export const journalFieldId = (path: string) => `j-${path.replace(/\./g, '-')}`
export function wonDisplay(value: string) { return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원' }
