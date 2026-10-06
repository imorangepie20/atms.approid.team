import { useState, type FormEvent } from 'react'
import Button from '../common/Button'
import type { CounterpartyView, EvidenceFilters, EvidenceKind, EvidenceView } from '../../lib/api'

const kinds: Record<EvidenceKind, string> = { RECEIPT: '영수증', TAX_INVOICE: '세금계산서', OTHER: '기타' }
const field = 'w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'

interface Props {
    items: EvidenceView[]; filters: EvidenceFilters; counterparties: CounterpartyView[]
    selectedId: string; fetching: boolean; failed: boolean; locked: boolean
    previous: boolean; next: boolean; pageNumber: number; moreCounterparties: boolean
    onFilter: (filters: EvidenceFilters) => void; onSelect: (id: string) => void
    onPrevious: () => void; onNext: () => void; onRefresh: () => void; onMoreCounterparties: () => void
}

// [F03 B3/B7] 서버의 제목 검색·분류·거래처·ID cursor만 노출한다. 빈 목록과 조회 오류는 별도 상태다.
export default function EvidenceList(props: Props) {
    const [draftQuery, setDraftQuery] = useState(props.filters.q ?? ''), [queryError, setQueryError] = useState('')
    const search = (event: FormEvent) => {
        event.preventDefault()
        const q = draftQuery.trim()
        if (q && ([...q].length > 100 || /[\x00-\x1f\x7f]/.test(q))) { setQueryError('검색어는 1~100자로 입력해 주세요.'); return }
        setQueryError(''); props.onFilter({ ...props.filters, q: q || undefined })
    }
    const controls = (row: EvidenceView) => <button type="button" onClick={() => props.onSelect(row.id)} disabled={props.locked}
        aria-current={props.selectedId === row.id ? 'true' : undefined}
        className="min-h-11 w-full rounded-lg p-2 text-left font-medium text-hud-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary disabled:opacity-50">
        <span className="block break-words">{row.title}</span><span className="block text-xs text-hud-text-muted">{row.originalFileName}</span>
    </button>
    return <section className="hud-card rounded-xl p-5" aria-labelledby="evidence-list-title">
        <h2 id="evidence-list-title" className="text-lg font-semibold text-hud-text-primary">완료 증빙</h2>
        <form onSubmit={search} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div><label htmlFor="evidence-search" className="mb-1 block text-sm">제목 검색</label>
                <div className="flex gap-2"><input id="evidence-search" type="search" value={draftQuery} disabled={props.locked} onChange={event => setDraftQuery(event.target.value)}
                    aria-invalid={Boolean(queryError)} aria-describedby={queryError ? 'evidence-search-error' : undefined} className={field} />
                    <Button type="submit" disabled={props.locked} className="min-h-11 shrink-0">검색</Button></div>
                {queryError && <p id="evidence-search-error" role="alert" className="text-sm text-hud-accent-danger">{queryError}</p>}
            </div>
            <div><label htmlFor="evidence-kind-filter" className="mb-1 block text-sm">분류</label><select id="evidence-kind-filter" value={props.filters.kind ?? ''} disabled={props.locked}
                onChange={event => props.onFilter({ ...props.filters, kind: (event.target.value || undefined) as EvidenceKind | undefined })} className={field}>
                <option value="">전체</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></div>
            <div><label htmlFor="evidence-counterparty-filter" className="mb-1 block text-sm">거래처</label><select id="evidence-counterparty-filter" value={props.filters.counterpartyId ?? ''} disabled={props.locked}
                onChange={event => props.onFilter({ ...props.filters, counterpartyId: event.target.value || undefined })} className={field}>
                <option value="">전체</option>{props.counterparties.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>{props.moreCounterparties && <Button type="button" variant="ghost" disabled={props.locked} onClick={props.onMoreCounterparties} className="mt-1 min-h-11">거래처 더 불러오기</Button>}</div>
        </form>
        {props.fetching && <p role="status" className="mt-4 text-hud-text-muted">증빙 목록을 불러오는 중…</p>}
        {!props.fetching && !props.failed && props.items.length === 0 && <p role="status" className="mt-5 text-hud-text-muted">조건에 맞는 완료 증빙이 없습니다.</p>}
        {props.items.length > 0 && <>
            <table className="mt-5 hidden w-full table-fixed xl:table"><caption className="sr-only">선택 회사의 완료 증빙 목록</caption><thead><tr className="text-left text-sm text-hud-text-muted"><th scope="col" className="w-1/2 p-2">제목·파일</th><th scope="col" className="p-2">분류</th><th scope="col" className="p-2">발생일</th></tr></thead>
                <tbody>{props.items.map(row => <tr key={row.id} className="border-t border-hud-border-secondary"><td>{controls(row)}</td><td className="p-2">{kinds[row.kind]}</td><td className="p-2">{row.occurredOn ?? '—'}</td></tr>)}</tbody></table>
            <ul className="mt-5 space-y-3 xl:hidden">{props.items.map(row => <li key={row.id} className="rounded-lg border border-hud-border-secondary p-2">{controls(row)}<p className="px-2 text-sm text-hud-text-muted">{kinds[row.kind]} · {row.occurredOn ?? '날짜 없음'}</p></li>)}</ul>
        </>}
        <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="증빙 페이지 이동">
            <Button type="button" variant="outline" disabled={props.locked || props.fetching || !props.previous} onClick={props.onPrevious} className="min-h-11">이전 페이지</Button>
            <span className="text-sm">{props.pageNumber}페이지</span>
            <Button type="button" variant="outline" disabled={props.locked || props.fetching || !props.next} onClick={props.onNext} className="min-h-11">다음 페이지</Button>
            <Button type="button" variant="ghost" disabled={props.locked || props.fetching} onClick={props.onRefresh} className="min-h-11">목록 다시 조회</Button>
        </div>
    </section>
}
