import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AsyncState from '../common/AsyncState'
import Button from '../common/Button'
import { journalInputClass } from './JournalReferencePicker'
import { wonDisplay } from '../../lib/journalDraftForm'
import { accountApi, ledgerApi, type AccountLedgerFilters, type FiscalYearView } from '../../lib/api'

interface Props { companyId: string; userId: string; years: FiscalYearView[]; locked: boolean; onAccessError: (error: unknown) => void }
type Draft = { accountId: string; fiscalYearId: string; from?: string; to?: string; q?: string }
const utc = (value: string) => value ? new Date(value).toISOString() : undefined
const statusName = { MISSING: '기초 잔액 미등록', CONFIRMED_ZERO: '0원 기초 잔액 확정', POSTED: '기초 잔액 장부 반영' }

// [F04 B6] 계정별 원장은 중지 계정도 과거 조회에 포함하고 기초·이월·당기·기말을 서버 계산 그대로 구분한다.
export default function AccountLedger({ companyId, userId, years, locked, onAccessError }: Props) {
    const [draft, setDraft] = useState<Draft>({ accountId: '', fiscalYearId: '' }), [postedLocal, setPostedLocal] = useState('')
    const [selection, setSelection] = useState<{ accountId: string; filters: AccountLedgerFilters } | null>(null), [cursors, setCursors] = useState<string[]>([])
    const cursor = cursors[cursors.length - 1]
    const accounts = useInfiniteQuery({ queryKey: ['ledger-accounts', userId, companyId], initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => accountApi.list(companyId, { active: 'all' }, pageParam, signal), getNextPageParam: page => page.nextCursor ?? undefined })
    const query = useQuery({ queryKey: ['account-ledger', userId, companyId, selection, cursor ?? null], enabled: Boolean(selection),
        queryFn: ({ signal }) => ledgerApi.account(companyId, selection!.accountId, selection!.filters, cursor, signal) })
    useEffect(() => { const failure = accounts.error ?? query.error; if (failure) onAccessError(failure) }, [accounts.error, query.error, onAccessError])
    const accountItems = accounts.data?.pages.flatMap(page => page.items) ?? [], rows = query.data?.items ?? []
    const apply = () => {
        if (!draft.accountId || !draft.fiscalYearId) return
        setSelection({ accountId: draft.accountId, filters: { fiscalYearId: draft.fiscalYearId, from: draft.from || undefined,
            to: draft.to || undefined, q: draft.q?.trim() || undefined, postedThrough: utc(postedLocal), limit: 20 } }); setCursors([])
    }
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0 space-y-4" aria-labelledby="account-ledger-title">
        <div><h2 id="account-ledger-title" className="text-xl font-semibold">계정별 원장</h2><p className="mt-2 text-sm text-hud-text-muted">기초 잔액, 조회 시작 전 이월, 당기 움직임과 기말 잔액을 구분합니다.</p></div>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={event => { event.preventDefault(); apply() }}>
            <div><label className="mb-2 block" htmlFor="ledger-year">회계연도 (필수)</label><select id="ledger-year" className={journalInputClass} required value={draft.fiscalYearId} disabled={locked} onChange={event => setDraft(value => ({ ...value, fiscalYearId: event.target.value }))}><option value="">회계연도 선택</option>{years.map(year => <option key={year.id} value={year.id}>{year.startDate} ~ {year.endDate}</option>)}</select></div>
            <div><label className="mb-2 block" htmlFor="ledger-account">계정 (필수, 중지 포함)</label><select id="ledger-account" className={journalInputClass} required value={draft.accountId} disabled={locked || accounts.isPending} onChange={event => setDraft(value => ({ ...value, accountId: event.target.value }))}><option value="">계정 선택</option>{accountItems.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}{!account.active ? ' · 중지' : ''}</option>)}</select>{accounts.hasNextPage && <Button type="button" variant="outline" className="mt-2 min-h-11" disabled={locked || accounts.isFetching} onClick={() => void accounts.fetchNextPage()}>계정 더 불러오기</Button>}</div>
            <div><label className="mb-2 block" htmlFor="ledger-from">회계일자 시작</label><input id="ledger-from" type="date" className={journalInputClass} value={draft.from ?? ''} disabled={locked} onChange={event => setDraft(value => ({ ...value, from: event.target.value || undefined }))} /></div>
            <div><label className="mb-2 block" htmlFor="ledger-to">회계일자 종료</label><input id="ledger-to" type="date" className={journalInputClass} value={draft.to ?? ''} disabled={locked} onChange={event => setDraft(value => ({ ...value, to: event.target.value || undefined }))} /></div>
            <div><label className="mb-2 block" htmlFor="ledger-posted">확정시각 상한 (현재 시간대)</label><input id="ledger-posted" type="datetime-local" step="1" className={journalInputClass} value={postedLocal} disabled={locked} onChange={event => setPostedLocal(event.target.value)} /></div>
            <div><label className="mb-2 block" htmlFor="ledger-q">전표 번호·적요 검색</label><input id="ledger-q" className={journalInputClass} value={draft.q ?? ''} disabled={locked} onChange={event => setDraft(value => ({ ...value, q: event.target.value }))} /></div>
            <div className="flex items-end gap-2"><Button type="submit" className="min-h-11" disabled={locked || !draft.accountId || !draft.fiscalYearId || query.isFetching}>원장 조회</Button><Button type="button" variant="ghost" className="min-h-11" disabled={locked} onClick={() => { setDraft({ accountId: '', fiscalYearId: '' }); setPostedLocal(''); setSelection(null); setCursors([]) }}>조건 초기화</Button></div>
        </form>
        {accounts.isError && <AsyncState kind="error" title="계정 목록을 불러오지 못했습니다" description="회사 권한을 확인해 주세요." onRetry={() => void accounts.refetch()} />}
        {!selection ? <AsyncState kind="empty" title="계정과 회계연도를 선택해 주세요" description="선택한 계정의 기초·이월·당기·기말 잔액을 조회합니다." /> : query.isPending ? <AsyncState kind="loading" title="계정별 원장을 불러오는 중입니다" description="기초와 당기 움직임을 계산합니다." /> : query.isError ? <AsyncState kind="error" title="계정별 원장을 불러오지 못했습니다" description="기간이 회계연도 안인지와 회사 권한을 확인해 주세요." onRetry={() => void query.refetch()} /> : <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm"><div className="rounded-lg border border-hud-border-secondary p-3"><span className="text-hud-text-muted">기초 상태</span><p className="font-semibold">{statusName[query.data.openingBalanceStatus]}</p>{query.data.openingBalanceJournalId && <Link className="underline" to={`/accounting/approvals?companyId=${encodeURIComponent(companyId)}&journalId=${encodeURIComponent(query.data.openingBalanceJournalId)}`}>기초 전표 이력</Link>}</div><div className="rounded-lg border border-hud-border-secondary p-3"><span className="text-hud-text-muted">기초·이월 잔액</span><p className="font-semibold tabular-nums">{wonDisplay(query.data.openingBalance)}</p></div><div className="rounded-lg border border-hud-border-secondary p-3"><span className="text-hud-text-muted">당기 차변 / 대변</span><p className="font-semibold tabular-nums">{wonDisplay(query.data.totals.debit)} / {wonDisplay(query.data.totals.credit)}</p></div><div className="rounded-lg border border-hud-border-secondary p-3"><span className="text-hud-text-muted">기말 잔액</span><p className="font-semibold tabular-nums">{wonDisplay(query.data.closingBalance)}</p></div></div>
            {!rows.length ? <AsyncState kind="empty" title="조회 기간의 당기 움직임이 없습니다" description="기초·이월 및 기말 잔액은 위에서 확인할 수 있습니다." /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-hud-border-secondary text-left"><th className="p-2">회계일자</th><th className="p-2">전표</th><th className="p-2">적요</th><th className="p-2 text-right">차변</th><th className="p-2 text-right">대변</th><th className="p-2 text-right">누적 잔액</th><th className="p-2">확정시각 UTC</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-hud-border-secondary align-top"><td className="p-2">{row.accountingDate}</td><td className="p-2"><Link className="underline" to={`/accounting/journals?companyId=${encodeURIComponent(companyId)}&journalId=${encodeURIComponent(row.journalId)}`}>{row.journalNumber}</Link></td><td className="p-2 break-words">{row.lineMemo || row.journalMemo}</td><td className="p-2 text-right tabular-nums">{wonDisplay(row.debit)}</td><td className="p-2 text-right tabular-nums">{wonDisplay(row.credit)}</td><td className="p-2 text-right tabular-nums">{wonDisplay(row.runningBalance)}</td><td className="p-2 break-all">{row.postedAt}</td></tr>)}</tbody></table></div>}
            <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={locked || !cursors.length} onClick={() => setCursors(value => value.slice(0, -1))}>이전</Button><span>페이지 {cursors.length + 1}</span><Button type="button" variant="outline" className="min-h-11" disabled={locked || !query.data.nextCursor} onClick={() => { if (query.data.nextCursor) setCursors(value => [...value, query.data.nextCursor!]) }}>다음</Button><Button type="button" variant="ghost" className="min-h-11" disabled={locked || query.isFetching} onClick={() => void query.refetch()}>현재 조건 다시 조회</Button></div>
        </>}
    </section>
}
