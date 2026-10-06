import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import AsyncState from '../../components/common/AsyncState'
import Button from '../../components/common/Button'
import CounterpartyList from '../../components/counterparties/CounterpartyList'
import CounterpartyForm from '../../components/counterparties/CounterpartyForm'
import CounterpartyDetail from '../../components/counterparties/CounterpartyDetail'
import { useAuth } from '../../context/AuthContext'
import { ApiError, companyApi, counterpartyApi, type CompanySelection, type CounterpartyFields, type CounterpartyFilters, type CounterpartyView, type CreateCounterpartyInput, type UpdateCounterpartyInput } from '../../lib/api'

function message(error: unknown) {
    if (!(error instanceof ApiError)) return '연결 상태를 확인하지 못했습니다. 다시 조회해 주세요.'
    if (error.status === 400) return '입력이나 조회 조건을 확인해 주세요.'
    if (error.status === 403) return '현재 작업 권한을 확인할 수 없습니다. 회사 권한을 다시 확인합니다.'
    if (error.status === 404) return '거래처를 찾지 못했습니다. 목록을 다시 확인해 주세요.'
    if (error.status === 409) return '번호, 요청 또는 버전이 충돌했습니다. 최신 자료를 확인해 주세요.'
    if (error.status === 429) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
    if (error.status === 503) return '거래처 서비스를 사용할 수 없습니다. 잠시 후 다시 조회해 주세요.'
    return '요청을 처리하지 못했습니다. 다시 조회해 주세요.'
}
const editable = ['name', 'kind', 'businessNumber', 'contactName', 'email', 'phone', 'address', 'memo'] as const
const defaultFilters: CounterpartyFilters = { active: 'active' }
const roleLabels = { COMPANY_ADMIN: '회사 관리자', ACCOUNTANT: '회계 담당자', APPROVER: '승인자', READ_ONLY: '조회 전용', EXTERNAL_TAX: '외부 세무사' }
type DiscardAction = { label: string; run: () => void }

export default function Counterparties() {
    const { session, expire } = useAuth()
    const cache = useQueryClient(), userId = session?.user.id ?? ''
    const [wantedCompany, setWantedCompany] = useState(''), [selection, setSelection] = useState<CompanySelection | null>(null)
    const [selecting, setSelecting] = useState(false), [refreshingPermissions, setRefreshingPermissions] = useState(false)
    const [filters, setFilters] = useState<CounterpartyFilters>(defaultFilters), [cursors, setCursors] = useState<string[]>([])
    const [detailId, setDetailId] = useState(''), [mode, setMode] = useState<'none' | 'create' | 'edit'>('none')
    const [dirty, setDirty] = useState(false), [uncertain, setUncertain] = useState(false), [busy, setBusy] = useState(false)
    const [error, setError] = useState(''), [notice, setNotice] = useState(''), [discard, setDiscard] = useState<DiscardAction | null>(null)
    // [T1/T4/T6] 실제 쓰기 중복은 ref로 즉시 막는다. 회사 선택 세대가 달라진 이전 응답은 화면에 반영하지 않는다.
    const inFlight = useRef(false), generation = useRef(0), mounted = useRef(true), permissionRefresh = useRef(false)
    const attempt = useRef<CreateCounterpartyInput | null>(null), alert = useRef<HTMLDivElement>(null)
    useEffect(() => { document.title = '거래처 · ATMS'; mounted.current = true; return () => { mounted.current = false; generation.current++; attempt.current = null } }, [])
    useEffect(() => { if (error) { alert.current?.focus({ preventScroll: true }); alert.current?.scrollIntoView({ block: 'center' }) } }, [error])
    const companyId = selection?.company.id ?? '', cursor = cursors[cursors.length - 1]
    const canRead = selection?.permissions.includes('counterparties.read') ?? false
    const canWrite = Boolean(selection?.permissions.includes('counterparties.write') && !refreshingPermissions)
    const locked = busy || refreshingPermissions
    const companies = useInfiniteQuery({ queryKey: ['counterparty-companies', userId], initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.list(signal, { limit: 100, cursor: pageParam }), getNextPageParam: page => page.nextCursor ?? undefined })
    const rows = useQuery({ queryKey: ['counterparties', userId, companyId, filters.q ?? null, filters.kind ?? null, filters.active, cursor ?? null],
        enabled: Boolean(companyId && canRead), queryFn: ({ signal }) => counterpartyApi.list(companyId, filters, cursor, signal) })
    const detail = useQuery({ queryKey: ['counterparty', userId, companyId, detailId], enabled: Boolean(companyId && detailId && canRead),
        queryFn: ({ signal }) => counterpartyApi.detail(companyId, detailId, signal) })
    const resetDraft = () => { setMode('none'); setDirty(false); setUncertain(false); attempt.current = null; setDiscard(null) }
    const guardDiscard = (label: string, run: () => void) => { if (locked) return; if (dirty || uncertain) setDiscard({ label, run }); else run() }
    const clearCompanyQueries = (id: string) => {
        cache.removeQueries({ queryKey: ['counterparties', userId, id] }); cache.removeQueries({ queryKey: ['counterparty', userId, id] })
    }
    // POST select은 현재 소속/권한 조회 계약이다. 서버 세션의 전역 회사값을 저장하지 않는다.
    const selectCompany = async (id: string) => {
        const version = ++generation.current
        resetDraft(); setSelection(null); setWantedCompany(id); setDetailId(''); setFilters(defaultFilters); setCursors([]); setError(''); setNotice('')
        if (!id || !session) { setSelecting(false); return }
        setSelecting(true)
        try { const value = await companyApi.select(id, session.csrfToken); if (mounted.current && generation.current === version) setSelection(value) }
        catch (failure) { if (mounted.current && generation.current === version) { if (failure instanceof ApiError && failure.status === 401) expire(); else setError(message(failure)) } }
        finally { if (mounted.current && generation.current === version) setSelecting(false) }
    }
    const refreshPermissions = async (id: string) => {
        if (permissionRefresh.current || !session || !id) return
        permissionRefresh.current = true; setRefreshingPermissions(true); resetDraft()
        const version = generation.current
        try {
            const latest = await companyApi.select(id, session.csrfToken)
            if (mounted.current && generation.current === version) { setSelection(latest); setNotice('현재 회사 권한을 다시 확인했습니다.') }
        } catch (failure) {
            if (mounted.current && generation.current === version) {
                clearCompanyQueries(id); setSelection(null); setWantedCompany(''); setDetailId('')
                if (failure instanceof ApiError && failure.status === 401) expire(); else setError('회사 접근 권한을 확인하지 못했습니다. 회사를 다시 선택해 주세요.')
            }
        } finally { permissionRefresh.current = false; if (mounted.current && generation.current === version) setRefreshingPermissions(false) }
    }
    useEffect(() => {
        const failure = companies.error ?? rows.error ?? detail.error
        if (failure instanceof ApiError && failure.status === 401) expire()
        if (failure instanceof ApiError && failure.status === 403 && companyId) void refreshPermissions(companyId)
        // 오류 객체/회사 변경에만 반응한다. 재확인한 selection 객체 자체로 반복 POST하지 않는다.
    }, [companies.error, rows.error, detail.error, companyId, expire])
    const changeView = (run: () => void) => guardDiscard('조회 조건이나 선택을 바꾸면 현재 입력을 폐기합니다.', () => { resetDraft(); setDetailId(''); setError(''); run() })
    const finish = () => { inFlight.current = false; if (mounted.current) setBusy(false) }
    const applySuccess = async (row: CounterpartyView, created?: boolean) => {
        resetDraft(); setDetailId(row.id); setCursors([]); setError('')
        cache.setQueryData(['counterparty', userId, companyId, row.id], row)
        setNotice(created === false ? '같은 등록 요청의 현재 거래처를 확인했습니다.' : row.active ? '거래처를 저장했습니다.' : '사용을 중지했습니다. 거래처 식별자는 유지됩니다.')
        await cache.invalidateQueries({ queryKey: ['counterparties', userId, companyId] })
    }
    // [T4] 생성 요청은 정규화 본문과 UUID를 고정한다. 5xx/통신 실패 때 자동 재전송하지 않는다.
    const sendCreate = async (input: CreateCounterpartyInput) => {
        if (inFlight.current || !session || !canWrite || !companyId) return
        inFlight.current = true; setBusy(true); setError(''); const version = generation.current
        try {
            const result = await counterpartyApi.create(companyId, input, session.csrfToken)
            if (mounted.current && generation.current === version) await applySuccess(result.counterparty, result.created)
        } catch (failure) {
            if (mounted.current && generation.current === version) {
                if (failure instanceof ApiError && failure.status === 401) { resetDraft(); expire() }
                else if (!(failure instanceof ApiError) || failure.status >= 500) { setUncertain(true); setError('등록 결과를 확인하지 못했습니다. 저장됐을 수 있으므로 같은 요청으로 재시도하거나 목록을 확인해 주세요.') }
                else { attempt.current = null; setUncertain(false); setError(message(failure)); if (failure.status === 403) await refreshPermissions(companyId) }
            }
        } finally { finish() }
    }
    // [T5] stale/응답 유실이면 초안을 폐기하고 GET으로 최신 상태를 읽는다. 최신 version으로 자동 쓰지 않는다.
    const sendChange = async (input: CounterpartyFields | null) => {
        if (inFlight.current || !session || !canWrite || !detail.data || !detail.data.active || detail.isError || detail.isFetching) return
        const current = detail.data, patch: UpdateCounterpartyInput = { version: current.version }
        if (input) for (const field of editable) if (input[field] !== current[field]) Object.assign(patch, { [field]: input[field] })
        if (input && Object.keys(patch).length === 1) { setDirty(false); setNotice('변경된 값이 없습니다.'); return }
        inFlight.current = true; setBusy(true); setError(''); const version = generation.current
        try {
            const result = input ? await counterpartyApi.update(companyId, current.id, patch, session.csrfToken) : await counterpartyApi.deactivate(companyId, current.id, current.version, session.csrfToken)
            if (mounted.current && generation.current === version) await applySuccess(result)
        } catch (failure) {
            if (mounted.current && generation.current === version) {
                if (failure instanceof ApiError && failure.status === 401) { resetDraft(); expire() }
                else {
                    setError(message(failure)); if (failure instanceof ApiError && failure.status === 403) await refreshPermissions(companyId)
                    if (!(failure instanceof ApiError) || failure.status === 409 || failure.status >= 500) {
                        resetDraft(); setNotice(' 이전 입력을 폐기했습니다. 최신 상세를 확인하고 다시 입력해 주세요.')
                        await Promise.all([detail.refetch(), cache.invalidateQueries({ queryKey: ['counterparties', userId, companyId] })])
                    }
                }
            }
        } finally { finish() }
    }
    if (companies.isPending) return <AsyncState kind="loading" title="회사 목록을 불러오는 중입니다" description="접근 가능한 회사를 확인합니다." />
    if (companies.isError && !companies.data) return <AsyncState kind="error" title="회사 목록을 불러오지 못했습니다" description={message(companies.error)} onRetry={() => { void companies.refetch() }} />
    const companyItems = companies.data?.pages.flatMap(page => page.items) ?? []
    if (!companyItems.length) return <AsyncState kind="empty" title="접근 가능한 회사가 없습니다" description="회사 소속과 조회 권한이 등록되면 거래처를 관리할 수 있습니다." />
    return <div className="mx-auto max-w-[1500px] space-y-5 text-hud-text-primary">
        <header><p className="text-sm text-hud-accent-primary">회계·세무</p><h1 className="mt-1 text-2xl sm:text-3xl font-bold">거래처</h1><p className="mt-2 text-sm text-hud-text-muted">회사를 선택해 고객과 공급 정보를 관리합니다.</p></header>
        <section aria-label="거래처 회사 선택" className="hud-card rounded-xl p-4 space-y-3">
            <label htmlFor="counterparty-company" className="block text-sm font-medium">관리할 회사</label><select id="counterparty-company" value={wantedCompany} disabled={locked}
                onChange={event => { const id = event.target.value; guardDiscard('회사를 바꾸면 현재 입력과 등록 요청을 폐기합니다.', () => { void selectCompany(id) }) }}
                className="w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">
                <option value="">회사를 선택해 주세요</option>{companyItems.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            {companies.hasNextPage && <Button type="button" variant="outline" disabled={companies.isFetchingNextPage || locked} onClick={() => { void companies.fetchNextPage() }} className="min-h-11">회사 더 불러오기</Button>}
            {companies.isError && <div role="alert">회사 목록을 더 불러오지 못했습니다.<Button type="button" variant="ghost" onClick={() => { void companies.fetchNextPage() }} className="min-h-11">회사 목록 다시 시도</Button></div>}
            {selecting && <p role="status">회사 권한을 확인하는 중입니다.</p>}
            {!selection && wantedCompany && !selecting && <Button type="button" variant="outline" onClick={() => { void selectCompany(wantedCompany) }} className="min-h-11">회사 선택 다시 시도</Button>}
            {selection && <p className="text-sm text-hud-text-muted">{selection.company.name} · 역할 {selection.roles.map(role => roleLabels[role]).join(', ')} · {canWrite ? '거래처 조회·쓰기 가능' : '거래처 조회 전용'}</p>}
        </section>
        {error && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-danger">{error}</div>}
        {notice && <p role="status" aria-live="polite" className="text-sm text-hud-text-muted">{notice}</p>}
        {discard && <div role="alert" className="hud-card rounded-xl p-4"><p>{discard.label} {uncertain ? '저장됐을 수 있으므로 목록에서 결과를 확인해 주세요.' : '저장하지 않은 내용은 남지 않습니다.'}</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="danger" className="min-h-11" onClick={() => { const action = discard.run; setDiscard(null); action() }}>입력 폐기 후 계속</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setDiscard(null)}>계속 입력</Button></div></div>}
        {selection && !canRead && <p role="alert">거래처 조회 권한이 없습니다.</p>}
        {selection && canRead && <>
            {canWrite && <Button type="button" disabled={locked} className="min-h-11" onClick={() => guardDiscard('새 등록을 시작하면 현재 입력을 폐기합니다.', () => { resetDraft(); setDetailId(''); setMode('create'); setError(''); setNotice('') })}>새 거래처 등록</Button>}
            <div className="grid gap-5 xl:grid-cols-2 items-start">
                <div className="min-w-0"><CounterpartyList key={`${companyId}:${filters.q ?? ''}:${filters.kind ?? ''}:${filters.active}`} items={rows.isError ? [] : rows.data?.items ?? []} filters={filters} locked={locked} fetching={rows.isFetching} failed={rows.isError} pageNumber={cursors.length + 1} previous={cursors.length > 0} next={Boolean(rows.data?.nextCursor)} selectedId={detailId}
                    onFilter={value => changeView(() => { setFilters(value); setCursors([]) })} onSelect={id => changeView(() => { setDetailId(id) })}
                    onPrevious={() => changeView(() => setCursors(current => current.slice(0, -1)))} onNext={() => { const next = rows.data?.nextCursor; if (next) changeView(() => setCursors(current => [...current, next])) }} onRefresh={() => { void rows.refetch() }} />
                    {rows.isError && <AsyncState kind="error" title="거래처 목록을 불러오지 못했습니다" description={message(rows.error)} onRetry={() => { void rows.refetch() }} />}
                </div>
                <div className="min-w-0 space-y-4">
                    {mode !== 'none' && canWrite && (mode === 'create' || (detail.data?.active && !detail.isError)) ? <CounterpartyForm key={`${companyId}:${mode}:${detailId}`} mode={mode} initial={mode === 'edit' ? detail.data : undefined} busy={locked} uncertain={uncertain} error={error}
                        onDirty={() => setDirty(true)} onCancel={() => guardDiscard('입력을 취소합니다.', resetDraft)} onSubmit={async fields => { if (mode === 'create') { if (uncertain) return; attempt.current ??= { ...fields, creationRequestId: crypto.randomUUID() }; await sendCreate(attempt.current) } else await sendChange(fields) }}
                        onRetry={() => { if (attempt.current) void sendCreate(attempt.current) }} onCheckResult={() => { setFilters({ active: 'all', q: attempt.current?.name }); setCursors([]); void cache.invalidateQueries({ queryKey: ['counterparties', userId, companyId] }) }} />
                        : detailId ? detail.isPending || detail.isFetching ? <AsyncState kind="loading" title="거래처 상세를 확인하고 있습니다" description="최신 상태와 버전을 읽습니다." />
                            : detail.isError ? <AsyncState kind="error" title="거래처 상세를 불러오지 못했습니다" description={message(detail.error)} onRetry={() => { void detail.refetch() }} />
                                : detail.data && <CounterpartyDetail key={`${detail.data.id}:${detail.data.version}`} row={detail.data} canWrite={canWrite} busy={locked} onEdit={() => { setMode('edit'); setDirty(false); setError(''); setNotice('') }} onDeactivate={() => sendChange(null)} />
                            : mode === 'none' && <p className="p-4 text-sm text-hud-text-muted">목록에서 거래처를 선택해 상세를 확인하세요.</p>}
                </div>
            </div>
        </>}
    </div>
}
