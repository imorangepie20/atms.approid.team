import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import AsyncState from '../../components/common/AsyncState'
import Button from '../../components/common/Button'
import AccountList from '../../components/accounts/AccountList'
import AccountForm from '../../components/accounts/AccountForm'
import AccountDetail from '../../components/accounts/AccountDetail'
import { useAuth } from '../../context/AuthContext'
import { ApiError, accountApi, companyApi, type AccountFields, type AccountFilters, type AccountView, type CompanySelection, type CreateAccountInput, type UpdateAccountInput } from '../../lib/api'

function message(error: unknown) {
    if (!(error instanceof ApiError)) return '연결 상태를 확인하지 못했습니다. 다시 조회해 주세요.'
    if (error.status === 400) return '입력이나 조회 조건을 확인해 주세요.'
    if (error.status === 403) return '현재 작업 권한을 확인할 수 없습니다. 회사 권한을 다시 확인합니다.'
    if (error.status === 404) return '계정을 찾지 못했습니다. 목록을 다시 확인해 주세요.'
    if (error.status === 409) return '코드, 요청 또는 버전이 충돌하거나 변경할 수 없는 항목입니다. 최신 자료를 확인해 주세요.'
    if (error.status === 429) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
    if (error.status === 503) return '계정과목 서비스를 사용할 수 없습니다. 잠시 후 다시 조회해 주세요.'
    return '요청을 처리하지 못했습니다. 다시 조회해 주세요.'
}
const defaultFilters: AccountFilters = { active: 'active' }
const roles = { COMPANY_ADMIN: '회사 관리자', ACCOUNTANT: '회계 담당자', APPROVER: '승인자', READ_ONLY: '조회 전용', EXTERNAL_TAX: '외부 세무사' }
type DiscardAction = { label: string; run: () => void }

export default function Accounts() {
    const { session, expire } = useAuth(), cache = useQueryClient(), userId = session?.user.id ?? ''
    const [wantedCompany, setWantedCompany] = useState(''), [selection, setSelection] = useState<CompanySelection | null>(null)
    const [selecting, setSelecting] = useState(false), [refreshingPermissions, setRefreshingPermissions] = useState(false)
    const [filters, setFilters] = useState<AccountFilters>(defaultFilters), [cursors, setCursors] = useState<string[]>([])
    const [detailId, setDetailId] = useState(''), [mode, setMode] = useState<'none' | 'create' | 'edit'>('none')
    const [dirty, setDirty] = useState(false), [uncertain, setUncertain] = useState(false), [busy, setBusy] = useState(false)
    const [error, setError] = useState(''), [notice, setNotice] = useState(''), [discard, setDiscard] = useState<DiscardAction | null>(null)
    // [B4/B6] ref는 React 렌더 이전의 이중 클릭도 차단한다. 회사 선택 세대로 늦은 응답을 폐기한다.
    const inFlight = useRef(false), generation = useRef(0), mounted = useRef(true), permissionRefresh = useRef(false)
    const attempt = useRef<CreateAccountInput | null>(null), alert = useRef<HTMLDivElement>(null)
    useEffect(() => { document.title = '계정과목 · ATMS'; mounted.current = true; return () => { mounted.current = false; generation.current++; attempt.current = null } }, [])
    useEffect(() => { if (error) alert.current?.focus({ preventScroll: true }) }, [error])
    const companyId = selection?.company.id ?? '', cursor = cursors[cursors.length - 1]
    const canRead = selection?.permissions.includes('accounts.read') ?? false
    const canWrite = Boolean(selection?.permissions.includes('accounts.manage') && !refreshingPermissions)
    const locked = busy || refreshingPermissions
    const companies = useInfiniteQuery({ queryKey: ['account-companies', userId], initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.list(signal, { limit: 100, cursor: pageParam }), getNextPageParam: page => page.nextCursor ?? undefined })
    const rows = useQuery({ queryKey: ['accounts', userId, companyId, filters.q ?? null, filters.category ?? null, filters.active, cursor ?? null],
        enabled: Boolean(companyId && canRead), queryFn: ({ signal }) => accountApi.list(companyId, filters, cursor, signal) })
    const detail = useQuery({ queryKey: ['account', userId, companyId, detailId], enabled: Boolean(companyId && detailId && canRead),
        queryFn: ({ signal }) => accountApi.detail(companyId, detailId, signal) })
    const resetDraft = () => { setMode('none'); setDirty(false); setUncertain(false); attempt.current = null; setDiscard(null) }
    const guardDiscard = (label: string, run: () => void) => { if (locked) return; if (dirty || uncertain) setDiscard({ label, run }); else run() }
    const clearCompanyQueries = (id: string) => {
        cache.removeQueries({ queryKey: ['accounts', userId, id] }); cache.removeQueries({ queryKey: ['account', userId, id] })
    }
    const selectCompany = async (id: string) => {
        const current = ++generation.current
        if (companyId) { await cache.cancelQueries({ queryKey: ['accounts', userId, companyId] }); await cache.cancelQueries({ queryKey: ['account', userId, companyId] }) }
        resetDraft(); setSelection(null); setWantedCompany(id); setDetailId(''); setFilters(defaultFilters); setCursors([]); setError(''); setNotice('')
        if (!id || !session) { setSelecting(false); return }
        setSelecting(true)
        try { const value = await companyApi.select(id, session.csrfToken); if (mounted.current && generation.current === current) setSelection(value) }
        catch (failure) { if (mounted.current && generation.current === current) { if (failure instanceof ApiError && failure.status === 401) expire(); else setError(message(failure)) } }
        finally { if (mounted.current && generation.current === current) setSelecting(false) }
    }
    // [B6] 접근 상실은 캐시/상세까지 제거한다. 권한 재확인으로 쓰기를 자동 재개하지 않는다.
    const refreshPermissions = async (id: string) => {
        if (permissionRefresh.current || !session || !id) return
        permissionRefresh.current = true; setRefreshingPermissions(true); resetDraft()
        const current = generation.current
        try {
            const latest = await companyApi.select(id, session.csrfToken)
            if (mounted.current && generation.current === current) {
                setSelection(latest); setNotice('현재 회사 권한을 다시 확인했습니다.')
                if (!latest.permissions.includes('accounts.read')) { clearCompanyQueries(id); setDetailId('') }
            }
        } catch (failure) {
            if (mounted.current && generation.current === current) { clearCompanyQueries(id); setSelection(null); setWantedCompany(''); setDetailId(''); if (failure instanceof ApiError && failure.status === 401) expire(); else setError('회사 접근 권한을 확인하지 못했습니다. 회사를 다시 선택해 주세요.') }
        } finally { permissionRefresh.current = false; if (mounted.current && generation.current === current) setRefreshingPermissions(false) }
    }
    useEffect(() => {
        const failure = companies.error ?? rows.error ?? detail.error
        if (failure instanceof ApiError && failure.status === 401) expire()
        if (failure instanceof ApiError && failure.status === 403 && companyId) void refreshPermissions(companyId)
        // selection 갱신만으로 재확인을 반복하지 않는다. 오류 객체/회사 변경에만 반응한다.
    }, [companies.error, rows.error, detail.error, companyId, expire])
    const changeView = (run: () => void) => guardDiscard('조회 조건이나 선택을 바꾸면 현재 입력을 폐기합니다.', () => { resetDraft(); setDetailId(''); setError(''); run() })
    const finish = () => { inFlight.current = false; if (mounted.current) setBusy(false) }
    const applySuccess = async (row: AccountView) => {
        resetDraft(); setDetailId(row.id); setCursors([]); setError('')
        cache.setQueryData(['account', userId, companyId, row.id], row)
        setNotice(row.active ? '계정의 현재 저장 상태를 확인했습니다.' : '사용을 중지했습니다. 코드와 식별자는 유지됩니다.')
        await cache.invalidateQueries({ queryKey: ['accounts', userId, companyId] })
    }
    const sendCreate = async (input: CreateAccountInput) => {
        if (inFlight.current || !session || !canWrite || !companyId) return
        inFlight.current = true; setBusy(true); setError(''); const current = generation.current
        try { const row = await accountApi.create(companyId, input, session.csrfToken); if (mounted.current && generation.current === current) await applySuccess(row) }
        catch (failure) {
            if (mounted.current && generation.current === current) {
                if (failure instanceof ApiError && failure.status === 401) { resetDraft(); expire() }
                else if (!(failure instanceof ApiError) || failure.status >= 500) { setUncertain(true); setError('등록 결과를 확인하지 못했습니다. 저장됐을 수 있으므로 같은 요청으로 재시도하거나 목록을 확인해 주세요.') }
                else { attempt.current = null; setUncertain(false); setError(message(failure)); if (failure.status === 403) await refreshPermissions(companyId) }
            }
        } finally { finish() }
    }
    // [B5] 기존 분류는 PATCH에 넣지 않는다. 미분류만 분류/방향 쌍을 한 번 보낸다.
    const sendChange = async (input: AccountFields | null) => {
        if (inFlight.current || !session || !canWrite || !detail.data || !detail.data.active || detail.isError || detail.isFetching) return
        const row = detail.data, patch: UpdateAccountInput = { version: row.version }
        if (input && input.name !== row.name) patch.name = input.name
        if (input && row.category === null && row.normalBalance === null) { patch.category = input.category; patch.normalBalance = input.normalBalance }
        if (input && Object.keys(patch).length === 1) { setDirty(false); setNotice('변경된 값이 없습니다.'); return }
        inFlight.current = true; setBusy(true); setError(''); const current = generation.current
        try { const saved = input ? await accountApi.update(companyId, row.id, patch, session.csrfToken) : await accountApi.deactivate(companyId, row.id, row.version, session.csrfToken); if (mounted.current && generation.current === current) await applySuccess(saved) }
        catch (failure) {
            if (mounted.current && generation.current === current) {
                if (failure instanceof ApiError && failure.status === 401) { resetDraft(); expire() }
                else {
                    setError(message(failure))
                    if (failure instanceof ApiError && failure.status === 403) await refreshPermissions(companyId)
                    if (failure instanceof ApiError && failure.status === 404) { resetDraft(); setDetailId(''); cache.removeQueries({ queryKey: ['account', userId, companyId, row.id] }); await cache.invalidateQueries({ queryKey: ['accounts', userId, companyId] }) }
                    if (!(failure instanceof ApiError) || failure.status === 409 || failure.status >= 500) { resetDraft(); setNotice('이전 입력을 폐기했습니다. 최신 상세를 확인하고 다시 입력해 주세요.'); await Promise.all([detail.refetch(), cache.invalidateQueries({ queryKey: ['accounts', userId, companyId] })]) }
                }
            }
        } finally { finish() }
    }
    if (companies.isPending) return <AsyncState kind="loading" title="회사 목록을 불러오는 중입니다" description="접근 가능한 회사를 확인합니다." />
    if (companies.isError && !companies.data) return <AsyncState kind="error" title="회사 목록을 불러오지 못했습니다" description={message(companies.error)} onRetry={() => { void companies.refetch() }} />
    const companyItems = companies.data?.pages.flatMap(page => page.items) ?? []
    if (!companyItems.length) return <AsyncState kind="empty" title="접근 가능한 회사가 없습니다" description="회사 소속과 조회 권한이 등록되면 계정과목을 확인할 수 있습니다." />
    return <div className="mx-auto max-w-[1500px] space-y-5 text-hud-text-primary">
        <header><p className="text-sm text-hud-text-muted">회계·세무</p><h1 className="mt-1 text-2xl font-bold">계정과목</h1><p className="mt-2 text-sm text-hud-text-muted">회사의 계정을 조회하고 관리합니다. 표준 템플릿·기초 잔액·전표·원장은 후속입니다.</p></header>
        <section className="hud-card rounded-xl p-4"><label htmlFor="account-company" className="mb-2 block font-medium">관리할 회사</label><select id="account-company" value={wantedCompany} disabled={locked} onChange={e => { const id = e.target.value; guardDiscard('회사를 바꾸면 현재 입력과 미확인 요청을 폐기합니다.', () => { void selectCompany(id) }) }} className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3"><option value="">회사를 선택하세요</option>{companyItems.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            {companies.hasNextPage && <Button type="button" variant="ghost" disabled={locked || companies.isFetchingNextPage} onClick={() => { void companies.fetchNextPage() }} className="mt-2 min-h-11">회사 더 불러오기</Button>}
            {companies.isError && <AsyncState kind="error" title="회사 목록을 갱신하지 못했습니다" description={message(companies.error)} onRetry={() => { void companies.refetch() }} />}
            {selection && <p className="mt-3 text-sm text-hud-text-muted">현재 역할: {selection.roles.map(role => roles[role]).join(', ')} · {canWrite ? '계정 관리 가능' : '조회 전용'}</p>}
        </section>
        {selecting && <p role="status">회사 권한을 확인하는 중입니다…</p>}
        {error && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-4">{error}</div>}
        {notice && <p role="status" className="text-sm text-hud-text-muted">{notice}</p>}
        {discard && <div role="alert" className="hud-card rounded-xl p-4"><p>{discard.label} 저장 결과가 미확인이면 먼저 목록에서 확인해 주세요.</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" disabled={locked} onClick={() => { const action = discard.run; setDiscard(null); action() }} className="min-h-11">입력 폐기 확인</Button><Button type="button" variant="ghost" disabled={locked} onClick={() => setDiscard(null)} className="min-h-11">계속 입력</Button></div></div>}
        {companyId && !canRead && <AsyncState kind="empty" title="계정 조회 권한이 없습니다" description="현재 회사 소속과 권한을 확인해 주세요." />}
        {companyId && canRead && <>
            {canWrite && <Button type="button" disabled={locked} onClick={() => guardDiscard('새 등록을 시작하면 현재 입력을 폐기합니다.', () => { resetDraft(); setDetailId(''); setError(''); setMode('create') })} className="min-h-11">새 계정 등록</Button>}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="min-w-0">{rows.isError && <AsyncState kind="error" title="계정 목록을 불러오지 못했습니다" description={message(rows.error)} onRetry={() => { if (!locked) void rows.refetch() }} />}
                    <AccountList key={companyId} items={rows.data?.items ?? []} filters={filters} locked={locked} fetching={rows.isFetching} failed={rows.isError} pageNumber={cursors.length + 1} previous={Boolean(cursors.length)} next={Boolean(rows.data?.nextCursor) && !rows.isError} selectedId={detailId} onFilter={value => changeView(() => { setFilters(value); setCursors([]) })} onSelect={id => changeView(() => setDetailId(id))} onPrevious={() => changeView(() => setCursors(stack => stack.slice(0, -1)))} onNext={() => changeView(() => { if (rows.data?.nextCursor) setCursors(stack => [...stack, rows.data!.nextCursor!]) })} onRefresh={() => changeView(() => { void rows.refetch() })} />
                </div><div className="min-w-0 space-y-4">
                    {mode === 'create' && canWrite && <AccountForm key={`create-${companyId}`} locked={locked || uncertain} onDirty={() => setDirty(true)} onCancel={() => guardDiscard('입력을 취소하면 현재 입력을 폐기합니다.', resetDraft)} onSubmit={fields => { if (inFlight.current || uncertain) return; const input = { ...fields, creationRequestId: crypto.randomUUID() }; attempt.current = input; void sendCreate(input) }} />}
                    {uncertain && mode === 'create' && <div className="hud-card rounded-xl p-4"><p>같은 등록의 결과를 확인하기 위해 고정한 내용으로 재시도할 수 있습니다.</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" disabled={locked || !canWrite} onClick={() => { if (attempt.current) void sendCreate(attempt.current) }} className="min-h-11">같은 요청으로 재시도</Button><Button type="button" variant="ghost" disabled={locked} onClick={() => { void rows.refetch() }} className="min-h-11">목록에서 결과 확인</Button><Button type="button" variant="ghost" disabled={locked} onClick={() => guardDiscard('미확인 요청을 폐기하면 복구할 수 없습니다.', resetDraft)} className="min-h-11">요청 폐기</Button></div></div>}
                    {detailId && detail.isFetching && <p role="status">계정 상세를 불러오는 중입니다…</p>}
                    {detailId && detail.isError && <AsyncState kind="error" title="계정 상세를 불러오지 못했습니다" description={message(detail.error)} onRetry={() => { if (!locked) void detail.refetch() }} />}
                    {detailId && detail.data && !detail.isError && <>{mode === 'edit' && canWrite && detail.data.active ? <AccountForm key={`edit-${companyId}-${detail.data.id}-${detail.data.version}`} initial={detail.data} locked={locked || detail.isFetching} onDirty={() => setDirty(true)} onSubmit={fields => { void sendChange(fields) }} onCancel={() => guardDiscard('수정을 취소하면 현재 입력을 폐기합니다.', resetDraft)} /> : <AccountDetail key={`${companyId}-${detail.data.id}-${detail.data.version}`} row={detail.data} canWrite={canWrite} busy={locked || detail.isFetching} onEdit={() => { setMode('edit'); setNotice(''); setError('') }} onDeactivate={() => sendChange(null)} />}</>}
                    {!detailId && mode === 'none' && <p className="hud-card rounded-xl p-5 text-hud-text-muted">목록에서 계정을 선택해 상세를 확인하세요.</p>}
                </div>
            </div>
        </>}
    </div>
}
