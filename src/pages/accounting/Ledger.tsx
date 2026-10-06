import { useCallback, useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AsyncState from '../../components/common/AsyncState'
import Button from '../../components/common/Button'
import OpeningBalanceForm from '../../components/journals/OpeningBalanceForm'
import JournalBook from '../../components/journals/JournalBook'
import AccountLedger from '../../components/journals/AccountLedger'
import { journalInputClass } from '../../components/journals/JournalReferencePicker'
import { journalUuid } from '../../lib/journalDraftForm'
import { ApiError, companyApi, type CompanySelection } from '../../lib/api'

type Tab = 'opening' | 'journal-book' | 'account-ledger'
const tabs: { id: Tab; label: string }[] = [{ id: 'opening', label: '기초 잔액' }, { id: 'journal-book', label: '분개장' }, { id: 'account-ledger', label: '계정별 원장' }]
const failureMessage = (error: unknown) => !(error instanceof ApiError) ? '연결 상태를 확인하지 못했습니다. 다시 조회해 주세요.'
    : error.status === 403 ? '현재 회사의 장부 조회 권한을 확인해 주세요.' : error.status === 404 ? '회사 자료를 찾지 못했습니다.' : '장부 서비스를 사용할 수 없습니다.'

// [F04 B2/B7] 회사 선택과 세 장부 탭의 캐시를 사용자·회사별로 분리한다. URL에는 업무 본문을 넣지 않는다.
export default function Ledger() {
    const { session, expire } = useAuth(), userId = session?.user.id ?? '', cache = useQueryClient(), [params, setParams] = useSearchParams()
    const initial = useRef({ companyId: params.get('companyId') ?? '', tab: params.get('tab') as Tab | null })
    const [wantedCompany, setWantedCompany] = useState(''), [selection, setSelection] = useState<CompanySelection | null>(null)
    const [tab, setTab] = useState<Tab>(tabs.some(item => item.id === initial.current.tab) ? initial.current.tab! : 'opening')
    const [selecting, setSelecting] = useState(false), [refreshing, setRefreshing] = useState(false), [childBusy, setChildBusy] = useState(false)
    const [error, setError] = useState(''), [notice, setNotice] = useState('')
    const mounted = useRef(true), generation = useRef(0), refreshingRef = useRef(false), alert = useRef<HTMLDivElement>(null)
    const companyId = selection?.company.id ?? '', canRead = Boolean(selection?.permissions.includes('journal.read'))
    const canWrite = Boolean(selection?.permissions.includes('journal.draft')), locked = selecting || refreshing || childBusy
    useEffect(() => { document.title = '기초 잔액·원장 · ATMS'; mounted.current = true; return () => { mounted.current = false; generation.current++ } }, [])
    useEffect(() => { if (error) alert.current?.focus({ preventScroll: true }) }, [error])
    const companies = useInfiniteQuery({ queryKey: ['ledger-companies', userId], enabled: Boolean(userId), initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.list(signal, { limit: 100, cursor: pageParam }), getNextPageParam: page => page.nextCursor ?? undefined })
    const years = useInfiniteQuery({ queryKey: ['ledger-years', userId, companyId], enabled: Boolean(companyId && canRead), initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.fiscalYears(companyId, signal, pageParam), getNextPageParam: page => page.nextCursor ?? undefined })
    const clearCompany = useCallback(async (id: string) => {
        for (const prefix of ['opening-balance', 'journal-book', 'account-ledger', 'ledger-accounts', 'ledger-years', 'journal-workflow']) {
            await cache.cancelQueries({ queryKey: [prefix, userId, id] }); cache.removeQueries({ queryKey: [prefix, userId, id] })
        }
    }, [cache, userId])
    const updateUrl = (id: string, nextTab = tab) => setParams(id ? { companyId: id, tab: nextTab } : { tab: nextTab }, { replace: true })
    const chooseCompany = useCallback(async (id: string) => {
        if (locked) return
        const token = ++generation.current
        if (companyId) await clearCompany(companyId)
        if (!mounted.current || generation.current !== token) return
        setWantedCompany(id); setSelection(null); setError(''); setNotice(''); updateUrl(id)
        if (!id || !session) return
        setSelecting(true)
        try {
            const value = await companyApi.select(id, session.csrfToken)
            if (mounted.current && generation.current === token) setSelection(value)
        } catch (failure) {
            if (mounted.current && generation.current === token) { if (failure instanceof ApiError && failure.status === 401) expire(); else setError(failureMessage(failure)) }
        } finally { if (mounted.current && generation.current === token) setSelecting(false) }
    }, [locked, companyId, clearCompany, tab, session, expire])
    useEffect(() => {
        const id = initial.current.companyId
        if (!id) return
        if (!journalUuid.safeParse(id).success) { setError('올바른 회사 링크를 확인해 주세요.'); return }
        void chooseCompany(id.toLowerCase())
        // 최초 URL 회사만 자동 선택한다.
    }, [])
    const refreshPermissions = useCallback(async () => {
        if (!companyId || !session || refreshingRef.current || childBusy) return
        refreshingRef.current = true; setRefreshing(true); const token = generation.current
        try {
            const value = await companyApi.select(companyId, session.csrfToken)
            if (mounted.current && generation.current === token) { setSelection(value); setNotice('현재 회사 권한을 다시 확인했습니다.'); if (!value.permissions.includes('journal.read')) await clearCompany(companyId) }
        } catch (failure) {
            if (mounted.current && generation.current === token) { await clearCompany(companyId); setSelection(null); setWantedCompany(''); if (failure instanceof ApiError && failure.status === 401) expire(); else setError(failureMessage(failure)) }
        } finally { refreshingRef.current = false; if (mounted.current && generation.current === token) setRefreshing(false) }
    }, [companyId, session, childBusy, clearCompany, expire])
    const accessError = useCallback((failure: unknown) => { if (failure instanceof ApiError && failure.status === 401) expire(); else if (failure instanceof ApiError && failure.status === 403) void refreshPermissions() }, [expire, refreshPermissions])
    useEffect(() => { const failure = companies.error ?? years.error; if (failure) accessError(failure) }, [companies.error, years.error, accessError])
    const companyItems = companies.data?.pages.flatMap(page => page.items) ?? [], yearItems = years.data?.pages.flatMap(page => page.items) ?? []
    if (companies.isPending) return <AsyncState kind="loading" title="회사 목록을 불러오는 중입니다" description="접근 가능한 회사를 확인합니다." />
    if (companies.isError && !companies.data) return <AsyncState kind="error" title="회사 목록을 불러오지 못했습니다" description={failureMessage(companies.error)} onRetry={() => void companies.refetch()} />
    if (!companyItems.length) return <AsyncState kind="empty" title="접근 가능한 회사가 없습니다" description="회사 소속과 장부 조회 권한을 확인해 주세요." />
    return <main className="mx-auto max-w-[1500px] space-y-6 min-w-0">
        <header className="hud-card rounded-xl p-4 sm:p-6"><h1 className="text-2xl font-semibold">기초 잔액·원장</h1><p className="mt-2 text-sm text-hud-text-muted">기초 잔액을 승인·확정하고 장부에 반영된 분개와 계정별 잔액을 조회합니다.</p><label htmlFor="ledger-company" className="mt-4 mb-2 block">장부 회사</label><select id="ledger-company" className={journalInputClass} value={wantedCompany} disabled={locked} onChange={event => void chooseCompany(event.target.value)}><option value="">회사 선택</option>{companyItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{companies.hasNextPage && <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={locked || companies.isFetching} onClick={() => void companies.fetchNextPage()}>회사 더 불러오기</Button>}</header>
        {selecting && <AsyncState kind="loading" title="회사 권한 확인 중" description="현재 소속과 역할을 확인합니다." />}
        {error && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-hud-accent-danger p-4">{error}</div>}
        {notice && <p role="status">{notice}</p>}
        {selection && !canRead && <AsyncState kind="empty" title="장부 조회 권한이 없습니다" description="현재 회사의 역할과 권한을 확인해 주세요." />}
        {companyId && canRead && <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="장부 화면"><Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={() => void refreshPermissions()}>회사 권한 다시 확인</Button>{years.hasNextPage && <Button type="button" variant="outline" className="min-h-11" disabled={locked || years.isFetching} onClick={() => void years.fetchNextPage()}>회계연도 더 불러오기</Button>}{tabs.map(item => <Button key={item.id} type="button" variant={tab === item.id ? 'primary' : 'outline'} className="min-h-11" role="tab" aria-selected={tab === item.id} disabled={locked} onClick={() => { setTab(item.id); updateUrl(companyId, item.id) }}>{item.label}</Button>)}</div>
            {years.isError ? <AsyncState kind="error" title="회계연도를 불러오지 못했습니다" description="회사 권한과 연결 상태를 확인해 주세요." onRetry={() => void years.refetch()} /> : tab === 'opening' ? <OpeningBalanceForm companyId={companyId} userId={userId} years={yearItems} canWrite={canWrite} csrfToken={session!.csrfToken} locked={locked} onBusy={setChildBusy} onAccessError={accessError} /> : tab === 'journal-book' ? <JournalBook companyId={companyId} userId={userId} years={yearItems} locked={locked} onAccessError={accessError} /> : <AccountLedger companyId={companyId} userId={userId} years={yearItems} locked={locked} onAccessError={accessError} />}
        </>}
    </main>
}
