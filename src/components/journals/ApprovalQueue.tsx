import { useState } from 'react'
import Button from '../common/Button'
import { journalInputClass } from './JournalReferencePicker'
import { validDate, validText, wonDisplay } from '../../lib/journalDraftForm'
import type { FiscalYearView, JournalApprovalFilters, JournalSummary } from '../../lib/api'

interface Props {
    rows: JournalSummary[]; years: FiscalYearView[]; filters: JournalApprovalFilters
    locked: boolean; fetching: boolean; previous: boolean; next: boolean; page: number
    onFilters: (filters: JournalApprovalFilters) => void; onSelect: (id: string) => void
    onPrevious: () => void; onNext: () => void; onRefresh: () => void
}

// [F05 A3 승인 목록] 서버 cursor와 회계일자 필터를 그대로 사용한다. 필터 적용 때 부모가 첫 페이지로 돌린다.
export default function ApprovalQueue({ rows, years, filters, locked, fetching, previous, next, page, onFilters, onSelect, onPrevious, onNext, onRefresh }: Props) {
    const [q, setQ] = useState(filters.q ?? ''), [year, setYear] = useState(filters.fiscalYearId ?? '')
    const [from, setFrom] = useState(filters.from ?? ''), [to, setTo] = useState(filters.to ?? '')
    const [status, setStatus] = useState(filters.status), [limit, setLimit] = useState(filters.limit ?? 20)
    const [error, setError] = useState('')
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0" aria-labelledby="approval-queue-title">
        <h2 id="approval-queue-title" className="text-xl font-semibold">승인 전표 목록</h2>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" noValidate onSubmit={event => {
            event.preventDefault(); const search = q.trim()
            if (!validText(search, 100) || (from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
                setError('검색어 100자 이내와 올바른 회계일자 순서를 확인해 주세요.'); return
            }
            setError(''); onFilters({ status, limit, ...(search ? { q: search } : {}), ...(year ? { fiscalYearId: year } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) })
        }}>
            <div><label htmlFor="approval-status" className="mb-2 block">승인 상태</label><select id="approval-status" className={journalInputClass} disabled={locked} value={status} onChange={event => setStatus(event.target.value as JournalApprovalFilters['status'])}><option value="SUBMITTED">승인 대기</option><option value="APPROVED">승인 완료</option><option value="REJECTED">반려</option></select></div>
            <div><label htmlFor="approval-limit" className="mb-2 block">페이지 크기</label><select id="approval-limit" className={journalInputClass} disabled={locked} value={limit} onChange={event => setLimit(Number(event.target.value))}><option value={20}>20개</option><option value={50}>50개</option><option value={100}>100개</option></select></div>
            <div><label htmlFor="approval-search" className="mb-2 block">번호·적요 검색</label><input id="approval-search" className={journalInputClass} disabled={locked} value={q} onChange={event => setQ(event.target.value)} /></div>
            <div><label htmlFor="approval-year" className="mb-2 block">회계연도</label><select id="approval-year" className={journalInputClass} disabled={locked} value={year} onChange={event => setYear(event.target.value)}><option value="">전체 회계연도</option>{years.map(item => <option key={item.id} value={item.id}>{item.startDate} ~ {item.endDate}</option>)}</select></div>
            <div><label htmlFor="approval-from" className="mb-2 block">회계일자 시작</label><input id="approval-from" type="date" className={journalInputClass} disabled={locked} value={from} onChange={event => setFrom(event.target.value)} /></div>
            <div><label htmlFor="approval-to" className="mb-2 block">회계일자 종료</label><input id="approval-to" type="date" className={journalInputClass} disabled={locked} value={to} onChange={event => setTo(event.target.value)} /></div>
            <div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={locked}>조건 적용</Button><Button type="button" variant="outline" className="min-h-11" disabled={locked || fetching} onClick={onRefresh}>목록 새로 조회</Button></div>
        </form>
        {error && <p role="alert" className="mt-3 text-hud-accent-danger">{error}</p>}
        {fetching && <p role="status" className="mt-3">승인 목록 확인 중…</p>}
        {!rows.length && !fetching && <p className="mt-4 text-hud-text-muted">조건과 일치하는 승인 전표가 없습니다.</p>}
        <ul className="mt-4 space-y-3">{rows.map(row => <li key={row.id} className="min-w-0 rounded-lg border border-hud-border-secondary p-3"><Button type="button" variant="ghost" className="min-h-11 w-full justify-start break-all text-left" disabled={locked} onClick={() => onSelect(row.id)}>{row.number} · {row.memo} 상세</Button><p className="mt-1 text-sm break-words">{row.status === 'SUBMITTED' ? '승인 대기' : row.status === 'APPROVED' ? '승인 완료' : '반려'} · 회계일자 {row.accountingDate} · 차변 {wonDisplay(row.debitTotal)} · 대변 {wonDisplay(row.creditTotal)}</p><p className="text-sm text-hud-text-muted">분개 {row.lineCount}행 · 증빙 {row.evidenceCount}개 · 버전 {row.version}</p></li>)}</ul>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" variant="outline" className="min-h-11" disabled={locked || fetching || !previous} onClick={onPrevious}>이전 페이지</Button><span>{page}페이지</span><Button type="button" variant="outline" className="min-h-11" disabled={locked || fetching || !next} onClick={onNext}>다음 페이지</Button></div>
    </section>
}
