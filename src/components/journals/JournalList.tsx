import { useState } from 'react'
import Button from '../common/Button'
import { journalInputClass } from './JournalReferencePicker'
import { validDate, validText, wonDisplay } from '../../lib/journalDraftForm'
import type { FiscalYearView, JournalFilters, JournalSummary } from '../../lib/api'

interface Props { rows: JournalSummary[]; years: FiscalYearView[]; filters: JournalFilters; locked: boolean; fetching: boolean; previous: boolean; next: boolean; page: number; onFilters: (value: JournalFilters) => void; onSelect: (id: string) => void; onPrevious: () => void; onNext: () => void; onRefresh: () => void }
export default function JournalList({ rows, years, filters, locked, fetching, previous, next, page, onFilters, onSelect, onPrevious, onNext, onRefresh }: Props) {
    const [q, setQ] = useState(filters.q ?? ''), [year, setYear] = useState(filters.fiscalYearId ?? ''), [from, setFrom] = useState(filters.from ?? ''), [to, setTo] = useState(filters.to ?? ''), [error, setError] = useState('')
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0" aria-labelledby="journal-list-title"><h2 id="journal-list-title" className="text-xl font-semibold">전표 초안 목록</h2>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" noValidate onSubmit={e => { e.preventDefault(); const search = q.trim(); if (!validText(search, 100) || (from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) { setError('검색어100자 이내와 올바른 날짜 순서를 확인해 주세요.'); return } setError(''); onFilters({ ...(search ? { q: search } : {}), ...(year ? { fiscalYearId: year } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }) }}>
            <div><label htmlFor="journal-search" className="mb-2 block">번호·적요 검색</label><input id="journal-search" value={q} disabled={locked} onChange={e => setQ(e.target.value)} className={journalInputClass} /></div>
            <div><label htmlFor="journal-year-filter" className="mb-2 block">회계연도 필터</label><select id="journal-year-filter" value={year} disabled={locked} onChange={e => setYear(e.target.value)} className={journalInputClass}><option value="">전체 회계연도</option>{years.map(y => <option key={y.id} value={y.id}>{y.startDate} ~ {y.endDate}</option>)}</select></div>
            <div><label htmlFor="journal-from" className="mb-2 block">회계일자 시작</label><input id="journal-from" type="date" value={from} disabled={locked} onChange={e => setFrom(e.target.value)} className={journalInputClass} /></div>
            <div><label htmlFor="journal-to" className="mb-2 block">회계일자 종료</label><input id="journal-to" type="date" value={to} disabled={locked} onChange={e => setTo(e.target.value)} className={journalInputClass} /></div>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={locked} className="min-h-11">전표 검색</Button><Button type="button" variant="outline" disabled={locked || fetching} className="min-h-11" onClick={onRefresh}>목록 새로 조회</Button></div>
        </form>{error && <p role="alert" className="mt-3 text-hud-accent-danger">{error}</p>}
        {fetching && <p role="status" className="mt-3">전표 목록 확인 중…</p>}
        {!rows.length && !fetching && <p className="mt-4 text-hud-text-muted">{Object.keys(filters).length ? '검색 조건과 일치하는 초안이 없습니다.' : '등록된 전표 초안이 없습니다.'}</p>}
        <ul className="mt-4 space-y-3">{rows.map(row => <li key={row.id} className="min-w-0 rounded-lg border border-hud-border-secondary p-3"><Button type="button" variant="ghost" disabled={locked} className="min-h-11 w-full justify-start break-all text-left" onClick={() => onSelect(row.id)}>{row.number} · {row.memo} 상세</Button><p className="mt-1 text-sm break-words">초안 · {row.accountingDate} · 차변 {wonDisplay(row.debitTotal)} · 대변 {wonDisplay(row.creditTotal)}</p><p className="text-sm text-hud-text-muted">분개 {row.lineCount}행 · 증빙 {row.evidenceCount}개 · 버전 {row.version}</p></li>)}</ul>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" variant="outline" className="min-h-11" disabled={locked || fetching || !previous} onClick={onPrevious}>이전 페이지</Button><span>{page}페이지</span><Button type="button" variant="outline" className="min-h-11" disabled={locked || fetching || !next} onClick={onNext}>다음 페이지</Button></div>
    </section>
}
