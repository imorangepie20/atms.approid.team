import { FormEvent, useEffect, useState } from 'react'
import { Check, ChevronDown, MailPlus, RefreshCw, UserCheck, UserX, X } from 'lucide-react'
import { ApiError, type CompanyAccessRequestView, type CompanyInvitationView, type CompanyRole } from '../../lib/api'
import AsyncState from '../common/AsyncState'
import Button from '../common/Button'
import HudCard from '../common/HudCard'

const roles: CompanyRole[] = ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX']
const roleLabel: Record<CompanyRole, string> = {
    COMPANY_ADMIN: '회사 관리자', ACCOUNTANT: '회계 담당자', APPROVER: '승인자', READ_ONLY: '조회 전용', EXTERNAL_TAX: '외부 세무사',
}
const statusLabel: Record<string, string> = {
    PENDING: '대기', CANCELLED: '취소', ACCEPTED: '수락', APPROVED: '승인', REJECTED: '반려', EXPIRED: '만료',
}
type PendingAction = { kind: 'invite'; action: 'cancel' | 'resend'; item: CompanyInvitationView }
    | { kind: 'request'; action: 'approve' | 'reject'; item: CompanyAccessRequestView }

interface Props {
    companyId: string
    invitations?: CompanyInvitationView[]
    requests?: CompanyAccessRequestView[]
    invitationsPending: boolean
    requestsPending: boolean
    invitationsError?: string
    requestsError?: string
    notice?: string
    operationPending: boolean
    operationError?: string
    invitationsHasNext: boolean
    requestsHasNext: boolean
    invitationsLoadingMore: boolean
    requestsLoadingMore: boolean
    onRetryInvitations: () => void
    onRetryRequests: () => void
    onLoadMoreInvitations: () => void
    onLoadMoreRequests: () => void
    onCreateInvitation: (email: string, roles: CompanyRole[], password: string) => Promise<void>
    onInvitationAction: (item: CompanyInvitationView, action: 'cancel' | 'resend', password: string) => Promise<void>
    onRequestAction: (item: CompanyAccessRequestView, action: 'approve' | 'reject', password: string) => Promise<void>
    onResetOperation: () => void
}

function StatusBadge({ status }: { status: string }) {
    const pending = status === 'PENDING'
    return <span className={`rounded-full px-2 py-1 text-xs font-medium ${pending ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-hud-bg-hover text-hud-text-muted'}`}>{statusLabel[status] ?? status}</span>
}

export default function CompanyAccessPanel(props: Props) {
    const [tab, setTab] = useState<'invitations' | 'requests'>('invitations')
    const [email, setEmail] = useState('')
    const [selectedRoles, setSelectedRoles] = useState<CompanyRole[]>(['READ_ONLY'])
    const [createPassword, setCreatePassword] = useState('')
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
    const [actionPassword, setActionPassword] = useState('')

    // 선택 회사가 바뀌면 이전 회사의 주소·역할·비밀번호·확인 대상을 버린다.
    useEffect(() => {
        setTab('invitations'); setEmail(''); setSelectedRoles(['READ_ONLY']); setCreatePassword('')
        setPendingAction(null); setActionPassword('')
    }, [props.companyId])

    const switchTab = (next: 'invitations' | 'requests') => {
        setTab(next); setPendingAction(null); setActionPassword(''); props.onResetOperation()
    }
    const toggleRole = (role: CompanyRole) => {
        setSelectedRoles(current => current.includes(role) ? current.filter(value => value !== role) : [...current, role])
    }
    const createInvitation = async (event: FormEvent) => {
        event.preventDefault()
        if (!email || selectedRoles.length === 0 || !createPassword) return
        const password = createPassword
        setCreatePassword('')
        try {
            await props.onCreateInvitation(email, selectedRoles, password)
            setEmail(''); setSelectedRoles(['READ_ONLY'])
        } catch { return }
    }
    const beginAction = (action: PendingAction) => {
        props.onResetOperation(); setPendingAction(action); setActionPassword('')
    }
    const submitAction = async (event: FormEvent) => {
        event.preventDefault()
        if (!pendingAction || !actionPassword) return
        const password = actionPassword
        setActionPassword('')
        try {
            if (pendingAction.kind === 'invite') await props.onInvitationAction(pendingAction.item, pendingAction.action, password)
            else await props.onRequestAction(pendingAction.item, pendingAction.action, password)
            setPendingAction(null)
        } catch (error) {
            if (error instanceof ApiError && (error.status === 404 || error.status === 409)) setPendingAction(null)
        }
    }

    const actionDescription = pendingAction?.kind === 'invite'
        ? `${pendingAction.item.email} 초대를 ${pendingAction.action === 'resend' ? '새 링크로 재발송' : '취소'}합니다.`
        : pendingAction ? `${pendingAction.item.requester.email}의 세무사 접근 요청을 ${pendingAction.action === 'approve' ? '승인' : '반려'}합니다.` : ''
    const actionLabel = pendingAction?.kind === 'invite'
        ? `초대 ${pendingAction.action === 'resend' ? '재발송' : '취소'}`
        : `접근 요청 ${pendingAction?.action === 'approve' ? '승인' : '반려'}`

    return <HudCard title="초대·접근 요청" headingLevel={2} subtitle="메일 초대와 외부 세무사 요청을 회사별로 관리합니다.">
        {props.notice && <p role="status" aria-label="접근 관리 작업 결과" className="mb-4 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-4 py-3 text-sm text-hud-text-secondary">{props.notice}</p>}
        {!pendingAction && props.operationError && <p role="alert" className="mb-4 text-sm text-hud-accent-danger">{props.operationError}</p>}
        <div role="tablist" aria-label="회사 접근 관리" className="mb-5 grid grid-cols-2 rounded-lg border border-hud-border-secondary bg-hud-bg-primary p-1">
            <button id="access-tab-invitations" type="button" role="tab" aria-selected={tab === 'invitations'} aria-controls="access-panel-invitations" onClick={() => switchTab('invitations')}
                className={`min-h-11 rounded-md px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary ${tab === 'invitations' ? 'bg-hud-accent-primary text-hud-text-on-accent' : 'text-hud-text-secondary hover:bg-hud-bg-hover'}`}>초대</button>
            <button id="access-tab-requests" type="button" role="tab" aria-selected={tab === 'requests'} aria-controls="access-panel-requests" onClick={() => switchTab('requests')}
                className={`min-h-11 rounded-md px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary ${tab === 'requests' ? 'bg-hud-accent-primary text-hud-text-on-accent' : 'text-hud-text-secondary hover:bg-hud-bg-hover'}`}>세무사 접근 요청</button>
        </div>

        {tab === 'invitations' ? <div id="access-panel-invitations" role="tabpanel" aria-labelledby="access-tab-invitations" className="space-y-5">
            <form onSubmit={createInvitation} className="rounded-xl border border-hud-border-secondary bg-hud-bg-primary p-4">
                <h3 className="font-semibold text-hud-text-primary">새 초대</h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div><label htmlFor="invitation-email" className="mb-2 block text-sm font-medium text-hud-text-secondary">초대 이메일</label>
                        <input id="invitation-email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-card px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
                    <div><label htmlFor="invitation-password" className="mb-2 block text-sm font-medium text-hud-text-secondary">초대 생성용 현재 비밀번호</label>
                        <input id="invitation-password" type="password" autoComplete="current-password" required value={createPassword} onChange={event => setCreatePassword(event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-card px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
                </div>
                <fieldset className="mt-4"><legend className="text-sm font-medium text-hud-text-secondary">초대 역할 — 1개 이상 선택</legend>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{roles.map(role => <label key={role} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-hud-border-secondary bg-hud-bg-card px-3 py-2 text-sm text-hud-text-secondary">
                        <input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} className="h-4 w-4 accent-[var(--hud-accent-primary)]" />{roleLabel[role]}
                    </label>)}</div>
                    {selectedRoles.length === 0 && <p role="alert" className="mt-2 text-sm text-hud-accent-danger">초대 역할을 1개 이상 선택해 주세요.</p>}
                </fieldset>
                <div className="mt-4 flex justify-end"><Button type="submit" disabled={props.operationPending || selectedRoles.length === 0 || !createPassword} leftIcon={<MailPlus size={17} aria-hidden="true" />} className="min-h-11">{props.operationPending ? '처리 중…' : '초대 보내기'}</Button></div>
            </form>
            {props.invitationsPending ? <AsyncState kind="loading" title="초대를 불러오는 중입니다" description="현재 회사의 초대 이력을 확인하고 있습니다." />
                : props.invitationsError ? <AsyncState kind="error" title="초대를 불러오지 못했습니다" description={props.invitationsError} onRetry={props.onRetryInvitations} />
                    : (props.invitations ?? []).length === 0 ? <AsyncState kind="empty" title="초대 이력이 없습니다" description="위 양식에서 첫 회사 초대를 보낼 수 있습니다." />
                        : <ul aria-label="회사 초대" className="space-y-3">{(props.invitations ?? []).map(invitation => <li key={invitation.id} className="rounded-xl border border-hud-border-secondary bg-hud-bg-primary p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2"><p className="break-all font-medium text-hud-text-primary">{invitation.email}</p><StatusBadge status={invitation.status} /></div>
                                <div className="mt-2 flex flex-wrap gap-2">{invitation.roles.map(role => <span key={role} className="rounded-md border border-hud-border-secondary px-2 py-1 text-xs text-hud-text-secondary">{roleLabel[role]}</span>)}</div>
                                <p className="mt-2 text-xs text-hud-text-muted">만료 {new Date(invitation.expiresAt).toLocaleString('ko-KR')} · 초대 버전 {invitation.version}</p>
                            </div>{invitation.status === 'PENDING' && <div className="flex flex-col gap-2 sm:flex-row">
                                <Button type="button" variant="outline" disabled={props.operationPending} onClick={() => beginAction({ kind: 'invite', action: 'resend', item: invitation })} leftIcon={<RefreshCw size={16} aria-hidden="true" />} className="min-h-11">재발송</Button>
                                <Button type="button" variant="danger" disabled={props.operationPending} onClick={() => beginAction({ kind: 'invite', action: 'cancel', item: invitation })} leftIcon={<X size={16} aria-hidden="true" />} className="min-h-11">초대 취소</Button>
                            </div>}</div>
                        </li>)}</ul>}
            {props.invitationsHasNext && <div className="flex justify-center"><Button type="button" variant="ghost" disabled={props.invitationsLoadingMore} onClick={props.onLoadMoreInvitations} leftIcon={<ChevronDown size={17} aria-hidden="true" />} className="min-h-11">{props.invitationsLoadingMore ? '불러오는 중…' : '초대 더 보기'}</Button></div>}
        </div> : <div id="access-panel-requests" role="tabpanel" aria-labelledby="access-tab-requests" className="space-y-5">
            {props.requestsPending ? <AsyncState kind="loading" title="접근 요청을 불러오는 중입니다" description="외부 세무사가 제출한 요청을 확인하고 있습니다." />
                : props.requestsError ? <AsyncState kind="error" title="접근 요청을 불러오지 못했습니다" description={props.requestsError} onRetry={props.onRetryRequests} />
                    : (props.requests ?? []).length === 0 ? <AsyncState kind="empty" title="접근 요청이 없습니다" description="세무사 본인의 요청 화면은 다음 묶음에서 연결합니다." />
                        : <ul aria-label="세무사 접근 요청" className="space-y-3">{(props.requests ?? []).map(request => <li key={request.id} className="rounded-xl border border-hud-border-secondary bg-hud-bg-primary p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2"><p className="break-all font-medium text-hud-text-primary">{request.requester.email}</p><StatusBadge status={request.status} />
                                    {!request.requester.emailVerified && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">이메일 미확인</span>}
                                    {request.requester.disabled && <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs text-hud-accent-danger">계정 중지</span>}</div>
                                <p className="mt-2 text-xs text-hud-text-muted">승인 역할 외부 세무사 · 만료 {new Date(request.expiresAt).toLocaleString('ko-KR')} · 요청 버전 {request.version}</p>
                            </div>{request.status === 'PENDING' && <div className="flex flex-col gap-2 sm:flex-row">
                                <Button type="button" disabled={props.operationPending || request.requester.disabled || !request.requester.emailVerified} onClick={() => beginAction({ kind: 'request', action: 'approve', item: request })} leftIcon={<UserCheck size={16} aria-hidden="true" />} className="min-h-11">승인</Button>
                                <Button type="button" variant="danger" disabled={props.operationPending} onClick={() => beginAction({ kind: 'request', action: 'reject', item: request })} leftIcon={<UserX size={16} aria-hidden="true" />} className="min-h-11">반려</Button>
                            </div>}</div>
                        </li>)}</ul>}
            {props.requestsHasNext && <div className="flex justify-center"><Button type="button" variant="ghost" disabled={props.requestsLoadingMore} onClick={props.onLoadMoreRequests} leftIcon={<ChevronDown size={17} aria-hidden="true" />} className="min-h-11">{props.requestsLoadingMore ? '불러오는 중…' : '접근 요청 더 보기'}</Button></div>}
        </div>}

        {pendingAction && <form onSubmit={submitAction} className="mt-5 rounded-xl border border-hud-accent-primary/40 bg-hud-accent-primary/5 p-4" aria-labelledby="access-action-title">
            <h3 id="access-action-title" className="font-semibold text-hud-text-primary">{actionLabel}</h3><p className="mt-2 text-sm leading-6 text-hud-text-secondary">{actionDescription}</p>
            <div className="mt-4"><label htmlFor="access-action-password" className="mb-2 block text-sm font-medium text-hud-text-secondary">{actionLabel}용 현재 비밀번호</label>
                <input id="access-action-password" type="password" autoComplete="current-password" required value={actionPassword} onChange={event => setActionPassword(event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-card px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
            {props.operationError && <p role="alert" className="mt-3 text-sm text-hud-accent-danger">{props.operationError}</p>}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" disabled={props.operationPending} onClick={() => { setPendingAction(null); setActionPassword(''); props.onResetOperation() }} className="min-h-11">닫기</Button>
                <Button type="submit" variant={pendingAction.action === 'resend' || pendingAction.action === 'approve' ? 'primary' : 'danger'} disabled={props.operationPending || !actionPassword}
                    leftIcon={pendingAction.action === 'approve' ? <Check size={16} aria-hidden="true" /> : undefined} className="min-h-11">{props.operationPending ? '처리 중…' : `${actionLabel} 실행`}</Button></div>
        </form>}
    </HudCard>
}
