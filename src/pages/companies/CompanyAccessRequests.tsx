import { FormEvent, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../../components/common/Button'
import HudCard from '../../components/common/HudCard'
import AsyncState from '../../components/common/AsyncState'
import { useAuth } from '../../context/AuthContext'
import { ApiError, companyApi, type OwnCompanyAccessRequestView } from '../../lib/api'

const statusLabel = { PENDING: '대기', CANCELLED: '취소', APPROVED: '승인', REJECTED: '반려', EXPIRED: '만료' }
const inputStyle = 'min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'
function failure(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 400) return '입력 형식을 확인해 주세요.'
        if (error.status === 403) return '이 작업을 허용하지 않습니다. 이메일 확인과 로그인 상태를 확인해 주세요.'
        if (error.status === 404) return '대상을 확인할 수 없습니다. 전달받은 회사 식별번호와 최신 목록을 확인해 주세요.'
        if (error.status === 409) return '회사 소속 또는 요청 상태가 변경되었습니다. 최신 목록과 관리자에게 확인해 주세요.'
        if (error.status === 429) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
    }
    return '처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'
}

// [F01 본인 요청 추가] 회사 상세·검색·관리자 목록은 호출하지 않는다.
// 로그인 identity별 cache를 분리하고 401이면 RequireSession이 재로그인 화면으로 보낸다.
export default function CompanyAccessRequests() {
    const { session, expire } = useAuth()
    const cache = useQueryClient()
    const location = useLocation()
    const [companyId, setCompanyId] = useState(() => new URLSearchParams(location.search).get('companyId') ?? '')
    const [pendingAction, setPendingAction] = useState<OwnCompanyAccessRequestView | null>(null)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const confirmHeading = useRef<HTMLHeadingElement>(null)
    const listHeading = useRef<HTMLHeadingElement>(null)
    const queryKey = ['own-company-access-requests', session?.user.id]
    const requests = useInfiniteQuery({
        queryKey, initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.ownAccessRequests(signal, pageParam),
        getNextPageParam: page => page.nextCursor ?? undefined,
        enabled: Boolean(session), retry: false,
    })
    useEffect(() => { document.title = '회사 접근 요청 · ATMS' }, [])
    useEffect(() => { setCompanyId(new URLSearchParams(location.search).get('companyId') ?? '') }, [location.search])
    useEffect(() => { if (requests.error instanceof ApiError && requests.error.status === 401) expire() }, [requests.error, expire])
    useEffect(() => { if (pendingAction) confirmHeading.current?.focus() }, [pendingAction])
    const reload = () => cache.resetQueries({ queryKey })
    const handleError = async (caught: unknown, cancelling = false) => {
        if (caught instanceof ApiError && caught.status === 401) { expire(); return }
        setError(failure(caught))
        if (cancelling && caught instanceof ApiError && [404, 409].includes(caught.status)) {
            setPendingAction(null); await reload(); listHeading.current?.focus()
        }
    }
    const create = async (event: FormEvent) => {
        event.preventDefault()
        if (!session || pending) return
        setError(''); setNotice('')
        const id = companyId.trim()
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
            setError('회사 식별번호를 UUID 형식으로 입력해 주세요.'); return
        }
        setPending(true)
        try {
            await companyApi.createOwnAccessRequest(id, session.csrfToken)
            setNotice('세무사 접근 요청을 제출했습니다. 관리자 승인 전에는 회사 소속이 부여되지 않습니다.')
            await reload()
        } catch (caught) { await handleError(caught) }
        finally { setPending(false) }
    }
    const closeConfirmation = () => {
        const id = pendingAction?.id
        setPendingAction(null)
        if (id) document.getElementById(`cancel-request-${id}`)?.focus()
    }
    const cancel = async () => {
        if (!session || !pendingAction || pending) return
        setPending(true); setError(''); setNotice('')
        try {
            await companyApi.cancelOwnAccessRequest(pendingAction.id, pendingAction.version, session.csrfToken)
            setPendingAction(null); setNotice('접근 요청을 취소했습니다.')
            await reload(); listHeading.current?.focus()
        } catch (caught) { await handleError(caught, true) }
        finally { setPending(false) }
    }
    const rows = requests.data?.pages.flatMap(page => page.items) ?? []
    return <div className="space-y-6 text-hud-text-primary">
        <div><h1 className="text-2xl font-bold">회사 접근 요청</h1><p className="mt-2 text-sm text-hud-text-secondary">관리자가 전달한 회사 식별번호로 외부 세무사 접근을 신청합니다. 본인의 요청만 표시합니다.</p></div>
        {notice && <p role="status" className="rounded-lg border border-hud-border-secondary p-4 text-sm">{notice}</p>}
        {error && <p id="own-access-error" role="alert" className="text-sm text-hud-accent-danger">{error}</p>}
        <HudCard title="접근 신청" headingLevel={2}>
            <form onSubmit={create} noValidate className="space-y-3">
                <label htmlFor="request-company-id" className="block text-sm">회사 식별번호</label>
                <input id="request-company-id" value={companyId} onChange={event => setCompanyId(event.target.value)} required maxLength={36} disabled={pending}
                    aria-describedby="company-id-help own-access-error" aria-invalid={Boolean(error)} className={inputStyle} />
                <p id="company-id-help" className="text-sm text-hud-text-muted">UUID 형식의 식별번호 또는 전달받은 링크를 사용하세요. 회사 검색은 제공하지 않습니다. 승인 역할은 외부 세무사로 고정됩니다.</p>
                <Button type="submit" disabled={pending || !companyId.trim()} className="min-h-11 focus-visible:outline focus-visible:outline-2">{pending ? '처리 중…' : '접근 요청 제출'}</Button>
            </form>
        </HudCard>
        {pendingAction && <section aria-labelledby="cancel-confirm-heading" className="rounded-lg border border-hud-border-secondary bg-hud-bg-card p-5 space-y-3"
            onKeyDown={event => { if (event.key === 'Escape' && !pending) closeConfirmation() }}>
            <h2 id="cancel-confirm-heading" ref={confirmHeading} tabIndex={-1} className="font-semibold focus-visible:outline focus-visible:outline-2">접근 요청 취소 확인</h2>
            <p className="text-sm break-all">회사 식별번호 {pendingAction.companyId}의 대기 요청(버전 {pendingAction.version})을 취소합니다.</p>
            <div className="flex flex-wrap gap-3"><Button type="button" disabled={pending} onClick={() => void cancel()} className="min-h-11 focus-visible:outline focus-visible:outline-2">취소 실행</Button><Button variant="secondary" type="button" disabled={pending} onClick={closeConfirmation} className="min-h-11 focus-visible:outline focus-visible:outline-2">돌아가기</Button></div>
        </section>}
        <HudCard>
            <h2 ref={listHeading} tabIndex={-1} className="mb-4 font-semibold focus-visible:outline focus-visible:outline-2">내 접근 요청</h2>
            {requests.isPending ? <AsyncState kind="loading" title="접근 요청을 불러오는 중입니다" description="본인의 최신 요청을 확인합니다." />
                : requests.isError ? <AsyncState kind="error" title="접근 요청을 불러오지 못했습니다" description={failure(requests.error)} onRetry={() => void requests.refetch()} />
                    : rows.length === 0 ? <AsyncState kind="empty" title="접근 요청이 없습니다" description="전달받은 회사 식별번호로 신청할 수 있습니다." />
                        : <ul aria-label="내 접근 요청 목록" className="space-y-3">{rows.map(row => <li key={row.id} className="rounded-lg border border-hud-border-secondary p-4 space-y-2 text-sm">
                            <p className="break-all">회사 식별번호 {row.companyId}</p>
                            <p>상태: {statusLabel[row.status]} · 요청 버전 {row.version}</p>
                            <p className="text-hud-text-muted">만료: <time dateTime={row.expiresAt}>{new Date(row.expiresAt).toLocaleString('ko-KR')}</time></p>
                            {row.status === 'PENDING' && <Button id={`cancel-request-${row.id}`} variant="secondary" type="button" disabled={pending} onClick={() => { setError(''); setNotice(''); setPendingAction(row) }} className="min-h-11 focus-visible:outline focus-visible:outline-2">요청 취소</Button>}
                        </li>)}</ul>}
            {requests.hasNextPage && !requests.isError && <Button variant="secondary" type="button" disabled={requests.isFetchingNextPage || pending} onClick={() => void requests.fetchNextPage()} className="mt-4 min-h-11 focus-visible:outline focus-visible:outline-2">{requests.isFetchingNextPage ? '불러오는 중…' : '요청 더 보기'}</Button>}
        </HudCard>
    </div>
}
