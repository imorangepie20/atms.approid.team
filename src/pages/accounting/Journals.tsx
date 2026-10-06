import { useCallback, useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AsyncState from '../../components/common/AsyncState'
import Button from '../../components/common/Button'
import JournalList from '../../components/journals/JournalList'
import JournalDetail from '../../components/journals/JournalDetail'
import JournalDraftForm from '../../components/journals/JournalDraftForm'
import { journalInputClass } from '../../components/journals/JournalReferencePicker'
import { journalUuid } from '../../lib/journalDraftForm'
import { ApiError, companyApi, journalApi, journalWorkflowApi, type CompanySelection, type CreateJournalInput, type JournalContent, type JournalDetailView, type JournalFilters, type JournalWorkflowActionInput } from '../../lib/api'

const message = (error: unknown) => !(error instanceof ApiError) ? '연결 상태를 확인하지 못했습니다. 다시 조회해 주세요.'
    : error.status === 400 ? '입력이나 조회 조건을 확인해 주세요.' : error.status === 403 ? '현재 회사 권한을 다시 확인해 주세요.'
        : error.status === 404 ? '전표 또는 참조 자료를 찾지 못했습니다.' : error.status === 409 ? '요청·버전·기간·참조 자격이 충돌했습니다. 현재 저장 상태를 확인해 주세요.'
            : error.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.' : '전표 서비스를 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.'
type Discard = { label: string; run: () => void }

// [B1/B5/B6, F05 A2] 조회 캐시와 현재 입력을 분리한다. 이 페이지는 초안의 승인 요청까지만 수행하고 승인/장부 처리는 하지 않는다.
export default function Journals() {
    const { session, expire } = useAuth(), cache = useQueryClient(), [params] = useSearchParams(), userId = session?.user.id ?? ''
    const [wantedCompany, setWantedCompany] = useState(''), [selection, setSelection] = useState<CompanySelection | null>(null), [selecting, setSelecting] = useState(false)
    const [refreshing, setRefreshing] = useState(false), [filters, setFilters] = useState<JournalFilters>({}), [cursors, setCursors] = useState<string[]>([])
    const [detailId, setDetailId] = useState(''), [mode, setMode] = useState<'none' | 'create' | 'edit'>('none'), [editInitial, setEditInitial] = useState<JournalDetailView>()
    const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [pending, setPending] = useState<'create' | 'edit' | null>(null)
    const [latestChecked, setLatestChecked] = useState(false)
    const [workflowAttempt, setWorkflowAttempt] = useState<JournalWorkflowActionInput | null>(null)
    const [error, setError] = useState(''), [notice, setNotice] = useState(''), [discard, setDiscard] = useState<Discard | null>(null)
    const inFlight = useRef(false), generation = useRef(0), mounted = useRef(true), refreshingRef = useRef(false), attempt = useRef<CreateJournalInput | null>(null), alert = useRef<HTMLDivElement>(null)
    const companyId = selection?.company.id ?? '', canRead = Boolean(selection?.permissions.includes('journal.read')), canWrite = Boolean(selection?.permissions.includes('journal.draft') && !refreshing)
    const viewLocked = busy || refreshing || Boolean(pending), cursor = cursors[cursors.length - 1]
    useEffect(() => { document.title = '전표 초안 · ATMS'; mounted.current = true; return () => { mounted.current = false; generation.current++; attempt.current = null } }, [])
    useEffect(() => { if (error) alert.current?.focus({ preventScroll: true }) }, [error])
    const companies = useInfiniteQuery({ queryKey: ['journal-companies', userId], enabled: Boolean(userId), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => companyApi.list(signal, { limit: 100, cursor: pageParam }), getNextPageParam: page => page.nextCursor ?? undefined })
    const years = useInfiniteQuery({ queryKey: ['journal-years', userId, companyId], enabled: Boolean(companyId && canRead), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => companyApi.fiscalYears(companyId, signal, pageParam), getNextPageParam: page => page.nextCursor ?? undefined })
    const rows = useQuery({ queryKey: ['journals', userId, companyId, filters.q ?? null, filters.fiscalYearId ?? null, filters.from ?? null, filters.to ?? null, cursor ?? null], enabled: Boolean(companyId && canRead), queryFn: ({ signal }) => journalApi.list(companyId, filters, cursor, signal) })
    const detail = useQuery({ queryKey: ['journal', userId, companyId, detailId], enabled: Boolean(companyId && canRead && detailId), queryFn: ({ signal }) => journalApi.detail(companyId, detailId, signal) })
    // [F05 A2] 버튼 권한은 현재 서버의 allowedActions로 판단한다. 회사/전표 키가 바뀌면 이전 응답은 재사용하지 않는다.
    const workflow = useQuery({ queryKey: ['journal-workflow', userId, companyId, detailId], enabled: Boolean(companyId && canRead && detailId), queryFn: ({ signal }) => journalWorkflowApi.detail(companyId, detailId, undefined, signal) })
    const clearDraft = () => { setMode('none'); setDirty(false); setPending(null); setLatestChecked(false); setEditInitial(undefined); attempt.current = null; setDiscard(null) }
    const clearCompany = useCallback(async (id: string) => {
        for (const prefix of ['journals', 'journal', 'journal-workflow', 'approval-workflow-history', 'journal-approvals', 'journal-years', 'journal-reference', 'journal-reference-detail', 'evidence-journals']) {
            await cache.cancelQueries({ queryKey: [prefix, userId, id] }); cache.removeQueries({ queryKey: [prefix, userId, id] })
        }
    }, [cache, userId])
    const chooseCompany = async (id: string): Promise<boolean> => {
        const current = ++generation.current
        if (companyId) await clearCompany(companyId)
        if (!mounted.current || generation.current !== current) return false
        clearDraft(); setWorkflowAttempt(null); setSelection(null); setWantedCompany(id); setDetailId(''); setFilters({}); setCursors([]); setError(''); setNotice('')
        if (!id || !session) { setSelecting(false); return false }
        setSelecting(true)
        try { const value = await companyApi.select(id, session.csrfToken); if (mounted.current && generation.current === current) { setSelection(value); return true } }
        catch (failure) { if (mounted.current && generation.current === current) { if (failure instanceof ApiError && failure.status === 401) expire(); else setError(message(failure)) } }
        finally { if (mounted.current && generation.current === current) setSelecting(false) }
        return false
    }
    // [B1] 링크의 회사/초안 ID만 읽는다. 현재 회사 권한을 다시 확인하며 URL에서 업무 본문은 받지 않는다.
    useEffect(() => {
        const c = params.get('companyId'), id = params.get('journalId')
        if (!c && !id) return
        if (!c || !journalUuid.safeParse(c).success || (id && !journalUuid.safeParse(id).success)) { setError('올바른 회사/전표 초안 링크를 확인해 주세요.'); return }
        let cancelled = false
        void chooseCompany(c.toLowerCase()).then(ok => { if (ok && !cancelled && id) setDetailId(id.toLowerCase()) })
        return () => { cancelled = true }
        // 회사 선택은 해당 링크 진입 때 한 번 수행한다. 세션 값의 재렌더로 자동 선택하지 않는다.
    }, [params])
    const refreshPermissions = useCallback(async () => {
        if (!companyId || !session || refreshingRef.current) return
        refreshingRef.current = true; setRefreshing(true); const current = generation.current
        try {
            const value = await companyApi.select(companyId, session.csrfToken)
            if (mounted.current && generation.current === current) {
                setSelection(value); clearDraft()
                if (!value.permissions.includes('journal.read')) { await clearCompany(companyId); setDetailId('') }
                setNotice('현재 회사 권한을 다시 확인했습니다. 입력은 새로 시작해 주세요.')
            }
        } catch (failure) {
            if (mounted.current && generation.current === current) { await clearCompany(companyId); clearDraft(); setSelection(null); setWantedCompany(''); setDetailId(''); if (failure instanceof ApiError && failure.status === 401) expire(); else setError('회사 접근 권한을 확인하지 못했습니다. 회사를 다시 선택해 주세요.') }
        } finally { refreshingRef.current = false; if (mounted.current && generation.current === current) setRefreshing(false) }
    }, [companyId, session, clearCompany, expire])
    const accessError = useCallback((failure: unknown) => { if (failure instanceof ApiError && failure.status === 401) expire(); else if (failure instanceof ApiError && failure.status === 403) void refreshPermissions() }, [expire, refreshPermissions])
    useEffect(() => { const failure = companies.error ?? years.error ?? rows.error ?? detail.error ?? workflow.error; if (failure) accessError(failure) }, [companies.error, years.error, rows.error, detail.error, workflow.error, accessError])
    const guardDiscard = (label: string, run: () => void) => { if (busy || refreshing) return; if (dirty || pending || workflowAttempt) setDiscard({ label, run }); else run() }
    const changeView = (run: () => void) => guardDiscard('화면을 바꾸면 미저장·미확인 입력을 폐기합니다.', () => { clearDraft(); setWorkflowAttempt(null); setDetailId(''); setError(''); run() })
    const finish = () => { inFlight.current = false; if (mounted.current) setBusy(false) }
    const success = async (saved: JournalDetailView) => {
        clearDraft(); setDetailId(saved.id); setCursors([]); setError(''); cache.setQueryData(['journal', userId, companyId, saved.id], saved)
        setNotice(saved.status === 'DRAFT' ? '전표 초안의 현재 저장 상태를 확인했습니다.' : '전표의 현재 상태를 확인했습니다.')
        await Promise.all([cache.invalidateQueries({ queryKey: ['journals', userId, companyId] }), cache.invalidateQueries({ queryKey: ['evidence-journals', userId, companyId] })])
    }
    const create = async (input: CreateJournalInput) => {
        if (inFlight.current || !session || !canWrite || !companyId) return
        inFlight.current = true; setBusy(true); setError(''); const current = generation.current
        try { const saved = await journalApi.create(companyId, input, session.csrfToken); if (mounted.current && generation.current === current) await success(saved) }
        catch (failure) {
            if (mounted.current && generation.current === current) {
                if (failure instanceof ApiError && failure.status === 401) { clearDraft(); expire() }
                else if (!(failure instanceof ApiError) || failure.status >= 500) { setPending('create'); setError('등록 결과를 확인하지 못했습니다. 저장됐을 수 있으므로 같은 요청으로 다시 확인하거나 목록을 확인해 주세요.') }
                else { attempt.current = null; setPending(null); setError(message(failure)); if (failure.status === 403) await refreshPermissions(); if (failure.status === 409 || failure.status === 404) await cache.invalidateQueries({ queryKey: ['journal-reference', userId, companyId] }) }
            }
        } finally { finish() }
    }
    const update = async (content: JournalContent) => {
        // [F05 W7] 화면에 새 상태가 도착하면 열려 있던 초안 폼도 제출하지 않는다. 서버도 잠금 후 재검사한다.
        if (inFlight.current || !session || !canWrite || !companyId || !editInitial || editInitial.status !== 'DRAFT'
            || (detail.data && detail.data.status !== 'DRAFT')) return
        inFlight.current = true; setBusy(true); setError(''); const current = generation.current
        try { const saved = await journalApi.update(companyId, editInitial.id, { version: editInitial.version, ...content }, session.csrfToken); if (mounted.current && generation.current === current) await success(saved) }
        catch (failure) {
            if (mounted.current && generation.current === current) {
                if (failure instanceof ApiError && failure.status === 401) { clearDraft(); expire() }
                else { setError(message(failure)); if (failure instanceof ApiError && failure.status === 403) await refreshPermissions()
                    else if (failure instanceof ApiError && failure.status === 404) { clearDraft(); setDetailId(''); await cache.invalidateQueries({ queryKey: ['journals', userId, companyId] }) }
                    else if (!(failure instanceof ApiError) || failure.status === 409 || failure.status >= 500) { setLatestChecked(false); setPending('edit') } }
            }
        } finally { finish() }
    }
    const submit = (content: JournalContent, fiscalYearId: string) => {
        if (inFlight.current || pending) return
        if (mode === 'create') { const input = { creationRequestId: crypto.randomUUID(), fiscalYearId, ...content }; attempt.current = input; void create(input) }
        else if (mode === 'edit') void update(content)
    }
    const submitForApproval = async (input: JournalWorkflowActionInput) => {
        if (inFlight.current || !session || !companyId || !detailId || (!workflowAttempt && !workflow.data?.allowedActions.includes('SUBMIT'))) return
        inFlight.current = true; setBusy(true); setError(''); const current = generation.current
        try {
            await journalWorkflowApi.action(companyId, detailId, 'SUBMIT', input, session.csrfToken)
            if (mounted.current && generation.current === current) {
                setWorkflowAttempt(null); setNotice('승인 요청의 현재 상태를 다시 확인했습니다.')
                await Promise.all([
                    cache.invalidateQueries({ queryKey: ['journals', userId, companyId] }),
                    cache.invalidateQueries({ queryKey: ['journal', userId, companyId, detailId] }),
                    cache.invalidateQueries({ queryKey: ['journal-workflow', userId, companyId, detailId] }),
                    cache.invalidateQueries({ queryKey: ['approval-workflow-history', userId, companyId, detailId] }),
                    cache.invalidateQueries({ queryKey: ['journal-approvals', userId, companyId] }),
                    cache.invalidateQueries({ queryKey: ['evidence-journals', userId, companyId] }),
                ])
            }
        } catch (failure) {
            if (mounted.current && generation.current === current) {
                if (failure instanceof ApiError && failure.status === 401) expire()
                else if (!(failure instanceof ApiError) || failure.status >= 500 || failure.status === 429) {
                    setWorkflowAttempt(input); setError('승인 요청 결과를 확인하지 못했습니다. 저장됐을 수 있습니다. 같은 요청으로 결과를 확인하거나 현재 상태를 다시 조회해 주세요.')
                } else {
                    setWorkflowAttempt(null); setError(message(failure))
                    if (failure.status === 403) await refreshPermissions()
                    if (failure.status === 409 || failure.status === 404) {
                        await Promise.all([workflow.refetch(), detail.refetch()])
                    }
                }
            }
        } finally { finish() }
    }
    const yearItems = years.data?.pages.flatMap(p => p.items) ?? [], companyItems = companies.data?.pages.flatMap(p => p.items) ?? []
    if (companies.isPending) return <AsyncState kind="loading" title="회사 목록을 불러오는 중입니다" description="접근 가능한 회사를 확인합니다." />
    if (companies.isError && !companies.data) return <AsyncState kind="error" title="회사 목록을 불러오지 못했습니다" description={message(companies.error)} onRetry={() => void companies.refetch()} />
    if (!companyItems.length) return <AsyncState kind="empty" title="접근 가능한 회사가 없습니다" description="회사 소속과 조회 권한을 확인해 주세요." />
    return <main className="mx-auto max-w-[1500px] space-y-6 min-w-0">
        <header className="hud-card rounded-xl p-4 sm:p-6"><h1 className="text-2xl font-semibold">전표 초안</h1><p className="mt-2 text-sm text-hud-text-muted">회사를 선택해 확정 전 전표를 조회하고 입력합니다.</p><label className="mt-4 mb-2 block" htmlFor="journal-company">전표 회사</label><select id="journal-company" className={journalInputClass} value={wantedCompany} disabled={viewLocked} onChange={e => { const id = e.target.value; guardDiscard('회사를 바꾸면 현재 입력을 폐기합니다.', () => void chooseCompany(id)) }}><option value="">회사 선택</option>{companyItems.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            {companies.hasNextPage && <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={viewLocked || companies.isFetching} onClick={() => void companies.fetchNextPage()}>회사 더 불러오기</Button>}
        </header>
        {selecting && <AsyncState kind="loading" title="회사 권한 확인 중" description="현재 소속과 역할을 확인합니다." />}
        {error && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-4 break-words">{error}</div>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {discard && <section aria-label="입력 폐기 확인" className="hud-card rounded-xl p-4"><p>{discard.label} 미확인 요청은 이미 저장됐을 수 있습니다.</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" className="min-h-11" onClick={() => { const run = discard.run; setDiscard(null); run() }}>입력 폐기 확인</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setDiscard(null)}>입력 유지</Button></div></section>}
        {selection && !canRead && <AsyncState kind="empty" title="전표 조회 권한이 없습니다" description="현재 회사의 역할과 권한을 확인해 주세요." />}
        {companyId && canRead && <>
            <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" className="min-h-11" disabled={viewLocked} onClick={() => void refreshPermissions()}>회사 권한 다시 확인</Button>{canWrite && <Button type="button" className="min-h-11" disabled={viewLocked || years.isPending || years.isError || !yearItems.length} onClick={() => changeView(() => setMode('create'))}>새 전표 초안</Button>}{years.hasNextPage && <Button type="button" className="min-h-11" disabled={viewLocked || years.isFetching} onClick={() => void years.fetchNextPage()}>회계기간 더 불러오기</Button>}</div>
            {years.isError && <AsyncState kind="error" title="회계기간을 불러오지 못했습니다" description={message(years.error)} onRetry={() => void years.refetch()} />}
            {!years.isPending && !years.isError && !yearItems.length && <p role="status">등록된 회계기간이 없습니다. 회사 관리에서 회계기간을 확인해 주세요.</p>}
            {pending && <section aria-label="저장 상태 확인" className="hud-card rounded-xl p-4 space-y-3"><p>입력은 보관한 채 잠겼습니다. 자동 재전송하지 않습니다.</p><div className="flex flex-wrap gap-3">
                {pending === 'create' && <><Button type="button" className="min-h-11" disabled={busy || refreshing || !canWrite} onClick={() => { if (attempt.current) void create(attempt.current) }}>같은 요청으로 다시 확인</Button><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => guardDiscard('미확인 입력을 폐기하고 저장 목록을 확인합니다.', () => { clearDraft(); setDetailId(''); setCursors([]); void rows.refetch() })}>저장 목록 확인</Button></>}
                {pending === 'edit' && <><Button type="button" variant="outline" className="min-h-11" disabled={busy || detail.isFetching} onClick={() => { setLatestChecked(false); void detail.refetch().then(result => { if (mounted.current && !result.isError && result.data?.status === 'DRAFT') setLatestChecked(true) }) }}>현재 저장 상태 확인</Button><Button type="button" className="min-h-11" disabled={busy || detail.isFetching || detail.isError || !detail.data || detail.data.status !== 'DRAFT' || !canWrite || !latestChecked} onClick={() => guardDiscard('보관한 입력을 폐기하고 조회된 저장 상태로 새 수정을 시작합니다.', () => { const latest = detail.data!; if (latest.status !== 'DRAFT') return; clearDraft(); setEditInitial(latest); setMode('edit') })}>기존 입력 폐기하고 다시 수정</Button></>}
            </div></section>}
            {workflowAttempt && <section aria-label="승인 요청 상태 확인" className="hud-card rounded-xl p-4 space-y-3"><p>승인 요청은 자동 재전송하지 않습니다.</p><div className="flex flex-wrap gap-3"><Button type="button" className="min-h-11" disabled={viewLocked} onClick={() => void submitForApproval(workflowAttempt)}>같은 승인 요청으로 결과 확인</Button><Button type="button" variant="outline" className="min-h-11" disabled={viewLocked} onClick={() => { setWorkflowAttempt(null); void workflow.refetch(); void detail.refetch() }}>현재 전표 상태 조회</Button></div></section>}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {rows.isError ? <AsyncState kind="error" title="전표 목록을 불러오지 못했습니다" description={message(rows.error)} onRetry={() => void rows.refetch()} /> : <JournalList key={companyId} rows={rows.data?.items ?? []} years={yearItems} filters={filters} locked={viewLocked} fetching={rows.isFetching} previous={cursors.length > 0} next={Boolean(rows.data?.nextCursor)} page={cursors.length + 1} onFilters={value => changeView(() => { setFilters(value); setCursors([]) })} onSelect={id => changeView(() => setDetailId(id))} onPrevious={() => changeView(() => setCursors(current => current.slice(0, -1)))} onNext={() => changeView(() => { if (rows.data?.nextCursor) setCursors(current => [...current, rows.data!.nextCursor!]) })} onRefresh={() => void rows.refetch()} />}
                <div className="space-y-6 min-w-0">
                    {mode !== 'none' && canWrite && (mode !== 'edit' || (editInitial?.status === 'DRAFT' && detail.data?.status === 'DRAFT')) && <JournalDraftForm key={`${companyId}-${mode}-${editInitial?.id ?? 'new'}-${editInitial?.version ?? 0}`} companyId={companyId} userId={userId} years={yearItems} initial={mode === 'edit' ? editInitial : undefined} locked={viewLocked} onAccessError={accessError} onDirty={() => setDirty(true)} onSubmit={submit} onCancel={() => guardDiscard('입력을 취소합니다.', clearDraft)} />}
                    {detailId && (detail.isPending ? <AsyncState kind="loading" title="전표 상세 확인 중" description="잠시 기다려 주세요." /> : detail.isError ? <AsyncState kind="error" title="전표 상세를 불러오지 못했습니다" description={message(detail.error)} onRetry={() => void detail.refetch()} /> : detail.data && <JournalDetail row={detail.data} companyId={companyId} userId={userId} canWrite={canWrite && mode === 'none' && !detail.isFetching} canSubmit={Boolean(workflow.data?.allowedActions.includes('SUBMIT') && !workflow.isFetching && !workflowAttempt && mode === 'none')} locked={viewLocked} onAccessError={accessError} onSubmitApproval={() => { if (detail.data?.status === 'DRAFT') void submitForApproval({ version: detail.data.version, actionRequestId: crypto.randomUUID() }) }} onEdit={() => { if (detail.data?.status !== 'DRAFT') return; setEditInitial(detail.data); setMode('edit'); setDirty(false); setError('') }} />)}
                    {detailId && workflow.isError && <AsyncState kind="error" title="승인 권한을 확인하지 못했습니다" description={message(workflow.error)} onRetry={() => void workflow.refetch()} />}
                </div>
            </div>
        </>}
    </main>
}
