import { useState, type FormEvent } from 'react'
import Button from '../common/Button'
import type { CounterpartyFilters, CounterpartyKind, CounterpartyView } from '../../lib/api'
import { kindLabels } from './CounterpartyForm'

interface Props {
    items: CounterpartyView[]
    filters: CounterpartyFilters
    locked: boolean
    fetching: boolean
    failed: boolean
    pageNumber: number
    previous: boolean
    next: boolean
    selectedId: string
    onFilter: (filters: CounterpartyFilters) => void
    onSelect: (id: string) => void
    onPrevious: () => void
    onNext: () => void
    onRefresh: () => void
}
// [F02 T2/T7] 검색/구분/상태는 서버 조건이다. 받은20행에만 필터를 거는 것으로 대체하지 않는다.
export default function CounterpartyList(props: Props) {
    const [query, setQuery] = useState(props.filters.q ?? '')
    const [queryError, setQueryError] = useState('')
    const search = (event: FormEvent) => {
        event.preventDefault()
        const q = query.trim()
        if ([...q].length > 100 || q.includes('\0') || [...q].some(char => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff)) {
            setQueryError('검색어는 올바른 문자로100자 이내에 입력해 주세요.'); return
        }
        setQueryError(''); props.onFilter({ ...props.filters, q: q || undefined })
    }
    const controls = (row: CounterpartyView) => <Button type="button" variant="ghost" className="min-h-11 break-all text-left" disabled={props.locked} aria-pressed={props.selectedId === row.id} onClick={() => props.onSelect(row.id)}>{row.name} 상세</Button>
    return <section className="hud-card rounded-xl p-4 min-w-0" aria-labelledby="counterparty-list-title">
        <h2 id="counterparty-list-title" className="text-xl font-semibold">거래처 목록</h2>
        <form onSubmit={search} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label htmlFor="counterparty-search" className="mb-2 block text-sm font-medium">거래처 검색</label>
                <div className="flex gap-2"><input id="counterparty-search" type="search" value={query} disabled={props.locked} onChange={event => setQuery(event.target.value)}
                    aria-invalid={Boolean(queryError)} aria-describedby={queryError ? 'counterparty-query-error' : undefined} placeholder="이름 또는 사업자번호"
                    className="w-full min-w-0 min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" />
                    <Button type="submit" disabled={props.locked} className="min-h-11 shrink-0">검색</Button></div>
                {queryError && <p id="counterparty-query-error" role="alert" className="mt-2 text-sm text-hud-accent-danger">{queryError}</p>}
            </div>
            <div><label htmlFor="counterparty-kind-filter" className="mb-2 block text-sm font-medium">구분 필터</label><select id="counterparty-kind-filter" value={props.filters.kind ?? ''} disabled={props.locked}
                onChange={event => props.onFilter({ ...props.filters, kind: (event.target.value || undefined) as CounterpartyKind | undefined })}
                className="w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">
                <option value="">전체</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></div>
            <div><label htmlFor="counterparty-active-filter" className="mb-2 block text-sm font-medium">사용 상태</label><select id="counterparty-active-filter" value={props.filters.active} disabled={props.locked}
                onChange={event => props.onFilter({ ...props.filters, active: event.target.value as CounterpartyFilters['active'] })}
                className="w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">
                <option value="active">사용중</option><option value="inactive">중지</option><option value="all">전체</option>
            </select></div>
        </form>
        {props.fetching && <p role="status" className="mt-3 text-sm text-hud-text-muted">거래처 목록 갱신 중…</p>}
        {/* [T6 수정] 조회 중/실패를 빈 데이터로 표시하지 않는다. 성공한 빈 응답만 빈 상태이다. */}
        {props.items.length === 0 ? !props.fetching && !props.failed && <p role="status" className="mt-5 text-hud-text-muted">{props.filters.q || props.filters.kind || props.filters.active !== 'active' ? '검색 조건과 일치하는 거래처가 없습니다.' : '등록된 사용중 거래처가 없습니다.'}</p> : <>
            <table className="mt-5 hidden w-full table-fixed xl:table"><caption className="sr-only">선택 회사의 거래처 목록</caption><thead><tr className="text-left text-sm text-hud-text-muted"><th scope="col" className="w-1/2 p-2">이름·상세</th><th scope="col" className="p-2">구분</th><th scope="col" className="p-2">사업자번호</th><th scope="col" className="p-2">상태</th></tr></thead>
                <tbody>{props.items.map(row => <tr key={row.id} className="border-t border-hud-border-secondary"><td className="p-1">{controls(row)}</td><td className="p-2">{kindLabels[row.kind]}</td><td className="p-2 break-all">{row.businessNumber ?? '—'}</td><td className="p-2">{row.active ? '사용중' : '중지'}</td></tr>)}</tbody>
            </table>
            <ul className="mt-5 space-y-3 xl:hidden">{props.items.map(row => <li key={row.id} className="rounded-lg border border-hud-border-secondary p-3 break-words">{controls(row)}<p className="mt-1 text-sm text-hud-text-muted">{kindLabels[row.kind]} · {row.active ? '사용중' : '중지'} · {row.businessNumber ?? '번호 없음'}</p></li>)}</ul>
        </>}
        <div className="mt-5 flex flex-wrap items-center gap-3" aria-label="거래처 페이지 이동">
            <Button type="button" variant="outline" disabled={props.locked || props.fetching || !props.previous} onClick={props.onPrevious} className="min-h-11">이전 페이지</Button>
            <span className="text-sm">{props.pageNumber}페이지</span>
            <Button type="button" variant="outline" disabled={props.locked || props.fetching || !props.next} onClick={props.onNext} className="min-h-11">다음 페이지</Button>
            <Button type="button" variant="ghost" disabled={props.locked || props.fetching} onClick={props.onRefresh} className="min-h-11">목록 다시 조회</Button>
        </div>
    </section>
}
