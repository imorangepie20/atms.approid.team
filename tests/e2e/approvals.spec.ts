import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { CompanyRole } from '../../src/lib/api'

const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const company = id(1), year = id(3), user = id(4), journal = id(5), account = id(6), evidence = id(7)
const submission = { id: id(10), createdById: id(8), createdAt: '2026-10-07T01:00:00.000Z', content: { accountingDate: '2026-10-07', memo: '제출 당시 적요', counterpartyId: null, evidenceIds: [evidence], lines: [{ id: id(9), position: 1, accountId: account, debit: '1000', credit: '0', memo: null }] } }
const entry = { id: journal, number: '2026-1', fiscalYearId: year, accountingDate: '2026-10-07', memo: '가상 승인 적요', currency: 'KRW', status: 'SUBMITTED', version: 2, debitTotal: '1000', creditTotal: '1000', lineCount: 2, evidenceCount: 1, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', createdById: id(8), counterpartyId: null, evidenceIds: [evidence], lines: [] }

// [F05 A7] 실제 앱 메뉴/Router/키보드와 레이아웃을 사용하고 네트워크 응답만 역할별로 대체한다.
async function fixture(page: Page, role: CompanyRole = 'COMPANY_ADMIN', initialStatus: 'SUBMITTED' | 'APPROVED' = 'SUBMITTED') {
    const unexpected: string[] = [], sent: { path: string; body: any }[] = []
    let current = { ...entry, status: initialStatus, version: initialStatus === 'APPROVED' ? 3 : 2 }
    await page.route('**/api/**', route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname
        let body: unknown
        if (path === '/api/auth/session') body = { user: { id: user, email: 'fixture@example.invalid' }, csrfToken: 'a'.repeat(64), idleExpiresAt: '2099-01-01', absoluteExpiresAt: '2099-01-01' }
        else if (path === '/api/companies') body = { items: [{ id: company, name: '가상 승인 회사' }], nextCursor: null }
        else if (path.endsWith('/select')) body = { company: { id: company, name: '가상 승인 회사', allowSelfApproval: false }, roles: [role], permissions: ['journal.read'] }
        else if (path.endsWith('/fiscal-years')) body = { items: [{ id: year, startDate: '2026-01-01', endDate: '2026-12-31' }], nextCursor: null }
        else if (path.endsWith('/journal-approval-requests')) body = { items: url.searchParams.get('status') === current.status ? [current] : [], nextCursor: null }
        else if (path.endsWith('/workflow')) body = { journal: current, allowedActions: ['COMPANY_ADMIN', 'APPROVER'].includes(role) ? current.status === 'SUBMITTED' ? ['APPROVE', 'REJECT'] : current.status === 'APPROVED' ? ['CONFIRM'] : [] : [], history: { items: [{ id: id(11), action: 'SUBMIT', statusBefore: 'DRAFT', statusAfter: 'SUBMITTED', versionBefore: 1, versionAfter: 2, actorId: id(8), reason: null, createdAt: '2026-10-07T01:00:00.000Z', submission }], nextCursor: null } }
        else if (path.endsWith('/journals')) body = { items: [entry], nextCursor: null }
        else if (path.endsWith(`/journals/${journal}`)) body = entry
        else if (path.endsWith(`/evidence/${evidence}`)) body = { evidence: { id: evidence, title: '가상 증빙', originalFileName: 'test.pdf', mediaType: 'application/pdf', active: true } }
        else if (path.endsWith(`/accounts/${account}`)) body = { id: account, code: '101', name: '가상 계정', active: true, canUseInJournal: true }
        else if (request.method() === 'POST' && path.endsWith('/reject')) { sent.push({ path, body: request.postDataJSON() }); body = { id: id(12), status: 'REJECTED', version: 3 } }
        else if (request.method() === 'POST' && path.endsWith('/confirm')) { sent.push({ path, body: request.postDataJSON() }); current = { ...current, status: 'POSTED', version: current.version + 1 }; body = { id: id(13), status: 'POSTED', version: current.version } }
        else { unexpected.push(`${request.method()} ${path}`); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"UNMOCKED"}' }) }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    return { unexpected, sent }
}

test('승인 완료 전표는 명시 확인 뒤 한 번만 장부에 반영한다', async ({ page }) => {
    const result = await fixture(page, 'APPROVER', 'APPROVED')
    await page.goto('/accounting/approvals'); await page.getByLabel('승인 회사').selectOption(company)
    await page.getByLabel('승인 상태').selectOption('APPROVED'); await page.getByRole('button', { name: '조건 적용' }).click()
    await page.getByRole('button', { name: '2026-1 · 가상 승인 적요 상세' }).click(); await page.getByRole('button', { name: '장부 반영' }).click()
    await page.getByRole('button', { name: '장부 반영 확정' }).click(); await expect(page.getByRole('alert')).toBeFocused()
    await page.getByLabel('장부 반영과 원본 불변을 확인합니다').check(); await page.getByRole('button', { name: '장부 반영 확정' }).click()
    await expect(page.getByRole('heading', { name: '2026-1 · 장부 반영' })).toBeVisible()
    expect(result.sent).toHaveLength(1); expect(result.sent[0].path).toMatch(/\/confirm$/); expect(result.sent[0].body.version).toBe(3); expect(result.unexpected).toEqual([])
})

test('초안 상세의 승인 링크에서 이력 화면으로 이동해도 캐시 모양이 충돌하지 않는다', async ({ page }) => {
    const result = await fixture(page)
    await page.goto(`/accounting/journals?companyId=${company}&journalId=${journal}`)
    await expect(page.getByRole('heading', { name: '2026-1 · 승인 요청 상세' })).toBeVisible()
    await page.getByRole('link', { name: '승인 상태와 이력 보기' }).click()
    await expect(page.getByRole('heading', { name: '2026-1 · 승인 대기' })).toBeVisible()
    expect(result.unexpected).toEqual([])
})

for (const role of ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as CompanyRole[]) {
    test(`승인 화면 역할 ${role}`, async ({ page }) => {
        const result = await fixture(page, role)
        await page.goto('/')
        const link = page.getByRole('link', { name: '전표 승인', exact: true })
        await expect(link).toHaveAttribute('href', '/accounting/approvals')
        await link.click(); await expect(link).toHaveAttribute('aria-current', 'page')
        await page.getByLabel('승인 회사').selectOption(company)
        await page.getByRole('button', { name: '2026-1 · 가상 승인 적요 상세' }).click()
        await expect(page.getByRole('heading', { name: '2026-1 · 승인 대기' })).toBeVisible()
        await expect(page.getByRole('button', { name: '승인', exact: true })).toHaveCount(['COMPANY_ADMIN', 'APPROVER'].includes(role) ? 1 : 0)
        expect(result.unexpected).toEqual([])
    })
}

for (const width of [375, 768, 1440]) for (const theme of ['dark', 'light']) {
    test(`승인 화면 ${width}px ${theme} 접근성과 넘침`, async ({ page }) => {
        await page.setViewportSize({ width, height: 960 })
        await page.addInitScript(value => localStorage.setItem('atms.appearance.v1', JSON.stringify({ theme: value, accentColor: 'cyan', fontSize: 'medium' })), theme)
        const result = await fixture(page)
        await page.goto('/accounting/approvals')
        await page.getByLabel('승인 회사').selectOption(company)
        await page.getByRole('button', { name: '2026-1 · 가상 승인 적요 상세' }).click()
        await page.getByRole('button', { name: '반려', exact: true }).click()
        await page.getByRole('button', { name: '반려 확정' }).click()
        await expect(page.getByRole('alert')).toBeFocused()
        await page.getByLabel(/반려 사유/).fill('가상 반려 이유')
        for (const name of ['반려 확정', '취소', '조건 적용']) {
            const box = await page.getByRole('button', { name }).boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await page.locator('html').evaluate(node => node.classList.contains('dark'))).toBe(theme === 'dark')
        expect(result.sent).toEqual([]); expect(result.unexpected).toEqual([])
        mkdirSync('.artifacts/implementation-f05-approval-browser', { recursive: true })
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: `.artifacts/implementation-f05-approval-browser/fixture-${width}-${theme}.png`, fullPage: true })
    })
}
