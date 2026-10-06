import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ShieldCheck, UserRoundCog, UserX } from 'lucide-react'
import { ApiError, type CompanyMemberView, type CompanyRole } from '../../lib/api'
import AsyncState from '../common/AsyncState'
import Button from '../common/Button'
import HudCard from '../common/HudCard'

const roleOrder: CompanyRole[] = ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX']
const roleLabel: Record<CompanyRole, string> = {
    COMPANY_ADMIN: '회사 관리자', ACCOUNTANT: '회계 담당자', APPROVER: '승인자', READ_ONLY: '조회 전용', EXTERNAL_TAX: '외부 세무사',
}

interface Props {
    companyId: string
    currentUserId: string
    members?: CompanyMemberView[]
    pending: boolean
    error?: string
    notice?: string
    operationPending: boolean
    operationError?: string
    hasNextPage: boolean
    loadingMore: boolean
    onRetry: () => void
    onLoadMore: () => void
    onLoadMember: (membershipId: string) => Promise<CompanyMemberView>
    onChangeRoles: (member: CompanyMemberView, roles: CompanyRole[], password: string) => Promise<void>
    onDeactivate: (member: CompanyMemberView, password: string) => Promise<void>
    onResetOperation: () => void
}

const sameRoles = (left: CompanyRole[], right: CompanyRole[]) =>
    [...left].sort().join(',') === [...right].sort().join(',')

export default function CompanyMembersPanel(props: Props) {
    const [editing, setEditing] = useState<CompanyMemberView | null>(null)
    const [roles, setRoles] = useState<CompanyRole[]>([])
    const [password, setPassword] = useState('')
    const [mode, setMode] = useState<'roles' | 'deactivate'>('roles')
    const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null)

    // 회사가 바뀌면 이전 회사의 대상·비밀번호·확인 상태를 즉시 버린다.
    useEffect(() => {
        setEditing(null); setRoles([]); setPassword(''); setMode('roles'); setLoadingMemberId(null)
    }, [props.companyId])

    const canSaveRoles = useMemo(() => Boolean(editing && roles.length > 0 && !sameRoles(editing.roles, roles)), [editing, roles])
    const openEditor = async (member: CompanyMemberView) => {
        props.onResetOperation()
        setPassword(''); setMode('roles'); setLoadingMemberId(member.id)
        try {
            // 목록 이후 변경 가능성을 줄이기 위해 편집 직전에 단일 소속의 최신 version을 다시 읽는다.
            const latest = await props.onLoadMember(member.id)
            setEditing(latest); setRoles(latest.roles)
        } catch { setEditing(null) }
        finally { setLoadingMemberId(null) }
    }
    const closeEditor = () => {
        setEditing(null); setRoles([]); setPassword(''); setMode('roles'); props.onResetOperation()
    }
    const toggleRole = (role: CompanyRole) => {
        setRoles(current => current.includes(role) ? current.filter(value => value !== role) : [...current, role])
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (!editing || !password) return
        const submittedPassword = password
        setPassword('')
        try {
            if (mode === 'roles') await props.onChangeRoles(editing, roles, submittedPassword)
            else await props.onDeactivate(editing, submittedPassword)
            setEditing(null); setRoles([]); setMode('roles')
        } catch (error) {
            // 오래된 편집본은 다시 제출하지 않는다. 목록 재조회 결과에서 대상을 다시 열게 한다.
            if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
                setEditing(null); setRoles([]); setMode('roles')
            }
            return
        }
    }

    return <HudCard title="구성원 관리" headingLevel={2} subtitle="이 회사의 관리자만 구성원 상태와 역할을 볼 수 있습니다.">
        {props.notice && <p role="status" aria-label="구성원 작업 결과" className="mb-4 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-4 py-3 text-sm text-hud-text-secondary">{props.notice}</p>}
        {!editing && props.operationError && <p role="alert" className="mb-4 text-sm text-hud-accent-danger">{props.operationError}</p>}
        {props.pending ? <AsyncState kind="loading" title="구성원을 불러오는 중입니다" description="현재 회사의 관리 권한과 소속을 확인하고 있습니다." />
            : props.error ? <AsyncState kind="error" title="구성원을 불러오지 못했습니다" description={props.error} onRetry={props.onRetry} />
                : (props.members ?? []).length === 0 ? <AsyncState kind="empty" title="표시할 구성원이 없습니다" description="초대와 접근 요청 화면은 다음 묶음에서 연결합니다." />
                    : <div className="space-y-3">
                        <ul aria-label="회사 구성원" className="space-y-3">{(props.members ?? []).map(member => {
                            const eligible = member.active && member.user.emailVerified && !member.user.disabled
                            return <li key={member.id} className="rounded-xl border border-hud-border-secondary bg-hud-bg-primary p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="break-all font-medium text-hud-text-primary">{member.user.email}</p>
                                            {member.user.id === props.currentUserId && <span className="rounded-full bg-hud-accent-primary/10 px-2 py-1 text-xs font-medium text-hud-accent-primary">나</span>}
                                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${member.active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-hud-bg-hover text-hud-text-muted'}`}>{member.active ? '소속 활성' : '소속 중지'}</span>
                                            {!member.user.emailVerified && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">이메일 미확인</span>}
                                            {member.user.disabled && <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-hud-accent-danger">계정 중지</span>}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">{member.roles.map(role => <span key={role} className="rounded-md border border-hud-border-secondary px-2 py-1 text-xs text-hud-text-secondary">{roleLabel[role]}</span>)}</div>
                                        <p className="mt-2 text-xs text-hud-text-muted">소속 버전 {member.version}</p>
                                    </div>
                                    <Button type="button" variant="outline" disabled={!eligible || props.operationPending || loadingMemberId === member.id}
                                        onClick={() => { void openEditor(member) }} leftIcon={<UserRoundCog size={17} aria-hidden="true" />}
                                        className="min-h-11 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                                        {loadingMemberId === member.id ? '최신 정보 확인 중…' : '역할·소속 관리'}
                                    </Button>
                                </div>
                            </li>
                        })}</ul>
                        {props.hasNextPage && <div className="flex justify-center"><Button type="button" variant="ghost" disabled={props.loadingMore} onClick={props.onLoadMore}
                            leftIcon={<ChevronDown size={17} aria-hidden="true" />} className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">
                            {props.loadingMore ? '불러오는 중…' : '구성원 더 보기'}
                        </Button></div>}
                    </div>}

        {editing && <form onSubmit={submit} className="mt-5 rounded-xl border border-hud-accent-primary/40 bg-hud-accent-primary/5 p-4" aria-labelledby="member-editor-title">
            <div className="flex items-start gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-hud-accent-primary" size={20} /><div>
                <h3 id="member-editor-title" className="font-semibold text-hud-text-primary">{editing.user.email}</h3>
                <p className="mt-1 text-sm text-hud-text-muted">저장 직전에 현재 비밀번호를 확인하며 제출한 비밀번호는 화면에 남기지 않습니다.</p>
            </div></div>
            {mode === 'roles' ? <fieldset className="mt-4">
                <legend className="text-sm font-medium text-hud-text-secondary">부여할 역할 — 1개 이상 선택</legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{roleOrder.map(role => <label key={role} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-hud-border-secondary bg-hud-bg-card px-3 py-2 text-sm text-hud-text-secondary">
                    <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} className="h-4 w-4 accent-[var(--hud-accent-primary)]" />{roleLabel[role]}
                </label>)}</div>
                {roles.length === 0 && <p role="alert" className="mt-2 text-sm text-hud-accent-danger">역할을 1개 이상 선택해 주세요.</p>}
            </fieldset> : <div role="alert" className="mt-4 rounded-lg border border-hud-accent-danger/40 bg-red-500/5 p-4 text-sm leading-6 text-hud-text-secondary">
                <strong className="text-hud-text-primary">{editing.user.email}</strong>의 이 회사 접근을 중지합니다. 기존 역할은 이력으로 남지만 권한에는 적용되지 않습니다.
            </div>}
            <div className="mt-4"><label htmlFor="member-current-password" className="mb-2 block text-sm font-medium text-hud-text-secondary">구성원 관리용 현재 비밀번호</label>
                <input id="member-current-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-card px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" /></div>
            {props.operationError && <p role="alert" className="mt-3 text-sm text-hud-accent-danger">{props.operationError}</p>}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="ghost" onClick={closeEditor} disabled={props.operationPending} className="min-h-11">닫기</Button>
                    {mode === 'roles' && <Button type="button" variant="danger" onClick={() => { setMode('deactivate'); setPassword(''); props.onResetOperation() }} disabled={props.operationPending}
                        leftIcon={<UserX size={17} aria-hidden="true" />} className="min-h-11">소속 중지</Button>}
                    {mode === 'deactivate' && <Button type="button" variant="outline" onClick={() => { setMode('roles'); setPassword(''); props.onResetOperation() }} disabled={props.operationPending} className="min-h-11">중지 취소</Button>}</div>
                <Button type="submit" variant={mode === 'deactivate' ? 'danger' : 'primary'} disabled={props.operationPending || !password || (mode === 'roles' && !canSaveRoles)} className="min-h-11">
                    {props.operationPending ? '처리 중…' : mode === 'deactivate' ? '소속 중지 실행' : '역할 저장'}
                </Button>
            </div>
        </form>}
    </HudCard>
}
