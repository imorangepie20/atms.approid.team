import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { CompanyRole } from '../../src/lib/api'

const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const company = id(1), user = id(2), year = id(3), account = id(4), journal = id(5), line = id(6)

// [F04 B7] 실제 메뉴·Router·Appearance를 사용하고 원장 서버 응답만 역할별로 대체한다.
async function fixture(page: Page, role: CompanyRole = 'COMPANY_ADMIN') {
    const unexpected: string[] = []
    await page.route('**/api/**', route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname
        let body: unknown, status = 200
        if (path === '/api/auth/session') body = { user: { id: user, email: 'ledger@example.invalid' }, csrfToken: 'a'.repeat(64), idleExpiresAt: '2099', absoluteExpiresAt: '2099' }
        else if (path === '/api/companies') body = { items: [{ id: company, name: '가상 장부 회사' }], nextCursor: null }
        else if (path.endsWith('/select')) body = { company: { id: company, name: '가상 장부 회사', allowSelfApproval: false }, roles: [role], permissions: ['journal.read', ...(['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role) ? ['journal.draft'] : [])] }
        else if (path.endsWith('/fiscal-years')) body = { items: [{ id: year, startDate: '2026-01-01', endDate: '2026-12-31' }], nextCursor: null }
        else if (path.endsWith('/opening-balance')) { status = 404; body = { code: 'NOT_FOUND', message: 'missing', details: [] } }
        else if (path.endsWith('/accounts')) body = { items: [{ id: account, code: '101', name: '현금', category: 'ASSET', normalBalance: 'DEBIT', active: true, version: 1, canUseInJournal: true }], nextCursor: null }
        else if (path.endsWith('/evidence')) body = { items: [], nextCursor: null }
        else if (path.endsWith('/ledger/journal-book')) body = { items: [{ id: line, position: 1, journalId: journal, kind: 'STANDARD', journalNumber: '20260101-000001', fiscalYearId: year, accountingDate: '2026-01-02', postedAt: '2026-01-03T00:00:00.000Z', journalMemo: '가상 분개', lineMemo: null, account: { id: account, code: '101', name: '현금' }, debit: '1000', credit: '0', net: '1000', runningBalance: '1000' }], nextCursor: null, totals: { debit: '1000', credit: '0', net: '1000' } }
        else if (path.endsWith(`/ledger/accounts/${account}`)) body = { account: { id: account, code: '101', name: '현금', active: true, normalBalance: 'DEBIT' }, openingBalance: '500', openingBalanceStatus: 'POSTED', openingBalanceJournalId: id(9), items: [], nextCursor: null, totals: { debit: '1000', credit: '200', net: '800' }, closingBalance: '1300' }
        else { unexpected.push(`${request.method()} ${path}`); status = 404; body = { code: 'UNMOCKED' } }
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    })
    return { unexpected }
}

for (const role of ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as CompanyRole[]) {
    test(`기초 잔액·원장 메뉴와 역할 ${role}`, async ({ page }) => {
        const result = await fixture(page, role); await page.goto('/')
        const link = page.getByRole('link', { name: '기초 잔액·원장', exact: true }); await expect(link).toHaveAttribute('href', '/accounting/ledger')
        await link.click(); await expect(link).toHaveAttribute('aria-current', 'page'); await page.getByLabel('장부 회사').selectOption(company)
        await page.getByRole('tab', { name: '기초 잔액' }).click(); await page.getByLabel('회계연도').selectOption(year)
        await expect(page.getByRole('heading', { name: '기초 잔액', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: '기초 잔액 등록' })).toHaveCount(['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role) ? 1 : 0)
        expect(result.unexpected).toEqual([])
    })
}

test('분개장과 계정별 원장은 POSTED 합계와 기초·이월·기말을 분리한다', async ({ page }) => {
    const result = await fixture(page); await page.goto('/accounting/ledger'); await page.getByLabel('장부 회사').selectOption(company)
    await page.getByRole('tab', { name: '분개장' }).click(); await expect(page.getByText('차변 1,000원 · 대변 0원 · 순액 1,000원')).toBeVisible(); await expect(page.getByText('2026-01-03T00:00:00.000Z')).toBeVisible()
    await page.getByRole('tab', { name: '계정별 원장' }).click(); await page.getByLabel('회계연도 (필수)').selectOption(year); await page.getByLabel('계정 (필수, 중지 포함)').selectOption(account); await page.getByRole('button', { name: '원장 조회' }).click()
    await expect(page.getByText('기초 잔액 장부 반영')).toBeVisible(); await expect(page.getByText('1,300원')).toBeVisible(); expect(result.unexpected).toEqual([])
})

for (const width of [375, 768, 1440]) for (const theme of ['dark', 'light']) {
    test(`원장 화면 ${width}px ${theme} 접근성과 넘침`, async ({ page }) => {
        await page.setViewportSize({ width, height: 960 }); await page.addInitScript(value => localStorage.setItem('atms.appearance.v1', JSON.stringify({ theme: value, accentColor: 'cyan', fontSize: 'medium' })), theme)
        const result = await fixture(page); await page.goto('/accounting/ledger'); await page.getByLabel('장부 회사').selectOption(company); await page.getByRole('tab', { name: '분개장' }).click()
        await expect(page.getByText('20260101-000001')).toBeVisible()
        for (const name of ['기초 잔액', '분개장', '계정별 원장']) { const box = await page.getByRole('tab', { name }).boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44) }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(await page.locator('html').evaluate(node => node.classList.contains('dark'))).toBe(theme === 'dark'); expect(result.unexpected).toEqual([])
        mkdirSync('.artifacts/implementation-f04-ledger-browser', { recursive: true }); await page.screenshot({ path: `.artifacts/implementation-f04-ledger-browser/fixture-${width}-${theme}.png`, fullPage: true })
    })
}
