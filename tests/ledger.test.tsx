// @vitest-environment jsdom
// [F04/F05 B1~B7] API 경계·기초 입력·세 장부 탭을 실제 Query/Router 상태로 검증한다.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import Ledger from '../src/pages/accounting/Ledger'
import { normalizeOpeningBalance } from '../src/lib/openingBalanceForm'
import { ledgerApi, openingBalanceApi } from '../src/lib/api'

const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const company = id(1), user = id(2), year = id(3), accountA = id(4), accountB = id(5), evidence = id(6), journal = id(7), line = id(8)
type Call = { path: string; method: string; query: URLSearchParams; body: any; init: RequestInit }
let calls: Call[], clients: QueryClient[]
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function Gate({ children }: { children: React.ReactNode }) { return useAuth().status === 'authenticated' ? <>{children}</> : <p>세션 대기</p> }
function mount() {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } } }); clients.push(cache)
    return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/accounting/ledger']}><AuthProvider><Gate><Ledger /></Gate></AuthProvider></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
    calls = []; clients = []
    vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit = {}) => {
        const url = new URL(path, 'https://example.invalid'), call = { path: url.pathname, query: url.searchParams,
            method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : {}, init }; calls.push(call)
        if (call.path === '/api/auth/session') return json({ user: { id: user, email: 'ledger@example.invalid' }, csrfToken: 'csrf-ledger', idleExpiresAt: '2099', absoluteExpiresAt: '2099' })
        if (call.path === '/api/companies') return json({ items: [{ id: company, name: '가상 장부 회사' }], nextCursor: null })
        if (call.path.endsWith('/select')) return json({ company: { id: company, name: '가상 장부 회사', allowSelfApproval: false }, roles: ['COMPANY_ADMIN'], permissions: ['journal.read', 'journal.draft'] })
        if (call.path.endsWith('/fiscal-years')) return json({ items: [{ id: year, startDate: '2026-01-01', endDate: '2026-12-31' }], nextCursor: null })
        if (call.path.endsWith('/opening-balance') && call.method === 'GET') return json({ code: 'NOT_FOUND', message: 'missing', details: [] }, 404)
        if (call.path.endsWith('/ledger/journal-book')) return json({ items: [{ id: line, position: 1, journalId: journal, kind: 'STANDARD', journalNumber: '20260101-000001', fiscalYearId: year, accountingDate: '2026-01-02', postedAt: '2026-01-03T00:00:00.000Z', journalMemo: '가상 매입', lineMemo: null, account: { id: accountA, code: '101', name: '현금' }, debit: '1000', credit: '0', net: '1000', runningBalance: '1000' }], nextCursor: null, totals: { debit: '1000', credit: '0', net: '1000' } })
        if (call.path.endsWith('/accounts')) return json({ items: [{ id: accountA, code: '101', name: '현금', category: 'ASSET', normalBalance: 'DEBIT', active: true, version: 1, canUseInJournal: true }, { id: accountB, code: '201', name: '미지급금', category: 'LIABILITY', normalBalance: 'CREDIT', active: false, version: 2, canUseInJournal: false }], nextCursor: null })
        if (call.path.endsWith(`/ledger/accounts/${accountA}`)) return json({ account: { id: accountA, code: '101', name: '현금', active: true, normalBalance: 'DEBIT' }, openingBalance: '500', openingBalanceStatus: 'POSTED', openingBalanceJournalId: id(9), items: [], nextCursor: null, totals: { debit: '1000', credit: '200', net: '800' }, closingBalance: '1300' })
        if (call.path.endsWith('/evidence')) return json({ items: [], nextCursor: null })
        return json({ code: 'TEST_NOT_FOUND', message: 'not found', details: [] }, 404)
    }))
})
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('기초 잔액 입력 계약', () => {
    it('requires explicit zero confirmation and emits an empty server content', () => {
        expect(normalizeOpeningBalance({ zero: true, zeroConfirmed: false, evidenceIds: [evidence], lines: [] }, null)).toMatchObject({ errors: [{ path: 'zeroConfirmed' }] })
        expect(normalizeOpeningBalance({ zero: true, zeroConfirmed: true, evidenceIds: [evidence], lines: [] }, null)).toEqual({ content: { sourceFiscalYearId: null, evidenceIds: [], lines: [] }, errors: [] })
    })
    it('keeps exact won strings and requires balanced nonzero evidence', () => {
        const valid = normalizeOpeningBalance({ zero: false, zeroConfirmed: false, evidenceIds: [evidence], lines: [
            { accountId: accountA, debit: '9007199254740993', credit: '0', memo: '' },
            { accountId: accountB, debit: '0', credit: '9007199254740993', memo: '이월' },
        ] }, year)
        expect(valid).toEqual({ content: { sourceFiscalYearId: year, evidenceIds: [evidence], lines: [
            { accountId: accountA, debit: '9007199254740993', credit: '0', memo: null },
            { accountId: accountB, debit: '0', credit: '9007199254740993', memo: '이월' },
        ] }, errors: [] })
        expect(normalizeOpeningBalance({ zero: false, zeroConfirmed: false, evidenceIds: [], lines: [
            { accountId: accountA, debit: '1', credit: '0', memo: '' }, { accountId: accountB, debit: '0', credit: '2', memo: '' },
        ] }, null)).toMatchObject({ errors: expect.arrayContaining([{ path: 'evidenceIds', message: expect.any(String) }, { path: 'lines', message: expect.any(String) }]) })
    })
})

describe('원장 API와 화면', () => {
    it('connects six paths with CSRF writes, abortable reads and exact ledger filters', async () => {
        const controller = new AbortController(), create = { creationRequestId: id(20), sourceFiscalYearId: null, evidenceIds: [], lines: [] }
        await openingBalanceApi.get(company, year, controller.signal).catch(() => undefined); await openingBalanceApi.create(company, year, create, 'csrf-ledger').catch(() => undefined)
        await openingBalanceApi.update(company, year, { version: 1, sourceFiscalYearId: null, evidenceIds: [], lines: [] }, 'csrf-ledger').catch(() => undefined)
        await ledgerApi.journalBook(company, { fiscalYearId: year, from: '2026-01-01', to: '2026-12-31', postedThrough: '2026-12-31T23:59:59.000Z', q: '가상', accountId: accountA, limit: 50 }, 'cursor-a', controller.signal)
        await ledgerApi.account(company, accountA, { fiscalYearId: year, from: '2026-01-01', limit: 20 }, 'cursor-b', controller.signal)
        expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
            `GET /api/companies/${company}/fiscal-years/${year}/opening-balance`, `POST /api/companies/${company}/fiscal-years/${year}/opening-balance`,
            `PATCH /api/companies/${company}/fiscal-years/${year}/opening-balance`, `GET /api/companies/${company}/ledger/journal-book`, `GET /api/companies/${company}/ledger/accounts/${accountA}`,
        ])
        expect(calls.filter(call => ['POST', 'PATCH'].includes(call.method)).every(call => (call.init.headers as Record<string, string>)['X-CSRF-Token'] === 'csrf-ledger')).toBe(true)
        expect(Object.fromEntries(calls[3].query)).toMatchObject({ fiscalYearId: year, from: '2026-01-01', to: '2026-12-31', postedThrough: '2026-12-31T23:59:59.000Z', q: '가상', accountId: accountA, limit: '50', cursor: 'cursor-a' })
        expect(calls[0].init.signal).toBe(controller.signal); expect(calls[3].init.signal).toBe(controller.signal)
    })
    it('selects a company and renders opening, journal-book and account-ledger states', async () => {
        mount(); await screen.findByLabelText('장부 회사'); fireEvent.change(screen.getByLabelText('장부 회사'), { target: { value: company } })
        await screen.findByRole('heading', { name: '기초 잔액' }); await screen.findByRole('option', { name: '2026-01-01 ~ 2026-12-31' })
        fireEvent.click(screen.getByRole('tab', { name: '분개장' })); await screen.findByText('차변 1,000원 · 대변 0원 · 순액 1,000원'); expect(screen.getByRole('link', { name: '20260101-000001' })).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: '계정별 원장' })); await screen.findByRole('option', { name: '201 · 미지급금 · 중지' })
        fireEvent.change(screen.getByLabelText('회계연도 (필수)'), { target: { value: year } }); fireEvent.change(screen.getByLabelText('계정 (필수, 중지 포함)'), { target: { value: accountA } }); fireEvent.click(screen.getByRole('button', { name: '원장 조회' }))
        await screen.findByText('기초 잔액 장부 반영'); expect(screen.getByText('1,300원')).toBeTruthy(); expect(screen.getByText('1,000원 / 200원')).toBeTruthy()
        await waitFor(() => expect(calls.some(call => call.path.endsWith(`/ledger/accounts/${accountA}`) && call.query.get('fiscalYearId') === year)).toBe(true))
    })
})
