export type ApiDetail = { field?: string; message: string }

export class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, readonly details: ApiDetail[] = []) {
        super(code)
        this.name = 'ApiError'
    }
}

export interface SessionView {
    user: { id: string; email: string }
    csrfToken: string
    idleExpiresAt: string
    absoluteExpiresAt: string
}

export interface CompanyView {
    id: string
    name: string
    currency: string
    accountingStandard: string
    allowSelfApproval: boolean
    version: number
}

export interface FiscalYearView {
    id: string
    startDate: string
    endDate: string
}

export type CompanyRole = 'COMPANY_ADMIN' | 'ACCOUNTANT' | 'APPROVER' | 'READ_ONLY' | 'EXTERNAL_TAX'
export interface CompanySelection {
    company: CompanyView
    roles: CompanyRole[]
    permissions: string[]
}

export interface CreateCompanyInput {
    creationRequestId: string
    name: string
    startDate: string
    endDate: string
}

export interface CompanyMemberView {
    id: string
    companyId: string
    active: boolean
    version: number
    roles: CompanyRole[]
    user: { id: string; email: string; emailVerified: boolean; disabled: boolean }
}

export type CompanyInvitationStatus = 'PENDING' | 'CANCELLED' | 'ACCEPTED' | 'EXPIRED'
export interface CompanyInvitationView {
    id: string
    companyId: string
    email: string
    roles: CompanyRole[]
    issuerId: string
    status: CompanyInvitationStatus
    version: number
    expiresAt: string
}

export type CompanyAccessRequestStatus = 'PENDING' | 'CANCELLED' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
export interface CompanyAccessRequestView {
    id: string
    companyId: string
    requesterId: string
    status: CompanyAccessRequestStatus
    version: number
    expiresAt: string
    requester: { id: string; email: string; emailVerified: boolean; disabled: boolean }
}

// [F01 본인 접근 추가] 본인 목록에는 관리자용 requester 상세가 없다.
// 소속 없는 사용자에게 회사명·다른 요청자 정보를 조회하는 기능도 제공하지 않는다.
export type OwnCompanyAccessRequestView = Omit<CompanyAccessRequestView, 'requester'>
export interface AcceptedCompanyInvitation {
    invitation: CompanyInvitationView
    member: Omit<CompanyMemberView, 'user'>
    session: SessionView
}

export interface RuleArtifactView {
    id: string
    kind: 'CONFIG' | 'CALCULATION' | 'ACCOUNT_MAPPING' | 'FORM'
    version: string
    repositoryLocator: string
    contentSha256: string
    metadata: Record<string, unknown>
}

export interface RuleApplicationView {
    id: string
    effectiveFrom: string
    effectiveTo: string | null
    rule: { id: string; domain: 'ACCOUNTING' | 'TAX'; jurisdiction: string; code: string; name: string }
    version: {
        id: string
        version: string
        officialSourceTitle: string
        officialSourceUrl: string
        legalProvision: string
        promulgatedOn: string | null
        effectiveFrom: string
        effectiveTo: string | null
        applicableFrom: string
        applicableTo: string | null
        companyConditions: Record<string, unknown>
        transitionalProvisions: Record<string, unknown>
        artifacts: RuleArtifactView[]
    }
}

export interface CursorPage<T> { items: T[]; nextCursor: string | null }
// [F02 화면 T3 추가] 서버의 공개14필드만 정의한다. 생성 입력 해시/세션/내부 요청 ID는 상세에 없다.
export type CounterpartyKind = 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
export interface CounterpartyFields {
    name: string
    kind: CounterpartyKind
    businessNumber: string | null
    contactName: string | null
    email: string | null
    phone: string | null
    address: string | null
    memo: string | null
}
export interface CounterpartyView extends CounterpartyFields {
    id: string
    companyId: string
    active: boolean
    version: number
    createdAt: string
    updatedAt: string
}
export type CreateCounterpartyInput = CounterpartyFields & { creationRequestId: string }
export type UpdateCounterpartyInput = Partial<CounterpartyFields> & { version: number }
export interface CounterpartyFilters { q?: string; kind?: CounterpartyKind; active: 'active' | 'inactive' | 'all' }
// [F03 B3~B6] 서버 공개 11필드와 요청 상태만 브라우저 계약으로 둔다. 저장 키/지문은 포함하지 않는다.
export type EvidenceKind = 'RECEIPT' | 'TAX_INVOICE' | 'OTHER'
export interface EvidenceView {
    id: string; companyId: string; kind: EvidenceKind; title: string; occurredOn: string | null
    counterpartyId: string | null; originalFileName: string; mediaType: string; byteSize: number
    createdById: string; createdAt: string
}
export interface EvidenceMetadata {
    creationRequestId: string; kind: EvidenceKind; title: string
    occurredOn: string | null; counterpartyId: string | null
}
export interface EvidenceFilters { q?: string; kind?: EvidenceKind; counterpartyId?: string }
export interface EvidenceRequestStatus {
    creationRequestId: string; state: 'PENDING' | 'READY' | 'FAILED' | 'CLEANING' | 'EXPIRED'
    evidenceId: string | null; retryable: boolean; failureCode: string | null
}
interface RequestOptions extends RequestInit { csrfToken?: string }

// [F08-14 추가] 브라우저 API는 같은 출처의 HttpOnly 세션 쿠키를 사용한다.
// 서버의 고정 오류 코드만 보존하고 원문 응답이나 입력값은 화면 오류로 다시 노출하지 않는다.
// [F04 시험 계약 수리] HTTP 캐시 정책은 서버의 Cache-Control 응답이 정한다.
// Query의 회사별 메모리 캐시는 별도이므로 이전 페이지 이동이 반드시 새 fetch를 만들지는 않는다.
async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { csrfToken, headers, ...init } = options
    const response = await fetch(path, {
        ...init,
        credentials: 'include',
        headers: {
            // [F03 B4] multipart는 브라우저가 boundary를 설정한다. JSON 호출의 종전 헤더는 유지한다.
            ...(init.body === undefined || init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            ...headers,
        },
    })
    const body = await response.json().catch(() => null) as null | { code?: string; details?: ApiDetail[] }
    if (!response.ok) {
        throw new ApiError(response.status, body?.code ?? 'REQUEST_FAILED', Array.isArray(body?.details) ? body.details : [])
    }
    return body as T
}

export const authApi = {
    // [F01 계정 보안 추가] 재확인 성공 후에만 현재 세션 CSRF로 변경한다. 새/확인/현재 값을 섞지 않는다.
    changePassword: (newPassword: string, csrfToken: string) => requestJson<{ success: true }>('/api/auth/password/change', {
        method: 'POST', body: JSON.stringify({ newPassword }), csrfToken,
    }),
    logoutAll: (csrfToken: string) => requestJson<{ success: true }>('/api/auth/logout-all', {
        method: 'POST', body: JSON.stringify({}), csrfToken,
    }),
    // [F01 공개 계정 화면 추가] 접수는 메일 배달/계정 존재를 보증하지 않는다.
    // 비밀번호·token은 호출 중에만 사용하며 Query mutation에 등록하지 않는다.
    register: (email: string, password: string) => requestJson<{ accepted: true }>('/api/auth/register', {
        method: 'POST', body: JSON.stringify({ email, password }),
    }),
    requestVerification: (email: string) => requestJson<{ accepted: true }>('/api/auth/email-verification/request', {
        method: 'POST', body: JSON.stringify({ email }),
    }),
    confirmVerification: (token: string, newPassword: string) => requestJson<{ success: true }>('/api/auth/email-verification/confirm', {
        method: 'POST', body: JSON.stringify({ token, newPassword }),
    }),
    requestReset: (email: string) => requestJson<{ accepted: true }>('/api/auth/password-reset/request', {
        method: 'POST', body: JSON.stringify({ email }),
    }),
    confirmReset: (token: string, newPassword: string) => requestJson<{ success: true }>('/api/auth/password-reset/confirm', {
        method: 'POST', body: JSON.stringify({ token, newPassword }),
    }),
    session: (signal?: AbortSignal) => requestJson<SessionView>('/api/auth/session', { signal }),
    login: (email: string, password: string) => requestJson<SessionView>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
    }),
    logout: (csrfToken: string) => requestJson<{ success: true }>('/api/auth/logout', {
        method: 'POST', body: JSON.stringify({}), csrfToken,
    }),
    reauthenticate: (password: string, csrfToken: string) => requestJson<{ success: true }>('/api/auth/reauthenticate', {
        method: 'POST', body: JSON.stringify({ password }), csrfToken,
    }),
}

export const companyApi = {
    // 수락 호출은 화면의 명시적 제출에서만 한다. 링크 열기/로그인/GET은 수락하지 않는다.
    acceptInvitation: (token: string, csrfToken: string) => requestJson<AcceptedCompanyInvitation>(
        '/api/company-invitations/accept', { method: 'POST', body: JSON.stringify({ token }), csrfToken },
    ),
    createOwnAccessRequest: (companyId: string, csrfToken: string) => requestJson<{ accessRequest: OwnCompanyAccessRequestView }>(
        `/api/companies/${encodeURIComponent(companyId)}/access-requests`,
        // EXTERNAL_TAX 부여는 서버 정책이다. 사용자는 역할·상태·요청자를 지정하지 않는다.
        { method: 'POST', body: JSON.stringify({}), csrfToken },
    ),
    ownAccessRequests: (signal?: AbortSignal, cursor?: string) => {
        const query = new URLSearchParams({ limit: '25' })
        if (cursor) query.set('cursor', cursor)
        return requestJson<CursorPage<OwnCompanyAccessRequestView>>(`/api/me/company-access-requests?${query}`, { signal })
    },
    cancelOwnAccessRequest: (id: string, version: number, csrfToken: string) => requestJson<{ accessRequest: OwnCompanyAccessRequestView }>(
        `/api/me/company-access-requests/${encodeURIComponent(id)}/cancel`,
        { method: 'POST', body: JSON.stringify({ version }), csrfToken },
    ),
    list: (signal?: AbortSignal, options: { cursor?: string; limit?: number } = {}) => {
        const query = new URLSearchParams({ limit: String(options.limit ?? 100) })
        if (options.cursor) query.set('cursor', options.cursor)
        return requestJson<CursorPage<CompanyView>>(`/api/companies?${query}`, { signal })
    },
    detail: (companyId: string, signal?: AbortSignal) =>
        requestJson<CompanyView>(`/api/companies/${encodeURIComponent(companyId)}`, { signal }),
    select: (companyId: string, csrfToken: string) =>
        requestJson<CompanySelection>(`/api/companies/${encodeURIComponent(companyId)}/select`, {
            method: 'POST', body: JSON.stringify({}), csrfToken,
        }),
    create: (input: CreateCompanyInput, csrfToken: string) =>
        requestJson<{ company: CompanyView; created: boolean; session: SessionView }>('/api/companies', {
            method: 'POST', body: JSON.stringify(input), csrfToken,
        }),
    rename: (companyId: string, input: { name: string; version: number }, csrfToken: string) =>
        requestJson<CompanyView>(`/api/companies/${encodeURIComponent(companyId)}`, {
            method: 'PATCH', body: JSON.stringify(input), csrfToken,
        }),
    // [전표 B3] 첫100기간 이후도 조회한다. 기존 companyId/signal 호출은 그대로 유지한다.
    fiscalYears: (companyId: string, signal?: AbortSignal, cursor?: string) => {
        const query = new URLSearchParams({ limit: '100' })
        if (cursor) query.set('cursor', cursor)
        return requestJson<CursorPage<FiscalYearView>>(`/api/companies/${encodeURIComponent(companyId)}/fiscal-years?${query}`, { signal })
    },
    // [F01 설정 화면 추가] 비밀번호는 재인증 API로만 전달하며 설정은 역할/세션을 교체하지 않는다.
    changeSelfApproval: (companyId: string, input: { allowSelfApproval: boolean; version: number }, csrfToken: string) =>
        requestJson<CompanyView>(`/api/companies/${encodeURIComponent(companyId)}/settings/self-approval`, {
            method: 'PATCH', body: JSON.stringify(input), csrfToken,
        }),
    // 기존 회계연도 추가 계약을 그대로 유지한다.
    addFiscalYear: (companyId: string, input: { startDate: string; endDate: string; version: number }, csrfToken: string) =>
        requestJson<{ fiscalYear: FiscalYearView; company: CompanyView }>(
            `/api/companies/${encodeURIComponent(companyId)}/fiscal-years`,
            { method: 'POST', body: JSON.stringify(input), csrfToken },
        ),
    // [F01 구성원 화면 추가] 목록은 회사별 cursor로만 이어가며 사용자 비밀·다른 회사 소속은 응답 타입에 넣지 않는다.
    members: (companyId: string, signal?: AbortSignal, options: { cursor?: string; limit?: number } = {}) => {
        const query = new URLSearchParams({ limit: String(options.limit ?? 25) })
        if (options.cursor) query.set('cursor', options.cursor)
        return requestJson<CursorPage<CompanyMemberView>>(
            `/api/companies/${encodeURIComponent(companyId)}/members?${query}`, { signal },
        )
    },
    memberDetail: (companyId: string, membershipId: string, signal?: AbortSignal) =>
        requestJson<CompanyMemberView>(
            `/api/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(membershipId)}`, { signal },
        ),
    changeMemberRoles: (companyId: string, membershipId: string, roles: CompanyRole[], version: number, csrfToken: string) =>
        requestJson<{ member: CompanyMemberView; session: SessionView | null }>(
            `/api/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(membershipId)}/roles`,
            // 서버가 집합으로 비교하는 역할을 브라우저도 정렬해 같은 선택은 항상 같은 요청 본문으로 보낸다.
            { method: 'PATCH', body: JSON.stringify({ roles: [...roles].sort(), version }), csrfToken },
        ),
    deactivateMember: (companyId: string, membershipId: string, version: number, csrfToken: string) =>
        requestJson<{ member: CompanyMemberView; sessionRevoked: boolean }>(
            `/api/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(membershipId)}/deactivate`,
            { method: 'POST', body: JSON.stringify({ version }), csrfToken },
        ),
    // [F01 접근 관리 화면] 초대와 접근 요청은 서로 독립된 cursor를 유지한다.
    invitations: (companyId: string, signal?: AbortSignal, options: { cursor?: string; limit?: number } = {}) => {
        const query = new URLSearchParams({ limit: String(options.limit ?? 25) })
        if (options.cursor) query.set('cursor', options.cursor)
        return requestJson<CursorPage<CompanyInvitationView>>(
            `/api/companies/${encodeURIComponent(companyId)}/invitations?${query}`, { signal },
        )
    },
    createInvitation: (companyId: string, email: string, roles: CompanyRole[], csrfToken: string) =>
        requestJson<{ invitation: CompanyInvitationView; accepted: true }>(
            `/api/companies/${encodeURIComponent(companyId)}/invitations`,
            { method: 'POST', body: JSON.stringify({ email, roles: [...roles].sort() }), csrfToken },
        ),
    changeInvitation: (companyId: string, invitationId: string, action: 'cancel' | 'resend', version: number, csrfToken: string) =>
        requestJson<{ invitation: CompanyInvitationView; accepted: true }>(
            `/api/companies/${encodeURIComponent(companyId)}/invitations/${encodeURIComponent(invitationId)}/${action}`,
            { method: 'POST', body: JSON.stringify({ version }), csrfToken },
        ),
    accessRequests: (companyId: string, signal?: AbortSignal, options: { cursor?: string; limit?: number } = {}) => {
        const query = new URLSearchParams({ limit: String(options.limit ?? 25) })
        if (options.cursor) query.set('cursor', options.cursor)
        return requestJson<CursorPage<CompanyAccessRequestView>>(
            `/api/companies/${encodeURIComponent(companyId)}/access-requests?${query}`, { signal },
        )
    },
    changeAccessRequest: (companyId: string, requestId: string, action: 'approve' | 'reject', version: number, csrfToken: string) =>
        requestJson<{ accessRequest: CompanyAccessRequestView }>(
            `/api/companies/${encodeURIComponent(companyId)}/access-requests/${encodeURIComponent(requestId)}/${action}`,
            { method: 'POST', body: JSON.stringify({ version }), csrfToken },
        ),
}

// [F02 화면 T2~T5 추가] 기존 requestJson의 쿠키/오류 계약을 공유하고 쓰기에만 현재 CSRF를 전달한다.
// GET의 AbortSignal은 이전 회사 응답을 취소하는 용도다. POST/PATCH는 자동 재전송하지 않는다.
export const counterpartyApi = {
    list: (companyId: string, filters: CounterpartyFilters, cursor?: string, signal?: AbortSignal) => {
        const query = new URLSearchParams({ limit: '20', active: filters.active })
        if (filters.q) query.set('q', filters.q)
        if (filters.kind) query.set('kind', filters.kind)
        if (cursor) query.set('cursor', cursor)
        return requestJson<CursorPage<CounterpartyView>>(`/api/companies/${encodeURIComponent(companyId)}/counterparties?${query}`, { signal })
    },
    detail: (companyId: string, id: string, signal?: AbortSignal) => requestJson<CounterpartyView>(
        `/api/companies/${encodeURIComponent(companyId)}/counterparties/${encodeURIComponent(id)}`, { signal }),
    create: (companyId: string, input: CreateCounterpartyInput, csrfToken: string) => requestJson<{ counterparty: CounterpartyView; created: boolean }>(
        `/api/companies/${encodeURIComponent(companyId)}/counterparties`, { method: 'POST', body: JSON.stringify(input), csrfToken }),
    update: (companyId: string, id: string, input: UpdateCounterpartyInput, csrfToken: string) => requestJson<CounterpartyView>(
        `/api/companies/${encodeURIComponent(companyId)}/counterparties/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input), csrfToken }),
    deactivate: (companyId: string, id: string, version: number, csrfToken: string) => requestJson<CounterpartyView>(
        `/api/companies/${encodeURIComponent(companyId)}/counterparties/${encodeURIComponent(id)}/deactivate`, { method: 'POST', body: JSON.stringify({ version }), csrfToken }),
}

// [F04 화면 B1~B5 추가] 서버가 공개한 8필드만 표현한다. 자격은 계정 구조상 조건이며 전표 승인과 별개다.
export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
export type AccountNormalBalance = 'DEBIT' | 'CREDIT'
export interface AccountView {
    id: string; code: string; name: string; category: AccountCategory | null; normalBalance: AccountNormalBalance | null
    active: boolean; version: number; canUseInJournal: boolean
}
export interface AccountFields { code: string; name: string; category: AccountCategory; normalBalance: AccountNormalBalance }
export interface CreateAccountInput extends AccountFields { creationRequestId: string }
export interface UpdateAccountInput { version: number; name?: string; category?: AccountCategory; normalBalance?: AccountNormalBalance }
export interface AccountFilters { q?: string; category?: AccountCategory; active: 'active' | 'inactive' | 'all' }
// 조회는 AbortSignal로 이전 화면에서 분리한다. 쓰기는 자동 재전송하지 않고 현재 CSRF를 사용한다.
export const accountApi = {
    list: (companyId: string, filters: AccountFilters, cursor?: string, signal?: AbortSignal) => {
        const query = new URLSearchParams({ limit: '20', active: filters.active })
        if (filters.q) query.set('q', filters.q)
        if (filters.category) query.set('category', filters.category)
        if (cursor) query.set('cursor', cursor)
        return requestJson<CursorPage<AccountView>>(`/api/companies/${encodeURIComponent(companyId)}/accounts?${query}`, { signal })
    },
    detail: (companyId: string, id: string, signal?: AbortSignal) => requestJson<AccountView>(
        `/api/companies/${encodeURIComponent(companyId)}/accounts/${encodeURIComponent(id)}`, { signal }),
    create: (companyId: string, input: CreateAccountInput, csrfToken: string) => requestJson<AccountView>(
        `/api/companies/${encodeURIComponent(companyId)}/accounts`, { method: 'POST', body: JSON.stringify(input), csrfToken }),
    update: (companyId: string, id: string, input: UpdateAccountInput, csrfToken: string) => requestJson<AccountView>(
        `/api/companies/${encodeURIComponent(companyId)}/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input), csrfToken }),
    deactivate: (companyId: string, id: string, version: number, csrfToken: string) => requestJson<AccountView>(
        `/api/companies/${encodeURIComponent(companyId)}/accounts/${encodeURIComponent(id)}/deactivate`, { method: 'POST', body: JSON.stringify({ version }), csrfToken }),
}

// [F03 B3~B6] 기존 same-origin 쿠키/CSRF/안전 오류 계약으로 서버 5경로를 연결한다.
// 파일/Blob은 반환 직후의 화면 메모리에서만 다룬다. Query 캐시에 원본 바이트를 넣지 않는다.
// [F05 W7] 기존 초안 5경로의 응답은 상태 전이 뒤에도 같은 전표를 반환한다. 금액은 JSON 문자열이다.
export type JournalStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'POSTED'
export interface JournalSummary {
    id: string; number: string; fiscalYearId: string; accountingDate: string; memo: string
    currency: 'KRW'; status: JournalStatus; version: number; debitTotal: string; creditTotal: string
    lineCount: number; evidenceCount: number; createdAt: string; updatedAt: string
}
export interface JournalLineInput { accountId: string; debit: string; credit: string; memo: string | null }
export interface JournalContent { accountingDate: string; memo: string; counterpartyId: string | null; evidenceIds: string[]; lines: JournalLineInput[] }
export interface JournalDetailView extends JournalSummary { createdById: string; counterpartyId: string | null; evidenceIds: string[]; lines: (JournalLineInput & { id: string; position: number })[] }
export interface CreateJournalInput extends JournalContent { creationRequestId: string; fiscalYearId: string }
export interface UpdateJournalInput extends JournalContent { version: number }
export interface JournalFilters { q?: string; fiscalYearId?: string; from?: string; to?: string }
const journalsPath = (companyId: string) => `/api/companies/${encodeURIComponent(companyId)}/journals`
// [F05 A1 승인 화면 계약] 서버의 제출본은 저장 시점 스냅샷이며 금액은 끝까지 문자열로 보관한다.
export type JournalWorkflowAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETURN_TO_DRAFT'
export type JournalWorkflowHistoryAction = JournalWorkflowAction | 'CONFIRM'
export interface JournalSubmissionContent extends Omit<JournalContent, 'lines'> {
    lines: (JournalLineInput & { id: string; position: number })[]
}
export interface JournalWorkflowEvent {
    id: string; action: JournalWorkflowHistoryAction; statusBefore: JournalStatus; statusAfter: JournalStatus
    versionBefore: number; versionAfter: number; actorId: string; reason: string | null; createdAt: string
    submission: { id: string; content: JournalSubmissionContent; createdById: string; createdAt: string }
}
export interface JournalWorkflowView {
    journal: JournalDetailView; allowedActions: JournalWorkflowAction[]; history: CursorPage<JournalWorkflowEvent>
}
export interface JournalApprovalFilters extends JournalFilters { status: Extract<JournalStatus, 'SUBMITTED' | 'APPROVED' | 'REJECTED'>; limit?: number }
export interface JournalWorkflowActionInput { version: number; actionRequestId: string }
export interface JournalWorkflowResult { id: string; status: JournalStatus; version: number }
const workflowPath = (companyId: string, id: string) => `${journalsPath(companyId)}/${encodeURIComponent(id)}`
export const journalWorkflowApi = {
    list: (companyId: string, filters: JournalApprovalFilters, cursor?: string, signal?: AbortSignal) => {
        const query = new URLSearchParams({ status: filters.status, limit: String(filters.limit ?? 20) })
        for (const key of ['q', 'fiscalYearId', 'from', 'to'] as const) if (filters[key]) query.set(key, filters[key]!)
        if (cursor) query.set('cursor', cursor)
        return requestJson<CursorPage<JournalSummary>>(`/api/companies/${encodeURIComponent(companyId)}/journal-approval-requests?${query}`, { signal })
    },
    detail: (companyId: string, id: string, cursor?: string, signal?: AbortSignal) => {
        const query = new URLSearchParams({ limit: '20' }); if (cursor) query.set('cursor', cursor)
        return requestJson<JournalWorkflowView>(`${workflowPath(companyId, id)}/workflow?${query}`, { signal })
    },
    // [F05 A1] 쓰기는 동일 출처의 세션/CSRF를 사용한다. 처리 시각·행위자는 서버만 정한다.
    action: (companyId: string, id: string, action: JournalWorkflowAction, input: JournalWorkflowActionInput & { reason?: string }, csrfToken: string) => {
        const suffix = { SUBMIT: 'submit', APPROVE: 'approve', REJECT: 'reject', RETURN_TO_DRAFT: 'return-to-draft' }[action]
        return requestJson<JournalWorkflowResult>(`${workflowPath(companyId, id)}/${suffix}`, {
            method: 'POST', body: JSON.stringify(action === 'REJECT' ? { ...input, reason: input.reason } : input), csrfToken,
        })
    },
}
export const journalApi = {
    list: (companyId: string, filters: JournalFilters, cursor?: string, signal?: AbortSignal) => {
        const query = new URLSearchParams({ limit: '20' })
        for (const key of ['q', 'fiscalYearId', 'from', 'to'] as const) if (filters[key]) query.set(key, filters[key]!)
        if (cursor) query.set('cursor', cursor)
        return requestJson<CursorPage<JournalSummary>>(`${journalsPath(companyId)}?${query}`, { signal })
    },
    detail: (companyId: string, id: string, signal?: AbortSignal) => requestJson<JournalDetailView>(`${journalsPath(companyId)}/${encodeURIComponent(id)}`, { signal }),
    create: (companyId: string, input: CreateJournalInput, csrfToken: string) => requestJson<JournalDetailView>(journalsPath(companyId), { method: 'POST', body: JSON.stringify(input), csrfToken }),
    update: (companyId: string, id: string, input: UpdateJournalInput, csrfToken: string) => requestJson<JournalDetailView>(`${journalsPath(companyId)}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input), csrfToken }),
    forEvidence: (companyId: string, id: string, cursor?: string, signal?: AbortSignal) => {
        const query = new URLSearchParams({ limit: '20' }); if (cursor) query.set('cursor', cursor)
        return requestJson<CursorPage<JournalSummary>>(`/api/companies/${encodeURIComponent(companyId)}/evidence/${encodeURIComponent(id)}/journals?${query}`, { signal })
    },
}

export const evidenceApi = {
    list: (companyId: string, filters: EvidenceFilters, cursor?: string, signal?: AbortSignal) => {
        const query = new URLSearchParams({ limit: '20' })
        if (filters.q) query.set('q', filters.q)
        if (filters.kind) query.set('kind', filters.kind)
        if (filters.counterpartyId) query.set('counterpartyId', filters.counterpartyId)
        if (cursor) query.set('cursor', cursor)
        return requestJson<CursorPage<EvidenceView>>(`/api/companies/${encodeURIComponent(companyId)}/evidence?${query}`, { signal })
    },
    detail: (companyId: string, id: string, signal?: AbortSignal) => requestJson<{ evidence: EvidenceView }>(
        `/api/companies/${encodeURIComponent(companyId)}/evidence/${encodeURIComponent(id)}`, { signal }),
    status: (companyId: string, requestId: string, signal?: AbortSignal) => requestJson<EvidenceRequestStatus>(
        `/api/companies/${encodeURIComponent(companyId)}/evidence/requests/${encodeURIComponent(requestId)}`, { signal }),
    register: (companyId: string, metadata: EvidenceMetadata, file: File, csrfToken: string) => {
        const body = new FormData()
        body.append('metadata', JSON.stringify(metadata))
        body.append('file', file, file.name)
        return requestJson<{ evidence: EvidenceView; created: boolean }>(
            `/api/companies/${encodeURIComponent(companyId)}/evidence`, { method: 'POST', body, csrfToken },
        )
    },
    // [F03 V3/V4] 미리보기는 취소 신호와 상세 MIME을 전달한다. 종전 다운로드의 두 인자는 그대로 유효하다.
    original: async (companyId: string, id: string, options: { signal?: AbortSignal; mediaType?: string } = {}): Promise<Blob> => {
        const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/evidence/${encodeURIComponent(id)}/original`, {
            credentials: 'include', cache: 'no-store', signal: options.signal,
        })
        if (!response.ok) {
            const body = await response.json().catch(() => null) as null | { code?: string; details?: ApiDetail[] }
            throw new ApiError(response.status, body?.code ?? 'REQUEST_FAILED', Array.isArray(body?.details) ? body.details : [])
        }
        // 허용된 상세 유형과 응답이 일치할 때만 미리보기 바이트를 사용한다. HTML/SVG를 Blob URL로 실행하지 않는다.
        const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
        if (options.mediaType && (!['application/pdf', 'image/jpeg', 'image/png'].includes(options.mediaType) || mediaType !== options.mediaType)) {
            await response.body?.cancel()
            throw new ApiError(503, 'FILE_TYPE_MISMATCH')
        }
        const bytes = await response.blob()
        if (bytes.size > 10_485_760) throw new ApiError(503, 'FILE_SIZE_MISMATCH')
        return bytes
    },
}

export function listRuleApplications(companyId: string, options: { asOf?: string; cursor?: string; limit?: number; signal?: AbortSignal }) {
    const query = new URLSearchParams({ limit: String(options.limit ?? 25) })
    if (options.asOf) query.set('asOf', options.asOf)
    if (options.cursor) query.set('cursor', options.cursor)
    return requestJson<CursorPage<RuleApplicationView>>(
        `/api/companies/${encodeURIComponent(companyId)}/rule-applications?${query}`,
        { signal: options.signal },
    )
}
