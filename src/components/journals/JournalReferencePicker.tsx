import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQueries } from '@tanstack/react-query'
import Button from '../common/Button'
import { accountApi, counterpartyApi, evidenceApi } from '../../lib/api'
import { validText } from '../../lib/journalDraftForm'

type Kind = 'account' | 'counterparty' | 'evidence'
type Option = { id: string; label: string; usable: boolean }
export const journalInputClass = 'w-full min-w-0 min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'
interface Props { kind: Kind; companyId: string; userId: string; id: string; label: string; selected: string[]; onChange?: (ids: string[]) => void; multiple?: boolean; locked?: boolean; readOnly?: boolean; invalid?: boolean; onAccessError: (error: unknown) => void }
// [B3/B7] 같은 회사/사용자의 목록은 행 사이에서도 Query가 공유한다. 전체 자동 다운로드는 하지 않는다.
export default function JournalReferencePicker({ kind, companyId, userId, id, label, selected, onChange, multiple, locked, readOnly, invalid, onAccessError }: Props) {
    const [search, setSearch] = useState(''), [q, setQ] = useState(''), [searchError, setSearchError] = useState('')
    const list = useInfiniteQuery({ queryKey: ['journal-reference', userId, companyId, kind, q], enabled: Boolean(companyId && !readOnly), initialPageParam: undefined as string | undefined,
        queryFn: async ({ signal, pageParam }) => {
            if (kind === 'account') { const p = await accountApi.list(companyId, { active: 'active', ...(q ? { q } : {}) }, pageParam, signal); return { ...p, items: p.items.map(r => ({ id: r.id, label: `${r.code} · ${r.name}`, usable: r.canUseInJournal })) } }
            if (kind === 'counterparty') { const p = await counterpartyApi.list(companyId, { active: 'active', ...(q ? { q } : {}) }, pageParam, signal); return { ...p, items: p.items.map(r => ({ id: r.id, label: r.name, usable: r.active })) } }
            const p = await evidenceApi.list(companyId, q ? { q } : {}, pageParam, signal); return { ...p, items: p.items.map(r => ({ id: r.id, label: `${r.title} · ${r.originalFileName}`, usable: true })) }
        }, getNextPageParam: p => p.nextCursor ?? undefined })
    const items: Option[] = list.data?.pages.flatMap(p => p.items) ?? [], missing = selected.filter(value => !items.some(r => r.id === value))
    // 현재 선택이 검색/페이지 밖이어도 잃지 않는다. 누락된 선택만 ID로 조회하고 중지 상태도 숨기지 않는다.
    const details = useQueries({ queries: missing.map(value => ({ queryKey: ['journal-reference-detail', userId, companyId, kind, value], queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Option> => {
        if (kind === 'account') { const r = await accountApi.detail(companyId, value, signal); return { id: value, label: `${r.code} · ${r.name}`, usable: r.canUseInJournal } }
        if (kind === 'counterparty') { const r = await counterpartyApi.detail(companyId, value, signal); return { id: value, label: r.name, usable: r.active } }
        const { evidence: r } = await evidenceApi.detail(companyId, value, signal); return { id: value, label: `${r.title} · ${r.originalFileName}`, usable: true }
    } })) })
    const failure = list.error ?? details.find(r => r.error)?.error, reported = useRef<unknown>(null)
    useEffect(() => { if (failure && reported.current !== failure) { reported.current = failure; onAccessError(failure) } }, [failure, onAccessError])
    const choices = [...items, ...details.flatMap(r => r.data ? [r.data] : [])]
    const chosen = selected.map(value => choices.find(r => r.id === value) ?? { id: value, label: `${value} · 현재 이름 확인 불가`, usable: false })
    if (readOnly) return <div className="min-w-0"><p className="text-sm text-hud-text-muted">{label}</p>{chosen.length ? chosen.map(r => <p key={r.id} className="break-words">{r.label}{!r.usable && ' · 현재 사용 자격 확인 필요'}</p>) : <p>없음</p>}</div>
    const all = [...choices, ...chosen.filter(r => !choices.some(c => c.id === r.id))]
    return <div className="min-w-0 space-y-2">
        <label htmlFor={id} className="block">{label}</label>
        <div className="flex min-w-0 gap-2"><input className={journalInputClass} value={search} aria-label={`${label} 검색어`} disabled={locked} onChange={e => setSearch(e.target.value)} />
            <Button type="button" disabled={locked || list.isFetching} className="min-h-11 shrink-0" variant="outline" onClick={() => { const term = search.trim(); if (!validText(term, 100)) { setSearchError('검색어는100자 이내의 올바른 문자로 입력해 주세요.'); return } setSearchError(''); setQ(term) }}>{label} 검색</Button></div>
        <select id={id} value={multiple ? '' : selected[0] ?? ''} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} className={journalInputClass} disabled={locked || list.isPending || list.isError} onChange={e => {
            const value = e.target.value; if (!value || !choices.find(r => r.id === value)?.usable) { if (!multiple && !value) onChange?.([]); return }
            onChange?.(multiple ? [...new Set([...selected, value])] : [value])
        }}><option value="">{multiple ? '증빙 선택' : kind === 'counterparty' ? '없음' : '계정 선택'}</option>{all.map(r => <option key={r.id} value={r.id} disabled={!r.usable || Boolean(multiple && (selected.includes(r.id) || selected.length >= 20))}>{r.label}{!r.usable ? ' · 사용 불가' : ''}</option>)}</select>
        {multiple && chosen.map(r => <div key={r.id} className="flex items-center justify-between gap-2 min-w-0"><span className="break-words text-sm">{r.label}</span><Button type="button" className="min-h-11 shrink-0" variant="ghost" disabled={locked} onClick={() => onChange?.(selected.filter(value => value !== r.id))} aria-label={`${r.label} 연결 해제`}>해제</Button></div>)}
        {list.isFetching && <p role="status" className="text-sm">{label} 확인 중…</p>}
        {searchError && <p role="alert" className="text-sm text-hud-accent-danger">{searchError}</p>}
        {list.isError && <p role="alert">{label}을 불러오지 못했습니다. <Button type="button" className="min-h-11" disabled={locked} onClick={() => void list.refetch()}>다시 조회</Button></p>}
        {list.hasNextPage && <Button type="button" variant="outline" className="min-h-11" disabled={locked || list.isFetching} onClick={() => void list.fetchNextPage()}>{label} 더 불러오기</Button>}
    </div>
}
