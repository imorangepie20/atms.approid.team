import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AsyncState from '../common/AsyncState'
import Button from '../common/Button'
import JournalReferencePicker, { journalInputClass } from './JournalReferencePicker'
import { wonDisplay } from '../../lib/journalDraftForm'
import { ledgerApi, type FiscalYearView, type JournalBookFilters } from '../../lib/api'

interface Props { companyId: string; userId: string; years: FiscalYearView[]; locked: boolean; onAccessError: (error: unknown) => void }
const initial: JournalBookFilters = { limit: 20 }
const utc = (value: string) => value ? new Date(value).toISOString() : undefined

// [F04 B5] 분개장은 POSTED 전표의 서버 정렬·합계·cursor를 그대로 표시한다. 회계일자와 확정시각을 섞지 않는다.
export default function JournalBook({ companyId, userId, years, locked, onAccessError }: Props) {
    const [draft, setDraft] = useState(initial), [postedLocal, setPostedLocal] = useState(''), [filters, setFilters] = useState(initial), [cursors, setCursors] = useState<string[]>([])
    const cursor = cursors[cursors.length - 1]
    const query = useQuery({ queryKey: ['journal-book', userId, companyId, filters, cursor ?? null],
        queryFn: ({ signal }) => ledgerApi.journalBook(companyId, filters, cursor, signal) })
    useEffect(() => { if (query.error) onAccessError(query.error) }, [query.error, onAccessError])
    const apply = () => { setFilters({ ...draft, q: draft.q?.trim() || undefined, postedThrough: utc(postedLocal) }); setCursors([]) }
    const rows = query.data?.items ?? []
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0 space-y-4" aria-labelledby="journal-book-title">
        <div><h2 id="journal-book-title" className="text-xl font-semibold">분개장</h2><p className="mt-2 text-sm text-hud-text-muted">장부에 반영된 POSTED 분개만 조회합니다. 회계일자와 확정시각은 별도 조건입니다.</p></div>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={event => { event.preventDefault(); apply() }}>
            <div><label className="mb-2 block" htmlFor="book-year">회계연도</label><select id="book-year" className={journalInputClass} value={draft.fiscalYearId ?? ''} disabled={locked} onChange={event => setDraft(value => ({ ...value, fiscalYearId: event.target.value || undefined }))}><option value="">전체 연도</option>{years.map(year => <option key={year.id} value={year.id}>{year.startDate} ~ {year.endDate}</option>)}</select></div>
            <div><label className="mb-2 block" htmlFor="book-from">회계일자 시작</label><input id="book-from" type="date" className={journalInputClass} value={draft.from ?? ''} disabled={locked} onChange={event => setDraft(value => ({ ...value, from: event.target.value || undefined }))} /></div>
            <div><label className="mb-2 block" htmlFor="book-to">회계일자 종료</label><input id="book-to" type="date" className={journalInputClass} value={draft.to ?? ''} disabled={locked} onChange={event => setDraft(value => ({ ...value, to: event.target.value || undefined }))} /></div>
            <div><label className="mb-2 block" htmlFor="book-posted">확정시각 상한 (현재 시간대)</label><input id="book-posted" type="datetime-local" step="1" className={journalInputClass} value={postedLocal} disabled={locked} onChange={event => setPostedLocal(event.target.value)} /></div>
            <div><label className="mb-2 block" htmlFor="book-q">전표 번호·적요 검색</label><input id="book-q" className={journalInputClass} value={draft.q ?? ''} disabled={locked} onChange={event => setDraft(value => ({ ...value, q: event.target.value }))} /></div>
            <JournalReferencePicker kind="account" id="book-account" label="계정 필터" companyId={companyId} userId={userId} selected={draft.accountId ? [draft.accountId] : []} locked={locked} onAccessError={onAccessError} onChange={ids => setDraft(value => ({ ...value, accountId: ids[0] }))} />
            <div className="flex items-end gap-2"><Button type="submit" className="min-h-11" disabled={locked || query.isFetching}>조회</Button><Button type="button" variant="ghost" className="min-h-11" disabled={locked} onClick={() => { setDraft(initial); setPostedLocal(''); setFilters(initial); setCursors([]) }}>조건 초기화</Button></div>
        </form>
        {query.isPending ? <AsyncState kind="loading" title="분개장을 불러오는 중입니다" description="POSTED 분개와 합계를 확인합니다." /> : query.isError ? <AsyncState kind="error" title="분개장을 불러오지 못했습니다" description="조회 조건과 회사 권한을 확인해 주세요." onRetry={() => void query.refetch()} /> : <>
            <div role="status" className="rounded-lg border border-hud-border-secondary p-3 text-sm">차변 {wonDisplay(query.data.totals.debit)} · 대변 {wonDisplay(query.data.totals.credit)} · 순액 {wonDisplay(query.data.totals.net)}</div>
            {!rows.length ? <AsyncState kind="empty" title="조회된 POSTED 분개가 없습니다" description="확정 상태와 조회 조건을 확인해 주세요." /> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-hud-border-secondary text-left"><th className="p-2">회계일자</th><th className="p-2">확정시각 UTC</th><th className="p-2">전표</th><th className="p-2">계정</th><th className="p-2 text-right">차변</th><th className="p-2 text-right">대변</th><th className="p-2">적요</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-hud-border-secondary align-top"><td className="p-2">{row.accountingDate}</td><td className="p-2 break-all">{row.postedAt}</td><td className="p-2"><Link className="underline" to={`/accounting/journals?companyId=${encodeURIComponent(companyId)}&journalId=${encodeURIComponent(row.journalId)}`}>{row.journalNumber}</Link></td><td className="p-2">{row.account.code} · {row.account.name}</td><td className="p-2 text-right tabular-nums">{wonDisplay(row.debit)}</td><td className="p-2 text-right tabular-nums">{wonDisplay(row.credit)}</td><td className="p-2 break-words">{row.lineMemo || row.journalMemo}</td></tr>)}</tbody></table></div>}
            <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={locked || !cursors.length} onClick={() => setCursors(value => value.slice(0, -1))}>이전</Button><span>페이지 {cursors.length + 1}</span><Button type="button" variant="outline" className="min-h-11" disabled={locked || !query.data.nextCursor} onClick={() => { if (query.data.nextCursor) setCursors(value => [...value, query.data.nextCursor!]) }}>다음</Button><Button type="button" variant="ghost" className="min-h-11" disabled={locked || query.isFetching} onClick={() => void query.refetch()}>현재 조건 다시 조회</Button></div>
        </>}
    </section>
}
