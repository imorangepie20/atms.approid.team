import { useCallback, useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AsyncState from '../../components/common/AsyncState'
import Button from '../../components/common/Button'
import ApprovalQueue from '../../components/journals/ApprovalQueue'
import ApprovalDetail from '../../components/journals/ApprovalDetail'
import ApprovalActionForm from '../../components/journals/ApprovalActionForm'
import { journalInputClass } from '../../components/journals/JournalReferencePicker'
import { journalUuid } from '../../lib/journalDraftForm'
import { ApiError, companyApi, journalWorkflowApi, type CompanySelection, type JournalApprovalFilters, type JournalWorkflowAction, type JournalWorkflowActionInput } from '../../lib/api'

type Attempt = { companyId: string; journalId: string; action: JournalWorkflowAction; input: JournalWorkflowActionInput & { reason?: string } }
const failureMessage = (error: unknown) => !(error instanceof ApiError) ? '연결 상태를 확인하지 못했습니다. 현재 상태를 다시 조회해 주세요.'
    : error.status === 400 ? '조회 조건이나 요청을 확인해 주세요.' : error.status === 403 ? '현재 회사 권한을 다시 확인해 주세요.'
        : error.status === 404 ? '전표가 없거나 다른 회사의 자료입니다.' : error.status === 409 ? '현재 상태가 변경됐습니다. 다시 조회한 뒤 가능한 처리를 확인해 주세요.'
            : error.status === 429 ? '요청이 많습니다. 잠시 후 같은 요청으로 결과를 확인해 주세요.' : '승인 서비스를 사용할 수 없습니다. 현재 상태를 다시 확인해 주세요.'

// [F05 A3~A6 승인 페이지] URL에는 회사/전표 ID만 둔다. 권한과 allowedActions는 매번 서버가 결정한다.
export default function Approvals() {
    const { session, expire } = useAuth(), cache = useQueryClient(), [params] = useSearchParams(), userId = session?.user.id ?? ''
    const [wantedCompany, setWantedCompany] = useState(''), [selection, setSelection] = useState<CompanySelection | null>(null)
    const [selecting, setSelecting] = useState(false), [refreshing, setRefreshing] = useState(false)
    const [filters, setFilters] = useState<JournalApprovalFilters>({ status: 'SUBMITTED', limit: 20 }), [cursors, setCursors] = useState<string[]>([])
    const [detailId, setDetailId] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState<Attempt | null>(null)
    const [error, setError] = useState(''), [notice, setNotice] = useState('')
    const mounted = useRef(true), generation = useRef(0), inFlight = useRef(false), refreshingRef = useRef(false)
    const alert = useRef<HTMLDivElement>(null), initialLink = useRef({ companyId: params.get('companyId'), journalId: params.get('journalId') })
    const companyId = selection?.company.id ?? '', canRead = Boolean(selection?.permissions.includes('journal.read'))
    const locked = busy || selecting || refreshing || Boolean(uncertain), cursor = cursors[cursors.length - 1]
    useEffect(() => { document.title = '전표 승인 · ATMS'; mounted.current = true; return () => { mounted.current = false; generation.current++ } }, [])
    useEffect(() => { if (error) alert.current?.focus({ preventScroll: true }) }, [error])
    const companies = useInfiniteQuery({ queryKey: ['approval-companies', userId], enabled: Boolean(userId), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => companyApi.list(signal, { limit: 100, cursor: pageParam }), getNextPageParam: page => page.nextCursor ?? undefined })
    const years = useInfiniteQuery({ queryKey: ['approval-years', userId, companyId], enabled: Boolean(companyId && canRead), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => companyApi.fiscalYears(companyId, signal, pageParam), getNextPageParam: page => page.nextCursor ?? undefined })
    const rows = useQuery({ queryKey: ['journal-approvals', userId, companyId, filters, cursor ?? null], enabled: Boolean(companyId && canRead), queryFn: ({ signal }) => journalWorkflowApi.list(companyId, filters, cursor, signal) })
    // [F05 A4 실제 브라우저 수리] 초안의 단일 workflow 캐시와 이력 무한목록의 자료 모양이 달라 키를 분리한다.
    const workflow = useInfiniteQuery({ queryKey: ['approval-workflow-history', userId, companyId, detailId], enabled: Boolean(companyId && canRead && detailId), initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => journalWorkflowApi.detail(companyId, detailId, pageParam, signal), getNextPageParam: page => page.history.nextCursor ?? undefined })
    const current = workflow.data?.pages[0], events = workflow.data?.pages.flatMap(page => page.history.items) ?? []
    const clearCompany = useCallback(async (id: string) => {
        for (const prefix of ['journal-approvals', 'journal-workflow', 'approval-workflow-history', 'approval-years', 'journal', 'journals', 'evidence-journals', 'opening-balance', 'journal-book', 'account-ledger']) {
            await cache.cancelQueries({ queryKey: [prefix, userId, id] }); cache.removeQueries({ queryKey: [prefix, userId, id] })
        }
    }, [cache, userId])
    const chooseCompany = async (id: string, linkedJournal = '') => {
        if (inFlight.current || refreshingRef.current || uncertain) return
        const token = ++generation.current
        if (companyId) await clearCompany(companyId)
        if (!mounted.current || generation.current !== token) return
        setSelection(null); setWantedCompany(id); setDetailId(''); setFilters({ status: 'SUBMITTED', limit: 20 }); setCursors([]); setError(''); setNotice('')
        if (!id || !session) return
        setSelecting(true)
        try {
            const value = await companyApi.select(id, session.csrfToken)
            if (mounted.current && generation.current === token) { setSelection(value); if (linkedJournal) setDetailId(linkedJournal) }
        } catch (failure) {
            if (mounted.current && generation.current === token) { if (failure instanceof ApiError && failure.status === 401) expire(); else setError(failureMessage(failure)) }
        } finally { if (mounted.current && generation.current === token) setSelecting(false) }
    }
    useEffect(() => {
        const { companyId: id, journalId } = initialLink.current
        if (!id && !journalId) return
        if (!id || !journalUuid.safeParse(id).success || (journalId && !journalUuid.safeParse(journalId).success)) { setError('올바른 회사·전표 링크를 확인해 주세요.'); return }
        void chooseCompany(id.toLowerCase(), journalId?.toLowerCase())
        // 최초 링크에서만 회사 선택. 회사 변경은 선택 입력이 수행한다.
    }, [])
    const refreshPermissions = useCallback(async () => {
        if (!companyId || !session || refreshingRef.current) return
        refreshingRef.current = true; setRefreshing(true); const token = generation.current
        try {
            const value = await companyApi.select(companyId, session.csrfToken)
            if (mounted.current && generation.current === token) {
                setSelection(value); setNotice('현재 회사 권한을 다시 확인했습니다.')
                if (!value.permissions.includes('journal.read')) { await clearCompany(companyId); setDetailId('') }
            }
        } catch (failure) {
            if (mounted.current && generation.current === token) { await clearCompany(companyId); setSelection(null); setWantedCompany(''); setDetailId(''); if (failure instanceof ApiError && failure.status === 401) expire(); else setError('회사 접근 권한을 확인하지 못했습니다. 회사를 다시 선택해 주세요.') }
        } finally { refreshingRef.current = false; if (mounted.current && generation.current === token) setRefreshing(false) }
    }, [companyId, session, clearCompany, expire])
    const accessError = useCallback((failure: unknown) => { if (failure instanceof ApiError && failure.status === 401) expire(); else if (failure instanceof ApiError && failure.status === 403) void refreshPermissions() }, [expire, refreshPermissions])
    useEffect(() => { const failure = companies.error ?? years.error ?? rows.error ?? workflow.error; if (failure) accessError(failure) }, [companies.error, years.error, rows.error, workflow.error, accessError])
    const refreshAfterAction = async (attempt: Attempt) => {
        setCursors([])
        await Promise.all([
            cache.invalidateQueries({ queryKey: ['journal-approvals', userId, attempt.companyId] }),
            cache.invalidateQueries({ queryKey: ['journal-workflow', userId, attempt.companyId, attempt.journalId] }),
            cache.invalidateQueries({ queryKey: ['approval-workflow-history', userId, attempt.companyId, attempt.journalId] }),
            cache.invalidateQueries({ queryKey: ['journal', userId, attempt.companyId, attempt.journalId] }),
            cache.invalidateQueries({ queryKey: ['journals', userId, attempt.companyId] }),
            cache.invalidateQueries({ queryKey: ['evidence-journals', userId, attempt.companyId] }),
            // [F05 B4] POSTED 전이는 기초 잔액 상태와 두 원장 조회를 즉시 무효화한다.
            cache.invalidateQueries({ queryKey: ['opening-balance', userId, attempt.companyId] }),
            cache.invalidateQueries({ queryKey: ['journal-book', userId, attempt.companyId] }),
            cache.invalidateQueries({ queryKey: ['account-ledger', userId, attempt.companyId] }),
        ])
    }
    const execute = async (attempt: Attempt, retry = false) => {
        if (inFlight.current || !session || companyId !== attempt.companyId || detailId !== attempt.journalId || (!retry && !current?.allowedActions.includes(attempt.action))) return
        inFlight.current = true; setBusy(true); setError(''); const token = generation.current
        try {
            const result = await journalWorkflowApi.action(attempt.companyId, attempt.journalId, attempt.action, attempt.input, session.csrfToken)
            if (mounted.current && generation.current === token) {
                setUncertain(null); setNotice(`처리 결과를 확인했습니다: ${result.status} · 버전 ${result.version}.`)
                await refreshAfterAction(attempt)
            }
        } catch (failure) {
            if (mounted.current && generation.current === token) {
                if (failure instanceof ApiError && failure.status === 401) expire()
                else if (!(failure instanceof ApiError) || failure.status === 429 || failure.status >= 500) {
                    setUncertain(attempt); setError('처리 결과를 확인하지 못했습니다. 저장됐을 수 있으므로 같은 요청으로 결과를 확인하거나 현재 상태를 조회해 주세요.')
                } else {
                    setUncertain(null); setError(failureMessage(failure))
                    if (failure.status === 403) await refreshPermissions()
                    if (failure.status === 409 || failure.status === 404) await refreshAfterAction(attempt)
                }
            }
        } finally { inFlight.current = false; if (mounted.current) setBusy(false) }
    }
    const selectRow = (id: string) => { if (locked) return; setDetailId(id); setError(''); setNotice('') }
    const companyItems = companies.data?.pages.flatMap(page => page.items) ?? [], yearItems = years.data?.pages.flatMap(page => page.items) ?? []
    if (companies.isPending) return <AsyncState kind="loading" title="회사 목록을 불러오는 중입니다" description="접근 가능한 회사를 확인합니다." />
    if (companies.isError && !companies.data) return <AsyncState kind="error" title="회사 목록을 불러오지 못했습니다" description={failureMessage(companies.error)} onRetry={() => void companies.refetch()} />
    if (!companyItems.length) return <AsyncState kind="empty" title="접근 가능한 회사가 없습니다" description="회사 소속과 조회 권한을 확인해 주세요." />
    return <main className="mx-auto max-w-[1500px] space-y-6 min-w-0">
        <header className="hud-card rounded-xl p-4 sm:p-6"><h1 className="text-2xl font-semibold">전표 승인</h1><p className="mt-2 text-sm text-hud-text-muted">회사별 승인 요청과 처리 이력을 확인합니다.</p><label htmlFor="approval-company" className="mt-4 mb-2 block">승인 회사</label><select id="approval-company" className={journalInputClass} value={wantedCompany} disabled={locked} onChange={event => void chooseCompany(event.target.value)}><option value="">회사 선택</option>{companyItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{companies.hasNextPage && <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={locked || companies.isFetching} onClick={() => void companies.fetchNextPage()}>회사 더 불러오기</Button>}</header>
        {selecting && <AsyncState kind="loading" title="회사 권한 확인 중" description="현재 소속과 역할을 확인합니다." />}
        {error && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-4 break-words">{error}</div>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {selection && !canRead && <AsyncState kind="empty" title="승인 전표 조회 권한이 없습니다" description="현재 회사의 역할과 권한을 확인해 주세요." />}
        {companyId && canRead && <><div className="flex flex-wrap gap-3"><Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={() => void refreshPermissions()}>회사 권한 다시 확인</Button>{years.hasNextPage && <Button type="button" variant="outline" className="min-h-11" disabled={locked || years.isFetching} onClick={() => void years.fetchNextPage()}>회계기간 더 불러오기</Button>}</div>
            {years.isError && <AsyncState kind="error" title="회계기간을 불러오지 못했습니다" description={failureMessage(years.error)} onRetry={() => void years.refetch()} />}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {rows.isError ? <AsyncState kind="error" title="승인 목록을 불러오지 못했습니다" description={failureMessage(rows.error)} onRetry={() => void rows.refetch()} /> : <ApprovalQueue key={companyId} rows={rows.data?.items ?? []} years={yearItems} filters={filters} locked={locked} fetching={rows.isFetching} previous={cursors.length > 0} next={Boolean(rows.data?.nextCursor)} page={cursors.length + 1} onFilters={value => { setFilters(value); setCursors([]); setDetailId('') }} onSelect={selectRow} onPrevious={() => setCursors(value => value.slice(0, -1))} onNext={() => { if (rows.data?.nextCursor) setCursors(value => [...value, rows.data!.nextCursor!]) }} onRefresh={() => void rows.refetch()} />}
                <div className="space-y-6 min-w-0">{detailId && (workflow.isPending ? <AsyncState kind="loading" title="승인 상세 확인 중" description="잠시 기다려 주세요." /> : workflow.isError ? <AsyncState kind="error" title="승인 상세를 불러오지 못했습니다" description={failureMessage(workflow.error)} onRetry={() => void workflow.refetch()} /> : current && <><ApprovalDetail companyId={companyId} userId={userId} workflow={current} events={events} hasMore={Boolean(workflow.hasNextPage)} loadingMore={workflow.isFetchingNextPage} onMore={() => void workflow.fetchNextPage()} onAccessError={accessError} /><ApprovalActionForm allowed={current.allowedActions} locked={busy || refreshing} uncertain={Boolean(uncertain)} onAction={(action, reason) => void execute({ companyId, journalId: detailId, action, input: { version: current.journal.version, actionRequestId: crypto.randomUUID(), ...(reason ? { reason } : {}) } })} onRetry={() => { if (uncertain) void execute(uncertain, true) }} onRefresh={() => { setUncertain(null); void workflow.refetch(); void rows.refetch() }} /></>)}</div>
            </div>
        </>}
    </main>
}
