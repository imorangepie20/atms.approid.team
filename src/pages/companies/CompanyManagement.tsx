import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronRight } from 'lucide-react'
import AsyncState from '../../components/common/AsyncState'
import Button from '../../components/common/Button'
import CompanyAccessPanel from '../../components/companies/CompanyAccessPanel'
import CompanyCreateForm from '../../components/companies/CompanyCreateForm'
import CompanyMembersPanel from '../../components/companies/CompanyMembersPanel'
import CompanyWorkspace from '../../components/companies/CompanyWorkspace'
import CompanySelfApprovalForm, { type SelfApprovalChange } from '../../components/companies/CompanySelfApprovalForm'
import { useAuth } from '../../context/AuthContext'
import { ApiError, authApi, companyApi, type CompanyAccessRequestView, type CompanyInvitationView, type CompanyMemberView, type CompanyRole, type CompanySelection, type CreateCompanyInput } from '../../lib/api'

class ReauthenticationError extends Error {}

function message(error: unknown, action: 'create' | 'select' | 'rename' | 'period' | 'list') {
    if (error instanceof ReauthenticationError) return '비밀번호를 확인하지 못했습니다. 현재 비밀번호를 다시 입력해 주세요.'
    if (!(error instanceof ApiError)) return '연결 상태를 확인한 뒤 다시 시도해 주세요.'
    if (error.status === 400) return '입력한 이름, 날짜 또는 요청 형식을 확인해 주세요.'
    if (error.status === 403) return action === 'create'
        ? '회사를 등록하려면 다시 로그인하여 최근 인증을 갱신해 주세요.'
        : '현재 계정에는 이 작업을 수행할 권한이 없습니다.'
    if (error.status === 409) return action === 'period'
        ? '다른 변경이 먼저 저장됐거나 기존 회계연도와 겹칩니다. 최신 자료를 반영했습니다.'
        : '다른 변경이 먼저 저장됐습니다. 최신 회사 정보를 반영했으니 다시 확인해 주세요.'
    return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

function memberMessage(error: unknown) {
    if (error instanceof ReauthenticationError) return '비밀번호를 확인하지 못했습니다. 현재 비밀번호를 다시 입력해 주세요.'
    if (!(error instanceof ApiError)) return '연결 상태를 확인한 뒤 다시 시도해 주세요.'
    if (error.status === 400) return '역할 선택 또는 요청 형식을 확인해 주세요.'
    if (error.status === 403) return '현재 계정에는 구성원을 관리할 권한이 없습니다.'
    if (error.status === 404) return '대상 구성원을 찾지 못했습니다. 최신 목록을 다시 확인해 주세요.'
    if (error.status === 409) return '다른 관리자가 먼저 변경했거나 마지막 관리자 보호가 적용됐습니다. 최신 구성원 정보를 반영했습니다.'
    if (error.status === 503) return '구성원 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
    return '구성원 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

function accessMessage(error: unknown) {
    if (error instanceof ReauthenticationError) return '비밀번호를 확인하지 못했습니다. 현재 비밀번호를 다시 입력해 주세요.'
    if (!(error instanceof ApiError)) return '연결 상태를 확인한 뒤 다시 시도해 주세요.'
    if (error.status === 400) return '이메일, 역할 또는 요청 형식을 확인해 주세요.'
    if (error.status === 403) return '현재 계정에는 초대와 접근 요청을 관리할 권한이 없습니다.'
    if (error.status === 404) return '대상 초대 또는 접근 요청을 찾지 못했습니다. 최신 목록을 확인해 주세요.'
    if (error.status === 409) return '다른 관리자가 먼저 처리했거나 대상 상태가 바뀌었습니다. 최신 목록을 반영했습니다.'
    if (error.status === 429) return '요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
    if (error.status === 503) return '접근 관리 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
    return '접근 관리 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

export default function CompanyManagement() {
    const { session, adoptSession, expire } = useAuth()
    const queryClient = useQueryClient()
    const [selection, setSelection] = useState<CompanySelection | null>(null)
    const [selectingAfterCreate, setSelectingAfterCreate] = useState(false)
    const [postCreateMessage, setPostCreateMessage] = useState('')
    const [memberNotice, setMemberNotice] = useState('')
    const [accessNotice, setAccessNotice] = useState('')
    // [F01 설정 추가] 비밀번호는 state/Query mutation에 저장하지 않고 제출 함수의 지역 인자로만 받는다.
    const [selfApprovalPending, setSelfApprovalPending] = useState(false)
    const [selfApprovalNeedsRefresh, setSelfApprovalNeedsRefresh] = useState(false)
    const [selfApprovalError, setSelfApprovalError] = useState('')
    const [selfApprovalNotice, setSelfApprovalNotice] = useState('')
    const [selfApprovalResetCount, setSelfApprovalResetCount] = useState(0)
    const selfApprovalInFlight = useRef(false)

    useEffect(() => { document.title = '회사 관리 · ATMS' }, [])
    const companies = useQuery({ queryKey: ['companies'], queryFn: ({ signal }) => companyApi.list(signal) })
    const fiscalYears = useQuery({
        queryKey: ['fiscal-years', selection?.company.id],
        enabled: Boolean(selection),
        queryFn: ({ signal }) => companyApi.fiscalYears(selection!.company.id, signal),
    })
    const canManageMembers = Boolean(selection?.permissions.includes('company.members.manage'))
    const members = useInfiniteQuery({
        queryKey: ['company-members', selection?.company.id],
        enabled: Boolean(selection && canManageMembers),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.members(selection!.company.id, signal, { cursor: pageParam, limit: 25 }),
        getNextPageParam: page => page.nextCursor ?? undefined,
    })
    const invitations = useInfiniteQuery({
        queryKey: ['company-invitations', selection?.company.id],
        enabled: Boolean(selection && canManageMembers),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.invitations(selection!.company.id, signal, { cursor: pageParam, limit: 25 }),
        getNextPageParam: page => page.nextCursor ?? undefined,
    })
    const accessRequests = useInfiniteQuery({
        queryKey: ['company-access-requests', selection?.company.id],
        enabled: Boolean(selection && canManageMembers),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => companyApi.accessRequests(selection!.company.id, signal, { cursor: pageParam, limit: 25 }),
        getNextPageParam: page => page.nextCursor ?? undefined,
    })

    const selectCompany = useMutation({
        mutationFn: (companyId: string) => companyApi.select(companyId, session!.csrfToken),
        onSuccess: value => setSelection(value),
    })
    const createCompany = useMutation({
        mutationFn: async ({ input, password }: { input: CreateCompanyInput; password: string }) => {
            setPostCreateMessage('')
            try { await authApi.reauthenticate(password, session!.csrfToken) }
            catch (error) {
                if (error instanceof ApiError && error.status === 401) throw new ReauthenticationError()
                throw error
            }
            return companyApi.create(input, session!.csrfToken)
        },
        onSuccess: async result => {
            adoptSession(result.session)
            await queryClient.invalidateQueries({ queryKey: ['companies'] })
            setSelectingAfterCreate(true)
            try { setSelection(await companyApi.select(result.company.id, result.session.csrfToken)) }
            catch {
                setSelection(null)
                setPostCreateMessage('회사는 등록됐지만 상세를 자동으로 열지 못했습니다. 최신 목록에서 회사를 다시 선택해 주세요.')
            }
            finally { setSelectingAfterCreate(false) }
        },
    })
    const renameCompany = useMutation({
        mutationFn: (name: string) => companyApi.rename(selection!.company.id, { name, version: selection!.company.version }, session!.csrfToken),
        onSuccess: async company => {
            setSelection(current => current ? { ...current, company } : current)
            await queryClient.invalidateQueries({ queryKey: ['companies'] })
        },
        onError: async error => {
            if (error instanceof ApiError && error.status === 409 && selection) {
                const company = await companyApi.detail(selection.company.id).catch(() => null)
                if (company) setSelection(current => current ? { ...current, company } : current)
                await queryClient.invalidateQueries({ queryKey: ['companies'] })
            }
        },
    })
    const addFiscalYear = useMutation({
        mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) => companyApi.addFiscalYear(
            selection!.company.id, { startDate, endDate, version: selection!.company.version }, session!.csrfToken,
        ),
        onSuccess: async result => {
            setSelection(current => current ? { ...current, company: result.company } : current)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['companies'] }),
                queryClient.invalidateQueries({ queryKey: ['fiscal-years', result.company.id] }),
            ])
        },
        onError: async error => {
            if (error instanceof ApiError && error.status === 409 && selection) {
                const company = await companyApi.detail(selection.company.id).catch(() => null)
                if (company) setSelection(current => current ? { ...current, company } : current)
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['companies'] }),
                    queryClient.invalidateQueries({ queryKey: ['fiscal-years', selection.company.id] }),
                ])
            }
        },
    })

    const reauthenticateSensitiveAction = async (password: string) => {
        try { await authApi.reauthenticate(password, session!.csrfToken) }
        catch (error) {
            // 잘못된 비밀번호 401은 기존 유효 세션을 만료시키지 않는다.
            if (error instanceof ApiError && error.status === 401) throw new ReauthenticationError()
            throw error
        }
    }
    const memberDetail = useMutation({
        mutationFn: (membershipId: string) => companyApi.memberDetail(selection!.company.id, membershipId),
    })
    const changeMemberRoles = useMutation({
        mutationFn: async ({ member, roles, password }: { member: CompanyMemberView; roles: CompanyRole[]; password: string }) => {
            await reauthenticateSensitiveAction(password)
            return companyApi.changeMemberRoles(selection!.company.id, member.id, roles, member.version, session!.csrfToken)
        },
        onSuccess: async result => {
            setMemberNotice('구성원 역할을 저장했습니다.')
            if (result.session) {
                adoptSession(result.session)
                // 본인 역할이 바뀌면 교체된 CSRF로 선택 결과를 다시 받아 메뉴/관리 UI 권한을 즉시 갱신한다.
                try { setSelection(await companyApi.select(result.member.companyId, result.session.csrfToken)) }
                catch (error) {
                    if (error instanceof ApiError && error.status === 401) expire()
                    else setMemberNotice('역할은 저장됐지만 현재 권한을 다시 확인하지 못했습니다. 회사를 다시 선택해 주세요.')
                }
            }
            await queryClient.invalidateQueries({ queryKey: ['company-members', result.member.companyId] })
        },
        onError: async error => {
            if (error instanceof ApiError && error.status === 409 && selection) {
                await queryClient.invalidateQueries({ queryKey: ['company-members', selection.company.id] })
            }
        },
    })
    const deactivateMember = useMutation({
        mutationFn: async ({ member, password }: { member: CompanyMemberView; password: string }) => {
            await reauthenticateSensitiveAction(password)
            return companyApi.deactivateMember(selection!.company.id, member.id, member.version, session!.csrfToken)
        },
        onSuccess: async result => {
            if (result.sessionRevoked) { expire(); return }
            setMemberNotice('선택한 구성원의 회사 소속을 중지했습니다.')
            await queryClient.invalidateQueries({ queryKey: ['company-members', result.member.companyId] })
        },
        onError: async error => {
            if (error instanceof ApiError && error.status === 409 && selection) {
                await queryClient.invalidateQueries({ queryKey: ['company-members', selection.company.id] })
            }
        },
    })

    const createInvitation = useMutation({
        mutationFn: async ({ email, roles, password }: { email: string; roles: CompanyRole[]; password: string }) => {
            await reauthenticateSensitiveAction(password)
            return companyApi.createInvitation(selection!.company.id, email, roles, session!.csrfToken)
        },
        onSuccess: async result => {
            setAccessNotice('회사 초대를 만들었습니다. 메일 발송은 저장 후 처리됩니다.')
            await queryClient.invalidateQueries({ queryKey: ['company-invitations', result.invitation.companyId] })
        },
        onError: async error => {
            if (error instanceof ApiError && [404, 409].includes(error.status) && selection) {
                await queryClient.invalidateQueries({ queryKey: ['company-invitations', selection.company.id] })
            }
        },
    })
    const changeInvitation = useMutation({
        mutationFn: async ({ item, action, password }: { item: CompanyInvitationView; action: 'cancel' | 'resend'; password: string }) => {
            await reauthenticateSensitiveAction(password)
            return companyApi.changeInvitation(selection!.company.id, item.id, action, item.version, session!.csrfToken)
        },
        onSuccess: async (result, variables) => {
            setAccessNotice(variables.action === 'resend' ? '새 초대 링크를 발급해 재발송했습니다.' : '회사 초대를 취소했습니다.')
            await queryClient.invalidateQueries({ queryKey: ['company-invitations', result.invitation.companyId] })
        },
        onError: async error => {
            if (error instanceof ApiError && [404, 409].includes(error.status) && selection) {
                await queryClient.invalidateQueries({ queryKey: ['company-invitations', selection.company.id] })
            }
        },
    })
    const changeAccessRequest = useMutation({
        mutationFn: async ({ item, action, password }: { item: CompanyAccessRequestView; action: 'approve' | 'reject'; password: string }) => {
            await reauthenticateSensitiveAction(password)
            return companyApi.changeAccessRequest(selection!.company.id, item.id, action, item.version, session!.csrfToken)
        },
        onSuccess: async (result, variables) => {
            setAccessNotice(variables.action === 'approve' ? '세무사 접근 요청을 승인했습니다.' : '세무사 접근 요청을 반려했습니다.')
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['company-access-requests', result.accessRequest.companyId] }),
                queryClient.invalidateQueries({ queryKey: ['company-members', result.accessRequest.companyId] }),
            ])
        },
        onError: async error => {
            if (error instanceof ApiError && [404, 409].includes(error.status) && selection) {
                await queryClient.invalidateQueries({ queryKey: ['company-access-requests', selection.company.id] })
            }
        },
    })

    // [F01 공유 변경 잠금] 이름/기간/설정은 같은 회사 version을 쓰므로 동시에 제출하지 않는다.
    const companyOperationPending = selfApprovalPending || selectCompany.isPending || createCompany.isPending
        || selectingAfterCreate || renameCompany.isPending || addFiscalYear.isPending
    const clearSelfApprovalFeedback = () => { setSelfApprovalError(''); setSelfApprovalNotice('') }
    const clearCompanyWorkspace = async (companyId: string) => {
        setSelection(current => current?.company.id === companyId ? null : current)
        for (const key of ['fiscal-years', 'company-members', 'company-invitations', 'company-access-requests']) {
            queryClient.removeQueries({ queryKey: [key, companyId] })
        }
        await queryClient.invalidateQueries({ queryKey: ['companies'] })
    }
    const reloadSelfApproval = async (companyId: string) => {
        // select가 현재 권한도 반환한다. PATCH는 재전송하지 않으며 이전 회사 응답도 적용하지 않는다.
        const latest = await companyApi.select(companyId, session!.csrfToken)
        setSelection(current => current?.company.id === companyId ? latest : current)
        setSelfApprovalNeedsRefresh(false)
        await queryClient.invalidateQueries({ queryKey: ['companies'] })
    }
    const handleSelfApprovalReadError = async (error: unknown, companyId: string) => {
        if (error instanceof ApiError && error.status === 401) { expire(); return }
        if (error instanceof ApiError && [403, 404].includes(error.status)) {
            setSelfApprovalNeedsRefresh(false)
            setSelfApprovalError('현재 회사에 접근할 수 없습니다. 접근 가능한 회사 목록을 다시 확인해 주세요.')
            await clearCompanyWorkspace(companyId); return
        }
        setSelfApprovalNeedsRefresh(true)
        setSelfApprovalError('최신 회사 상태를 확인하지 못했습니다. 연결을 확인하고 최신 회사를 다시 확인해 주세요.')
    }
    const refreshSelfApproval = async () => {
        if (!session || !selection || companyOperationPending || selfApprovalInFlight.current) return
        const companyId = selection.company.id
        selfApprovalInFlight.current = true; setSelfApprovalPending(true); clearSelfApprovalFeedback()
        try { await reloadSelfApproval(companyId); setSelfApprovalNotice('최신 회사 설정과 권한을 확인했습니다. 변경할 값을 다시 선택해 주세요.') }
        catch (error) { await handleSelfApprovalReadError(error, companyId) }
        finally { selfApprovalInFlight.current = false; setSelfApprovalPending(false) }
    }
    const saveSelfApproval = async (input: SelfApprovalChange, password: string) => {
        if (!session || !selection || selection.company.id !== input.companyId || companyOperationPending
            || selfApprovalInFlight.current || selfApprovalNeedsRefresh) throw new Error('COMPANY_OPERATION_PENDING')
        selfApprovalInFlight.current = true; setSelfApprovalPending(true); clearSelfApprovalFeedback()
        let reauthenticated = false
        let patchAttempted = false
        try {
            await authApi.reauthenticate(password, session.csrfToken)
            reauthenticated = true
            patchAttempted = true
            const company = await companyApi.changeSelfApproval(input.companyId,
                { allowSelfApproval: input.allowSelfApproval, version: input.version }, session.csrfToken)
            setSelection(current => current?.company.id === input.companyId ? { ...current, company } : current)
            setSelfApprovalNotice(`본인 승인 설정을 ${company.allowSelfApproval ? '허용' : '금지'}으로 변경했습니다.`)
            await queryClient.invalidateQueries({ queryKey: ['companies'] })
            // 응답에 교체 세션이 없다. adoptSession/쿠키 변경/다른 기기 폐기를 실행하지 않는다.
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                if (!reauthenticated) {
                    try { await authApi.session(); setSelfApprovalError('비밀번호를 확인하지 못했습니다. 현재 비밀번호를 다시 입력해 주세요.'); throw new ReauthenticationError() }
                    catch (probe) {
                        if (probe instanceof ReauthenticationError) throw probe
                        if (!(probe instanceof ApiError && probe.status === 401)) {
                            setSelfApprovalError('세션을 확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); throw new ReauthenticationError()
                        }
                    }
                }
                expire()
            } else if (error instanceof ApiError && [403, 404].includes(error.status)) {
                await handleSelfApprovalReadError(error, input.companyId)
            } else if (error instanceof ApiError && error.status === 409) {
                setSelfApprovalResetCount(value => value + 1)
                setSelfApprovalNeedsRefresh(true)
                setSelfApprovalError('다른 변경이 먼저 저장됐습니다. 최신 설정과 권한을 반영했으니 다시 확인해 주세요.')
                try { await reloadSelfApproval(input.companyId) }
                catch (readError) { await handleSelfApprovalReadError(readError, input.companyId) }
            } else if (patchAttempted && (!(error instanceof ApiError) || error.status >= 500)) {
                // 저장 후 응답만 유실될 수 있다. 결과를 모르는 동안 새 PATCH를 차단하고 조회만 허용한다.
                setSelfApprovalNeedsRefresh(true)
                setSelfApprovalError('저장 결과를 확인하지 못했습니다. 최신 회사를 다시 확인한 뒤 변경 여부를 판단해 주세요.')
            } else {
                setSelfApprovalError(error instanceof ApiError && error.status === 400 ? '요청 형식을 확인해 주세요.'
                    : error instanceof ApiError && error.status === 429 ? '요청 횟수가 많습니다. 잠시 후 다시 시도해 주세요.'
                        : '비밀번호를 재확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')
            }
            throw new Error('SELF_APPROVAL_FAILED')
        } finally { selfApprovalInFlight.current = false; setSelfApprovalPending(false) }
    }

    const authError = companies.error ?? fiscalYears.error ?? members.error ?? invitations.error ?? accessRequests.error ?? memberDetail.error
        ?? selectCompany.error ?? createCompany.error ?? renameCompany.error ?? addFiscalYear.error ?? changeMemberRoles.error
        ?? deactivateMember.error ?? createInvitation.error ?? changeInvitation.error ?? changeAccessRequest.error
    useEffect(() => {
        if (authError instanceof ApiError && authError.status === 401) expire()
    }, [authError, expire])

    return <div className="mx-auto max-w-[1500px] space-y-6">
        <header><p className="text-sm font-medium text-hud-accent-primary">회사·권한</p><h1 className="mt-1 text-2xl font-bold text-hud-text-primary sm:text-3xl">회사 관리</h1>
            <p className="mt-2 text-sm text-hud-text-muted">접근 가능한 회사를 선택하고 기본 정보와 실제 회계연도를 관리합니다.</p></header>

        {!selection && selfApprovalError && <p role="alert" className="text-sm text-hud-accent-danger">{selfApprovalError}</p>}
        <fieldset disabled={companyOperationPending} className="min-w-0">
            <CompanyCreateForm pending={createCompany.isPending || selectingAfterCreate} serverError={createCompany.error ? message(createCompany.error, 'create') : undefined}
                onCreate={async (input, password) => { await createCompany.mutateAsync({ input, password }) }} />
        </fieldset>
        {postCreateMessage && <p role="status" className="rounded-lg border border-hud-border-secondary bg-hud-bg-card px-4 py-3 text-sm text-hud-text-secondary">{postCreateMessage}</p>}

        {/* [F01 반응형 수정] 태블릿에서는 목록/작업 공간을 세로로 쌓아 확인 양식의 읽기 폭을 확보한다. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(15rem,0.75fr)_minmax(0,2fr)]">
            <aside aria-label="접근 가능한 회사" className="hud-card h-fit rounded-xl p-4">
                <div className="mb-4 flex items-center gap-2"><Building2 aria-hidden="true" size={19} className="text-hud-accent-primary" /><h2 className="font-semibold text-hud-text-primary">회사 목록</h2></div>
                {companies.isPending ? <AsyncState kind="loading" title="회사 목록을 불러오는 중입니다" description="현재 소속과 조회 권한을 확인하고 있습니다." />
                    : companies.isError ? <AsyncState kind="error" title="회사 목록을 불러오지 못했습니다" description={message(companies.error, 'list')} onRetry={() => { void companies.refetch() }} />
                        : companies.data.items.length === 0 ? <AsyncState kind="empty" title="접근 가능한 회사가 없습니다" description="위 등록 양식으로 첫 회사를 만들 수 있습니다." />
                            : <ul className="space-y-2">{companies.data.items.map(company => {
                                const selected = selection?.company.id === company.id
                                return <li key={company.id}><button type="button" aria-pressed={selected} onClick={() => {
                                    renameCompany.reset(); addFiscalYear.reset(); memberDetail.reset(); changeMemberRoles.reset(); deactivateMember.reset()
                                    createInvitation.reset(); changeInvitation.reset(); changeAccessRequest.reset()
                                    setMemberNotice(''); setAccessNotice(''); selectCompany.reset(); selectCompany.mutate(company.id)
                                    clearSelfApprovalFeedback(); setSelfApprovalNeedsRefresh(false)
                                }} disabled={companyOperationPending}
                                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary ${selected ? 'border-hud-accent-primary bg-hud-accent-primary/10 text-hud-accent-primary' : 'border-hud-border-secondary text-hud-text-secondary hover:bg-hud-bg-hover'}`}>
                                    <span><span className="block font-medium">{company.name}</span><span className="mt-1 block text-xs text-hud-text-muted">v{company.version} · {company.currency}</span></span><ChevronRight size={17} aria-hidden="true" />
                                </button></li>
                            })}</ul>}
                {selectCompany.error && <p role="alert" className="mt-3 text-sm text-hud-accent-danger">{message(selectCompany.error, 'select')}</p>}
            </aside>

            <section aria-label="선택 회사 작업 공간" className="min-w-0">
                {(selectCompany.isPending || selectingAfterCreate) ? <AsyncState kind="loading" title="회사 접근 권한을 확인하는 중입니다" description="현재 소속과 역할을 서버에서 다시 확인하고 있습니다." />
                    : selection ? <CompanyWorkspace selection={selection} fiscalYears={fiscalYears.data?.items} fiscalPending={fiscalYears.isPending}
                        companyOperationPending={companyOperationPending || selfApprovalNeedsRefresh}
                        selfApprovalSection={selection.permissions.includes('company.manage') ? <CompanySelfApprovalForm
                            key={`${selection.company.id}:${selfApprovalResetCount}`} company={selection.company}
                            busy={companyOperationPending} needsRefresh={selfApprovalNeedsRefresh} error={selfApprovalError} notice={selfApprovalNotice}
                            onSave={saveSelfApproval} onRefresh={refreshSelfApproval} onReset={clearSelfApprovalFeedback} /> : null}
                        fiscalError={fiscalYears.error ? message(fiscalYears.error, 'list') : undefined} onRetryFiscalYears={() => { void fiscalYears.refetch() }}
                        renamePending={renameCompany.isPending} renameError={renameCompany.error ? message(renameCompany.error, 'rename') : undefined}
                        periodPending={addFiscalYear.isPending} periodError={addFiscalYear.error ? message(addFiscalYear.error, 'period') : undefined}
                        onRename={async name => { addFiscalYear.reset(); await renameCompany.mutateAsync(name) }}
                        onAddFiscalYear={async (startDate, endDate) => { renameCompany.reset(); await addFiscalYear.mutateAsync({ startDate, endDate }) }}
                        membersSection={canManageMembers ? <CompanyMembersPanel companyId={selection.company.id} currentUserId={session!.user.id}
                            members={members.data?.pages.flatMap(page => page.items)} pending={members.isPending}
                            error={members.error ? memberMessage(members.error) : undefined} notice={memberNotice}
                            operationPending={companyOperationPending || memberDetail.isPending || changeMemberRoles.isPending || deactivateMember.isPending}
                            operationError={(memberDetail.error ?? changeMemberRoles.error ?? deactivateMember.error)
                                ? memberMessage(memberDetail.error ?? changeMemberRoles.error ?? deactivateMember.error) : undefined}
                            hasNextPage={Boolean(members.hasNextPage)} loadingMore={members.isFetchingNextPage}
                            onRetry={() => { void members.refetch() }} onLoadMore={() => { void members.fetchNextPage() }}
                            onLoadMember={membershipId => memberDetail.mutateAsync(membershipId)}
                            onChangeRoles={(member, roles, password) => changeMemberRoles.mutateAsync({ member, roles, password }).then(() => undefined)}
                            onDeactivate={(member, password) => deactivateMember.mutateAsync({ member, password }).then(() => undefined)}
                            onResetOperation={() => { memberDetail.reset(); changeMemberRoles.reset(); deactivateMember.reset(); setMemberNotice('') }} />
                            : <section role="status" className="rounded-xl border border-hud-border-secondary bg-hud-bg-card p-5 text-sm text-hud-text-secondary">구성원과 역할은 관리 권한이 있는 사용자만 관리할 수 있습니다. 현재 권한으로는 구성원 정보를 요청하지 않습니다.</section>}
                        accessSection={canManageMembers ? <CompanyAccessPanel companyId={selection.company.id}
                            invitations={invitations.data?.pages.flatMap(page => page.items)} requests={accessRequests.data?.pages.flatMap(page => page.items)}
                            invitationsPending={invitations.isPending} requestsPending={accessRequests.isPending}
                            invitationsError={invitations.error ? accessMessage(invitations.error) : undefined}
                            requestsError={accessRequests.error ? accessMessage(accessRequests.error) : undefined}
                            notice={accessNotice} operationPending={companyOperationPending || createInvitation.isPending || changeInvitation.isPending || changeAccessRequest.isPending}
                            operationError={(createInvitation.error ?? changeInvitation.error ?? changeAccessRequest.error)
                                ? accessMessage(createInvitation.error ?? changeInvitation.error ?? changeAccessRequest.error) : undefined}
                            invitationsHasNext={Boolean(invitations.hasNextPage)} requestsHasNext={Boolean(accessRequests.hasNextPage)}
                            invitationsLoadingMore={invitations.isFetchingNextPage} requestsLoadingMore={accessRequests.isFetchingNextPage}
                            onRetryInvitations={() => { void invitations.refetch() }} onRetryRequests={() => { void accessRequests.refetch() }}
                            onLoadMoreInvitations={() => { void invitations.fetchNextPage() }} onLoadMoreRequests={() => { void accessRequests.fetchNextPage() }}
                            onCreateInvitation={(email, roles, password) => createInvitation.mutateAsync({ email, roles, password }).then(() => undefined)}
                            onInvitationAction={(item, action, password) => changeInvitation.mutateAsync({ item, action, password }).then(() => undefined)}
                            onRequestAction={(item, action, password) => changeAccessRequest.mutateAsync({ item, action, password }).then(() => undefined)}
                            onResetOperation={() => { createInvitation.reset(); changeInvitation.reset(); changeAccessRequest.reset(); setAccessNotice('') }} /> : null} />
                        : <div className="hud-card grid min-h-64 place-items-center rounded-xl p-8 text-center"><div><Building2 aria-hidden="true" size={36} className="mx-auto mb-4 text-hud-accent-primary" />
                            <h2 className="text-lg font-semibold text-hud-text-primary">관리할 회사를 선택하세요</h2><p className="mt-2 max-w-md text-sm leading-6 text-hud-text-muted">선택 요청으로 현재 역할과 권한을 확인한 뒤 상세와 회계연도를 표시합니다.</p></div></div>}
            </section>
        </div>
    </div>
}
