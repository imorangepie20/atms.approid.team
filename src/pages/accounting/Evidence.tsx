import { useEffect, useRef, useState } from 'react'
import { useInRouterContext, useSearchParams } from 'react-router-dom'
import { journalUuid } from '../../lib/journalDraftForm'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import AsyncState from '../../components/common/AsyncState'
import Button from '../../components/common/Button'
import EvidenceDetail from '../../components/evidence/EvidenceDetail'
import EvidenceList from '../../components/evidence/EvidenceList'
import EvidenceUploadForm from '../../components/evidence/EvidenceUploadForm'
import { useAuth } from '../../context/AuthContext'
import { ApiError, companyApi, counterpartyApi, evidenceApi, type CompanySelection, type EvidenceFilters, type EvidenceView } from '../../lib/api'

const field = 'w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'
type Selection = { value: CompanySelection; version: number }

// [B7/첫 검증 수리] URL을 읽는 경계만 Router 아래 둔다. 기존 증빙 페이지의 독립 렌더링/원본 수명 계약을 보존한다.
function EvidenceLink({ select, open, invalid }: { select: (id: string) => Promise<boolean>; open: (id: string) => void; invalid: (message: string) => void }) {
    const [params] = useSearchParams()
    useEffect(() => {
        const company = params.get('companyId'), evidence = params.get('evidenceId')
        if (!company && !evidence) return
        if (!company || !journalUuid.safeParse(company).success || (evidence && !journalUuid.safeParse(evidence).success)) { invalid('올바른 회사/증빙 링크를 확인해 주세요.'); return }
        let cancelled = false
        void select(company.toLowerCase()).then(ok => { if (ok && !cancelled && evidence) open(evidence.toLowerCase()) })
        return () => { cancelled = true }
    }, [params])
    return null
}

// [F03 B1~B7] 회사 선택은 페이지 메모리만 사용한다. Query key와 세대 번호가 회사/사용자 사이의 늦은 응답을 분리한다.
export default function Evidence() {
    const { session, expire } = useAuth(), cache = useQueryClient(), userId = session?.user.id ?? '', inRouter = useInRouterContext()
    const [wantedCompany, setWantedCompany] = useState(''), [selected, setSelected] = useState<Selection | null>(null)
    const [selecting, setSelecting] = useState(false), [refreshing, setRefreshing] = useState(false), [draftDirty, setDraftDirty] = useState(false)
    const [filters, setFilters] = useState<EvidenceFilters>({}), [cursors, setCursors] = useState<string[]>([]), [detailId, setDetailId] = useState('')
    const [error, setError] = useState(''), [notice, setNotice] = useState('')
    const generation = useRef(0), mounted = useRef(true), refreshRunning = useRef(false), activeCompany = useRef(''), alert = useRef<HTMLDivElement>(null)
    useEffect(() => { document.title = '증빙 · ATMS'; mounted.current = true; return () => { mounted.current = false; generation.current++; activeCompany.current = '' } }, [])
    useEffect(() => { if (error) { alert.current?.focus({ preventScroll: true }); alert.current?.scrollIntoView({ block: 'center' }) } }, [error])
    const companyId = selected?.value.company.id ?? '', version = selected?.version ?? -1
    const current = () => mounted.current && generation.current === version && activeCompany.current === companyId
    const canRead = selected?.value.permissions.includes('evidence.read') ?? false
    const canCreate = selected?.value.permissions.includes('evidence.create') ?? false
    const companies = useInfiniteQuery({ queryKey: ['evidence-companies', userId], enabled: Boolean(userId), initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.list(signal, { limit: 100, cursor: pageParam }), getNextPageParam: page => page.nextCursor ?? undefined })
    const counterparties = useInfiniteQuery({ queryKey: ['evidence-counterparties', userId, companyId], enabled: Boolean(companyId && (canRead || canCreate)),
        initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => counterpartyApi.list(companyId, { active: 'active' }, pageParam, signal),
        getNextPageParam: page => page.nextCursor ?? undefined })
    const cursor = cursors[cursors.length - 1]
    const rows = useQuery({ queryKey: ['evidence', userId, companyId, filters.q ?? '', filters.kind ?? '', filters.counterpartyId ?? '', cursor ?? ''],
        enabled: Boolean(companyId && canRead), queryFn: ({ signal }) => evidenceApi.list(companyId, filters, cursor, signal) })
    const detail = useQuery({ queryKey: ['evidence-detail', userId, companyId, detailId], enabled: Boolean(companyId && canRead && detailId),
        queryFn: ({ signal }) => evidenceApi.detail(companyId, detailId, signal) })
    const companyItems = companies.data?.pages.flatMap(page => page.items) ?? []
    const counterpartyItems = counterparties.data?.pages.flatMap(page => page.items) ?? []
    const clearCompany = (id: string) => {
        cache.removeQueries({ queryKey: ['evidence', userId, id] })
        cache.removeQueries({ queryKey: ['evidence-detail', userId, id] })
        cache.removeQueries({ queryKey: ['evidence-counterparties', userId, id] })
        void cache.cancelQueries({ queryKey: ['evidence-journals', userId, id] }); cache.removeQueries({ queryKey: ['evidence-journals', userId, id] })
    }
    const selectCompany = async (id: string): Promise<boolean> => {
        if (refreshing) return false
        if (draftDirty && !window.confirm('회사를 바꾸면 현재 증빙 입력과 요청 상태를 이 화면에서 잃습니다. 먼저 완료 목록과 요청 상태를 확인했나요?')) return false
        const previous = companyId, nextVersion = ++generation.current
        activeCompany.current = id; setWantedCompany(id); setSelected(null); setDetailId(''); setFilters({}); setCursors([])
        setError(''); setNotice(''); setDraftDirty(false)
        if (previous) clearCompany(previous)
        if (!id || !session) { setSelecting(false); return false }
        setSelecting(true)
        try {
            // POST select은 현재 소속/권한만 확인한다. 전역 회사 선택을 저장하지 않는다.
            const value = await companyApi.select(id, session.csrfToken)
            if (mounted.current && generation.current === nextVersion) { setSelected({ value, version: nextVersion }); return true }
        } catch (failure) {
            if (mounted.current && generation.current === nextVersion) {
                if (failure instanceof ApiError && failure.status === 401) expire()
                else setError('회사를 선택하지 못했습니다. 현재 소속과 권한을 확인해 주세요.')
            }
        } finally { if (mounted.current && generation.current === nextVersion) setSelecting(false) }
        return false
    }
    const refreshPermissions = async () => {
        if (!companyId || !session || refreshRunning.current) return
        refreshRunning.current = true; setRefreshing(true); setError(''); setNotice('')
        const expected = generation.current
        try {
            const value = await companyApi.select(companyId, session.csrfToken)
            if (mounted.current && generation.current === expected) {
                clearCompany(companyId); const nextVersion = ++generation.current
                setSelected({ value, version: nextVersion }); setDetailId(''); setDraftDirty(false)
                setNotice('현재 회사 권한을 다시 확인했습니다.')
            }
        } catch (failure) {
            if (mounted.current && generation.current === expected) {
                clearCompany(companyId); generation.current++; activeCompany.current = ''; setSelected(null); setWantedCompany(''); setDetailId('')
                if (failure instanceof ApiError && failure.status === 401) expire()
                else setError('회사 접근 권한을 확인하지 못했습니다. 회사를 다시 선택해 주세요.')
            }
        } finally { refreshRunning.current = false; if (mounted.current) setRefreshing(false) }
    }
    useEffect(() => {
        const failure = companies.error ?? counterparties.error ?? rows.error ?? detail.error
        if (failure instanceof ApiError && failure.status === 401) expire()
        else if (failure instanceof ApiError && failure.status === 403 && companyId) void refreshPermissions()
    }, [companies.error, counterparties.error, rows.error, detail.error, companyId, expire])
    const changeFilters = (value: EvidenceFilters) => { setFilters(value); setCursors([]); setDetailId(''); setError('') }
    const done = (row: EvidenceView) => {
        if (!current()) return
        setCursors([]); setDetailId(row.id); setNotice('완료 증빙을 저장했습니다.')
        void cache.invalidateQueries({ queryKey: ['evidence', userId, companyId] })
    }
    const moreCounterparties = () => { if (counterparties.hasNextPage) void counterparties.fetchNextPage() }
    const locked = refreshing
    return <main className="mx-auto max-w-7xl space-y-6 p-4 text-hud-text-primary sm:p-6" aria-labelledby="evidence-page-title">
        {inRouter && <EvidenceLink select={selectCompany} open={setDetailId} invalid={setError} />}
        <header><h1 id="evidence-page-title" className="text-2xl font-semibold">증빙</h1><p className="mt-1 text-sm text-hud-text-muted">회사를 선택해 완료 증빙을 조회하거나 원본을 등록하세요.</p></header>
        <div ref={alert} tabIndex={-1}>{error && <p role="alert" className="rounded-lg border border-hud-accent-danger p-3 text-sm text-hud-accent-danger">{error}</p>}</div>
        {notice && <p role="status" className="text-sm text-hud-text-secondary">{notice}</p>}
        <section className="hud-card rounded-xl p-5" aria-labelledby="evidence-company-title">
            <h2 id="evidence-company-title" className="text-lg font-semibold">회사 선택</h2>
            {companies.isLoading ? <p role="status" className="mt-3">회사 목록을 불러오는 중…</p> : companies.isError ? <AsyncState kind="error" title="회사 목록을 불러오지 못했습니다" description="다시 조회해 주세요." onRetry={() => void companies.refetch()} /> : <>
                <div className="mt-3 flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><label htmlFor="evidence-company" className="mb-1 block text-sm">현재 회사</label>
                    <select id="evidence-company" value={wantedCompany} disabled={locked} onChange={event => void selectCompany(event.target.value)} className={field}>
                        <option value="">회사를 선택해 주세요</option>{companyItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select></div>
                    {companies.hasNextPage && <Button type="button" variant="outline" disabled={locked || companies.isFetchingNextPage} onClick={() => void companies.fetchNextPage()} className="min-h-11">회사 더 불러오기</Button>}
                </div>{selecting && <p role="status" className="mt-2 text-sm">현재 권한을 확인하는 중…</p>}
                {!companyItems.length && <p role="status" className="mt-3 text-sm text-hud-text-muted">접근할 수 있는 회사가 없습니다.</p>}
            </>}
        </section>
        {selected && !canRead && !canCreate && <AsyncState kind="empty" title="증빙 권한이 없습니다" description="현재 회사의 권한을 확인해 주세요." />}
        {selected && (canRead || canCreate) && <>
            {counterparties.isError && <p role="alert" className="text-sm text-hud-accent-danger">거래처 목록을 불러오지 못했습니다. 거래처 연결 없이 등록하거나 다시 조회해 주세요.
                <Button type="button" variant="ghost" onClick={() => void counterparties.refetch()} className="min-h-11">거래처 다시 조회</Button></p>}
            {canCreate && <EvidenceUploadForm key={`${companyId}-${version}`} companyId={companyId} csrfToken={session?.csrfToken ?? ''}
                counterparties={counterpartyItems} moreCounterparties={Boolean(counterparties.hasNextPage)} onMoreCounterparties={moreCounterparties}
                onDone={done} onUnauthorized={expire} onForbidden={() => void refreshPermissions()} onDraftChange={setDraftDirty} isCurrent={current} />}
            {canRead && <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                {rows.isError ? <AsyncState kind="error" title="증빙 목록을 불러오지 못했습니다" description="회사 권한과 조회 조건을 확인하고 다시 시도해 주세요." onRetry={() => void rows.refetch()} />
                    : <EvidenceList key={companyId} items={rows.data?.items ?? []} filters={filters} counterparties={counterpartyItems} selectedId={detailId}
                        fetching={rows.isFetching} failed={rows.isError} locked={locked} previous={cursors.length > 0} next={Boolean(rows.data?.nextCursor)} pageNumber={cursors.length + 1}
                        moreCounterparties={Boolean(counterparties.hasNextPage)} onMoreCounterparties={moreCounterparties}
                        onFilter={changeFilters} onSelect={setDetailId} onPrevious={() => { setCursors(current => current.slice(0, -1)); setDetailId('') }}
                        onNext={() => { if (rows.data?.nextCursor) { setCursors(current => [...current, rows.data.nextCursor!]); setDetailId('') } }} onRefresh={() => void rows.refetch()} />}
                {detailId && (detail.isLoading ? <AsyncState kind="loading" title="증빙 상세 확인 중" description="잠시 기다려 주세요." />
                    : detail.isError ? <AsyncState kind="error" title="증빙 상세를 불러오지 못했습니다" description="완료 목록에서 다시 선택하거나 재시도해 주세요." onRetry={() => void detail.refetch()} />
                        : detail.data && <EvidenceDetail key={detailId} evidence={detail.data.evidence} companyId={companyId} onUnauthorized={expire}
                            onForbidden={() => void refreshPermissions()} isCurrent={current} userId={userId} canReadJournals={selected.value.permissions.includes('journal.read')} />)}
            </div>}
        </>}
    </main>
}
