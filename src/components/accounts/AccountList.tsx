import { useState, type FormEvent } from 'react'
import Button from '../common/Button'
import type { AccountCategory, AccountFilters, AccountView } from '../../lib/api'
import { categoryLabels, balanceLabels } from './AccountForm'

interface Props {
    items: AccountView[]; filters: AccountFilters; locked: boolean; fetching: boolean; failed: boolean
    pageNumber: number; previous: boolean; next: boolean; selectedId: string
    onFilter: (filters: AccountFilters) => void; onSelect: (id: string) => void
    onPrevious: () => void; onNext: () => void; onRefresh: () => void
}
const fieldClass = 'w-full min-w-0 min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'
// [B2/B7] 조건은 서버에 전달한다. 성공한 빈 응답만 빈 상태로 표시한다.
export default function AccountList(props: Props) {
    const [query, setQuery] = useState(props.filters.q ?? ''), [error, setError] = useState('')
    const search = (event: FormEvent) => {
        event.preventDefault(); if (props.locked) return
        const q = query.trim()
        if ([...q].length > 100 || q.includes('\0') || [...q].some(c => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff)) { setError('검색어는 올바른 문자로 100자 이내에 입력해 주세요.'); return }
        setError(''); props.onFilter({ ...props.filters, q: q || undefined })
    }
    const choose = (row: AccountView) => <Button type="button" variant="ghost" className="min-h-11 break-all text-left" disabled={props.locked} aria-pressed={props.selectedId === row.id} onClick={() => props.onSelect(row.id)}>{row.code} · {row.name} 상세</Button>
    const classification = (row: AccountView) => row.category ? categoryLabels[row.category] : '미분류'
    const direction = (row: AccountView) => row.normalBalance ? balanceLabels[row.normalBalance] : '미분류'
    return <section className="hud-card rounded-xl p-4 min-w-0" aria-labelledby="account-list-title">
        <h2 id="account-list-title" className="text-xl font-semibold">계정과목 목록</h2>
        <form onSubmit={search} className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><label htmlFor="account-search" className="mb-2 block text-sm font-medium">계정 검색</label><div className="flex gap-2"><input id="account-search" type="search" value={query} disabled={props.locked} onChange={e => setQuery(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'account-search-error' : undefined} placeholder="코드 또는 이름" className={fieldClass} /><Button type="submit" disabled={props.locked} className="min-h-11 shrink-0">검색</Button></div>{error && <p id="account-search-error" role="alert" className="mt-2 text-sm text-hud-accent-danger">{error}</p>}</div>
            <div><label htmlFor="account-category-filter" className="mb-2 block text-sm font-medium">분류 필터</label><select id="account-category-filter" value={props.filters.category ?? ''} disabled={props.locked} onChange={e => props.onFilter({ ...props.filters, category: (e.target.value || undefined) as AccountCategory | undefined })} className={fieldClass}><option value="">전체</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label htmlFor="account-active-filter" className="mb-2 block text-sm font-medium">사용 상태</label><select id="account-active-filter" value={props.filters.active} disabled={props.locked} onChange={e => props.onFilter({ ...props.filters, active: e.target.value as AccountFilters['active'] })} className={fieldClass}><option value="active">사용중</option><option value="inactive">중지</option><option value="all">전체</option></select></div></form>
        {props.fetching && <p role="status" className="mt-3 text-sm text-hud-text-muted">계정과목 목록 갱신 중…</p>}
        {!props.items.length ? !props.fetching && !props.failed && <p role="status" className="mt-5 text-hud-text-muted">{props.filters.q || props.filters.category || props.filters.active !== 'active' ? '검색 조건과 일치하는 계정이 없습니다.' : '등록된 사용중 계정이 없습니다.'}</p> : <>
            <table className="mt-5 hidden w-full table-fixed xl:table"><caption className="sr-only">선택 회사의 계정과목 목록</caption><thead><tr className="text-left text-sm text-hud-text-muted"><th scope="col" className="w-1/2 p-2">코드·이름·상세</th><th scope="col" className="p-2">분류</th><th scope="col" className="p-2">방향</th><th scope="col" className="p-2">상태</th></tr></thead><tbody>{props.items.map(row => <tr key={row.id} className="border-t border-hud-border-secondary"><td className="p-1">{choose(row)}</td><td className="p-2">{classification(row)}</td><td className="p-2">{direction(row)}</td><td className="p-2">{row.active ? '사용중' : '중지'}</td></tr>)}</tbody></table>
            <ul className="mt-5 space-y-3 xl:hidden">{props.items.map(row => <li key={row.id} className="rounded-lg border border-hud-border-secondary p-3 break-words">{choose(row)}<p className="mt-1 text-sm text-hud-text-muted">{classification(row)} · {direction(row)} · {row.active ? '사용중' : '중지'}</p></li>)}</ul>
        </>}
        <div className="mt-5 flex flex-wrap items-center gap-3" aria-label="계정과목 페이지 이동"><Button type="button" variant="outline" disabled={props.locked || props.fetching || !props.previous} onClick={props.onPrevious} className="min-h-11">이전 페이지</Button><span className="text-sm">{props.pageNumber}페이지</span><Button type="button" variant="outline" disabled={props.locked || props.fetching || !props.next} onClick={props.onNext} className="min-h-11">다음 페이지</Button><Button type="button" variant="ghost" disabled={props.locked || props.fetching} onClick={props.onRefresh} className="min-h-11">목록 다시 조회</Button></div>
    </section>
}
