// @vitest-environment jsdom
// [F05 K1~K5] 실제 세션/Query/Router로 승인 화면을 렌더하고 HTTP 경계에서만 서버 역할·상태를 모의한다.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import Approvals from '../src/pages/accounting/Approvals'
import { journalWorkflowApi, type CompanyRole, type JournalDetailView, type JournalWorkflowAction, type JournalWorkflowEvent } from '../src/lib/api'

const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const company = id(1), other = id(2), year = id(3), user = id(4), journal = id(5), account = id(6), evidence = id(7)
const row = (): JournalDetailView => ({ id: journal, number: '2026-1', fiscalYearId: year, accountingDate: '2026-10-07', memo: '가상 승인 적요', currency: 'KRW', status: 'SUBMITTED', version: 2, debitTotal: '9007199254740993', creditTotal: '9007199254740993', lineCount: 1, evidenceCount: 1, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', createdById: id(8), counterpartyId: null, evidenceIds: [evidence], lines: [{ id: id(9), position: 1, accountId: account, debit: '9007199254740993', credit: '0', memo: null }] })
const submission = { id: id(10), createdById: id(8), createdAt: '2026-10-07T01:00:00.000Z', content: { accountingDate: '2026-10-07', memo: '제출 당시 적요', counterpartyId: null, evidenceIds: [evidence], lines: [{ id: id(9), position: 1, accountId: account, debit: '9007199254740993', credit: '0', memo: null }] } }
type Call = { path: string; method: string; body: any; init: RequestInit; query: URLSearchParams }
let calls: Call[], current: JournalDetailView, role: CompanyRole, allowSelfApproval: boolean, approvalNext: boolean, historyNext: boolean, override: ((call: Call) => Response | Promise<Response> | undefined) | undefined
let events: JournalWorkflowEvent[], clients: QueryClient[]
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const error = (status: number) => json({ code: 'TEST_ERROR', details: [{ message: 'private internal' }] }, status)
const writes = () => calls.filter(call => call.method === 'POST' && /\/(approve|reject|return-to-draft|submit)$/.test(call.path))
function Gate({ children }: { children: React.ReactNode }) { return useAuth().status === 'authenticated' ? <>{children}</> : <p>세션 대기</p> }
function mount(path = '/accounting/approvals') {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } } }); clients.push(cache)
    return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}><AuthProvider><Gate><Approvals /></Gate></AuthProvider></MemoryRouter></QueryClientProvider>)
}
const choose = async () => { await screen.findByLabelText('승인 회사'); fireEvent.change(screen.getByLabelText('승인 회사'), { target: { value: company } }); await screen.findByRole('heading', { name: '승인 전표 목록' }) }
const open = async () => { await choose(); fireEvent.click(await screen.findByRole('button', { name: '2026-1 · 가상 승인 적요 상세' })); await screen.findByRole('heading', { name: '2026-1 · 승인 대기' }) }

beforeEach(() => {
    calls = []; clients = []; current = row(); role = 'COMPANY_ADMIN'; allowSelfApproval = false; approvalNext = false; historyNext = false; override = undefined
    events = [{ id: id(11), action: 'SUBMIT', statusBefore: 'DRAFT', statusAfter: 'SUBMITTED', versionBefore: 1, versionAfter: 2, actorId: id(8), reason: null, createdAt: '2026-10-07T01:00:00.000Z', submission }]
    localStorage.clear(); sessionStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit = {}) => {
        const url = new URL(path, 'https://example.invalid'), call = { path: url.pathname, query: url.searchParams, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : {}, init }; calls.push(call)
        const custom = override?.(call); if (custom) return await custom
        if (call.path === '/api/auth/session') return json({ user: { id: user, email: 'fixture@example.invalid' }, csrfToken: 'csrf-test', idleExpiresAt: '2099-01-01', absoluteExpiresAt: '2099-01-01' })
        if (call.path === '/api/companies') return json({ items: [company, other].map((value, index) => ({ id: value, name: `가상 회사 ${index + 1}` })), nextCursor: null })
        if (call.path.endsWith('/select')) return json({ company: { id: call.path.split('/')[3], name: '가상 회사', allowSelfApproval }, roles: [role], permissions: ['journal.read'] })
        if (call.path.endsWith('/fiscal-years')) return json({ items: [{ id: year, startDate: '2026-01-01', endDate: '2026-12-31' }], nextCursor: null })
        if (call.path.endsWith('/journal-approval-requests')) return json({ items: call.query.get('status') === current.status ? [call.query.has('cursor') ? { ...current, id: id(16), number: '2026-2' } : current] : [], nextCursor: approvalNext && !call.query.has('cursor') ? journal : null })
        if (call.path.endsWith('/workflow')) return json({ journal: current, allowedActions: current.status === 'SUBMITTED' && ['COMPANY_ADMIN', 'APPROVER'].includes(role) && (current.createdById !== user || allowSelfApproval) ? ['APPROVE', 'REJECT'] : current.status === 'REJECTED' && ['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role) ? ['RETURN_TO_DRAFT'] : [], history: { items: call.query.has('cursor') ? [{ ...events[0], id: id(12), action: 'APPROVE', createdAt: '2026-10-07T02:00:00.000Z' }] : events, nextCursor: historyNext && !call.query.has('cursor') ? id(11) : null } })
        if (call.path.endsWith(`/accounts/${account}`)) return json({ id: account, code: '101', name: '가상 계정', active: true, canUseInJournal: true })
        if (call.method === 'POST' && call.path.endsWith('/submit')) return json({ id: id(15), status: 'SUBMITTED', version: 2 })
        if (call.method === 'POST' && call.path.endsWith('/approve')) { current = { ...current, status: 'APPROVED', version: current.version + 1 }; events.push({ ...events[0], id: id(12), action: 'APPROVE', statusBefore: 'SUBMITTED', statusAfter: 'APPROVED', versionBefore: 2, versionAfter: 3, actorId: user }); return json({ id: id(12), status: current.status, version: current.version }) }
        if (call.method === 'POST' && call.path.endsWith('/reject')) { current = { ...current, status: 'REJECTED', version: current.version + 1 }; events.push({ ...events[0], id: id(13), action: 'REJECT', statusBefore: 'SUBMITTED', statusAfter: 'REJECTED', versionBefore: 2, versionAfter: 3, actorId: user, reason: call.body.reason }); return json({ id: id(13), status: current.status, version: current.version }) }
        if (call.method === 'POST' && call.path.endsWith('/return-to-draft')) { current = { ...current, status: 'DRAFT', version: current.version + 1 }; return json({ id: id(14), status: current.status, version: current.version }) }
        return error(404)
    }))
})
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('승인 화면 HTTP 계약과 역할', () => {
    it('keeps six routes, query filters, exact money and CSRF body', async () => {
        const controller = new AbortController()
        await journalWorkflowApi.list(company, { status: 'SUBMITTED', limit: 50, q: ' 적요 ', fiscalYearId: year, from: '2026-01-01', to: '2026-12-31' }, undefined, controller.signal)
        await journalWorkflowApi.detail(company, journal, undefined, controller.signal)
        for (const action of ['SUBMIT', 'APPROVE', 'REJECT', 'RETURN_TO_DRAFT'] as JournalWorkflowAction[]) await journalWorkflowApi.action(company, journal, action, { version: 2, actionRequestId: id(99), ...(action === 'REJECT' ? { reason: '근거' } : {}) }, 'csrf-test')
        expect(calls.slice(0, 2).every(call => call.init.signal === controller.signal && call.method === 'GET' && !('X-CSRF-Token' in (call.init.headers ?? {})))).toBe(true)
        expect(calls[0].query.get('limit')).toBe('50'); expect(calls[0].query.get('status')).toBe('SUBMITTED'); expect(calls[0].query.get('from')).toBe('2026-01-01')
        expect(writes().map(call => call.path.split('/').pop())).toEqual(['submit', 'approve', 'reject', 'return-to-draft'])
        expect(writes().every(call => call.init.credentials === 'include' && (call.init.headers as Record<string, string>)['X-CSRF-Token'] === 'csrf-test')).toBe(true)
        expect(writes()[2].body).toEqual({ version: 2, actionRequestId: id(99), reason: '근거' })
    })
    it.each(['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as CompanyRole[])('shows server allowed actions for %s', async value => {
        role = value; mount(); await open(); expect(Boolean(screen.queryByRole('button', { name: '승인', exact: true }))).toBe(['COMPANY_ADMIN', 'APPROVER'].includes(value)); expect(writes()).toHaveLength(0)
    })
    it('obeys company self-approval setting from server actions', async () => {
        current.createdById = user; role = 'APPROVER'; mount(); await open(); expect(screen.queryByRole('button', { name: '승인', exact: true })).toBeNull()
        cleanup(); allowSelfApproval = true; mount(); await open(); expect(screen.getByRole('button', { name: '승인', exact: true })).toBeTruthy()
    })
    it('shows immutable submission, exact money, UTC and evidence link', async () => {
        mount(); await open(); fireEvent.click(screen.getByText('제출 당시 내용 보기')); expect(screen.getByText('적요: 제출 당시 적요')).toBeTruthy(); expect(screen.getAllByText(/9,007,199,254,740,993/).length).toBeGreaterThan(0); expect(screen.getAllByText(/2026-10-07T01:00:00.000Z/).length).toBeGreaterThan(0); expect(screen.getByRole('link', { name: /증빙 상세와 원본 열기/ }).getAttribute('href')).toBe(`/accounting/evidence?companyId=${company}&evidenceId=${evidence}`)
    })
    it('applies status/year/date/search/limit and moves the server cursor both ways', async () => {
        approvalNext = true; mount(); await choose(); await screen.findByRole('option', { name: '2026-01-01 ~ 2026-12-31' })
        fireEvent.change(screen.getByLabelText('승인 상태'), { target: { value: 'APPROVED' } }); fireEvent.change(screen.getByLabelText('페이지 크기'), { target: { value: '50' } })
        fireEvent.change(screen.getByLabelText('번호·적요 검색'), { target: { value: ' 가상 ' } }); fireEvent.change(screen.getByLabelText('회계연도'), { target: { value: year } })
        fireEvent.change(screen.getByLabelText('회계일자 시작'), { target: { value: '2026-01-01' } }); fireEvent.change(screen.getByLabelText('회계일자 종료'), { target: { value: '2026-12-31' } })
        fireEvent.click(screen.getByRole('button', { name: '조건 적용' }))
        await waitFor(() => expect(calls.filter(call => call.path.endsWith('/journal-approval-requests')).at(-1)?.query.get('status')).toBe('APPROVED'))
        const filtered = calls.filter(call => call.path.endsWith('/journal-approval-requests')).at(-1)!.query
        expect(Object.fromEntries(filtered)).toMatchObject({ status: 'APPROVED', limit: '50', q: '가상', fiscalYearId: year, from: '2026-01-01', to: '2026-12-31' })
        fireEvent.change(screen.getByLabelText('승인 상태'), { target: { value: 'SUBMITTED' } }); fireEvent.click(screen.getByRole('button', { name: '조건 적용' }))
        await waitFor(() => expect((screen.getByRole('button', { name: '다음 페이지' }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole('button', { name: '다음 페이지' })); await waitFor(() => expect(calls.filter(call => call.path.endsWith('/journal-approval-requests')).at(-1)?.query.get('cursor')).toBe(journal))
        await waitFor(() => expect((screen.getByRole('button', { name: '이전 페이지' }) as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(screen.getByRole('button', { name: '이전 페이지' })); await screen.findByText('1페이지')
    })
    it('loads immutable workflow history with a separate cursor', async () => {
        historyNext = true; mount(); await open(); fireEvent.click(screen.getByRole('button', { name: '이력 더 보기' })); await waitFor(() => expect(calls.filter(call => call.path.endsWith('/workflow') && call.query.has('cursor')).length).toBe(1)); expect(calls.filter(call => call.path.endsWith('/workflow') && call.query.has('cursor'))[0].query.get('cursor')).toBe(id(11)); await waitFor(() => expect(screen.getAllByText('처리 시각 UTC')).toHaveLength(2))
    })
    it('validates rejection reason and refreshes history/status after success', async () => {
        mount(); await open(); fireEvent.click(screen.getByRole('button', { name: '반려', exact: true })); fireEvent.click(screen.getByRole('button', { name: '반려 확정' })); expect(screen.getByRole('alert').textContent).toContain('1~500'); expect(writes()).toHaveLength(0)
        fireEvent.change(screen.getByLabelText(/반려 사유/), { target: { value: ' 가상 반려 근거 ' } }); fireEvent.click(screen.getByRole('button', { name: '반려 확정' }))
        await screen.findByRole('heading', { name: '2026-1 · 반려' }); expect(writes()[0].body.reason).toBe('가상 반려 근거'); expect(screen.getByText('가상 반려 근거')).toBeTruthy(); expect(screen.getByRole('button', { name: '초안 복귀' })).toBeTruthy()
    })
    it('returns a rejected journal to draft only by explicit action', async () => {
        current = { ...current, status: 'REJECTED', version: 3 }; mount(); await choose(); fireEvent.change(screen.getByLabelText('승인 상태'), { target: { value: 'REJECTED' } }); fireEvent.click(screen.getByRole('button', { name: '조건 적용' })); fireEvent.click(await screen.findByRole('button', { name: '2026-1 · 가상 승인 적요 상세' })); await screen.findByRole('button', { name: '초안 복귀' }); expect(writes()).toHaveLength(0); fireEvent.click(screen.getByRole('button', { name: '초안 복귀' })); fireEvent.click(screen.getByRole('button', { name: '초안 복귀 확정' })); await screen.findByRole('heading', { name: '2026-1 · 초안' }); expect(writes()).toHaveLength(1); expect(writes()[0].body.version).toBe(3)
    })
    it('keeps the same request ID for explicit unknown-result retry', async () => {
        let failed = false; override = call => call.path.endsWith('/approve') && !failed ? (failed = true, error(503)) : undefined
        mount(); await open(); fireEvent.click(screen.getByRole('button', { name: '승인', exact: true })); fireEvent.click(screen.getByRole('button', { name: '승인 확정' }))
        await screen.findByRole('button', { name: '같은 요청으로 결과 확인' }); expect(writes()).toHaveLength(1); fireEvent.click(screen.getByRole('button', { name: '같은 요청으로 결과 확인' })); await screen.findByRole('heading', { name: '2026-1 · 승인 완료' }); expect(writes()).toHaveLength(2); expect(writes()[1].body).toEqual(writes()[0].body); expect(localStorage.length + sessionStorage.length).toBe(0)
    })
    it('rechecks 409 without automatic overwrite', async () => {
        override = call => call.path.endsWith('/approve') ? error(409) : undefined
        mount(); await open(); fireEvent.click(screen.getByRole('button', { name: '승인', exact: true })); fireEvent.click(screen.getByRole('button', { name: '승인 확정' })); await screen.findByText(/현재 상태가 변경됐습니다/); expect(writes()).toHaveLength(1); expect(screen.queryByText('private internal')).toBeNull()
    })
    it.each([404, 429, 503] as const)('shows %s approval list error and manual retry', async status => {
        override = call => call.path.endsWith('/journal-approval-requests') ? error(status) : undefined
        mount(); await choose(); await screen.findByRole('heading', { name: '승인 목록을 불러오지 못했습니다' }); expect(screen.queryByText('private internal')).toBeNull(); const before = calls.filter(call => call.path.endsWith('/journal-approval-requests')).length; fireEvent.click(screen.getByRole('button', { name: '다시 시도' })); await waitFor(() => expect(calls.filter(call => call.path.endsWith('/journal-approval-requests')).length).toBe(before + 1))
    })
    it('ends the session on 401 approval list response', async () => {
        override = call => call.path.endsWith('/journal-approval-requests') ? error(401) : undefined
        mount(); await choose(); await screen.findByText('세션 대기')
    })
})
