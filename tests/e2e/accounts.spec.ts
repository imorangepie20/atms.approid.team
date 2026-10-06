import { expect, test, type Page } from '@playwright/test'
import type { AccountView, CompanyRole } from '../../src/lib/api'

// [F04 K1/K3/K7] 모든 API를 fixture로 가로챈 시험이다. 실제 배포 자료 시험과 별도 집계한다.
const companyId = '10000000-0000-4000-8000-000000000001'
const row: AccountView = { id: '50000000-0000-4000-8000-000000000001', code: '101', name: '가상 계정', category: 'ASSET', normalBalance: 'DEBIT', active: true, version: 1, canUseInJournal: true }
async function fixture(page: Page, role: CompanyRole = 'COMPANY_ADMIN') {
    await page.route('**/api/**', route => {
        const url = new URL(route.request().url())
        let body: unknown
        if (url.pathname === '/api/auth/session') body = { user: { id: 'fixture-user', email: 'fixture@example.invalid' }, csrfToken: 'a'.repeat(64), idleExpiresAt: '2099-01-01', absoluteExpiresAt: '2099-01-01' }
        else if (url.pathname === '/api/companies') body = { items: [{ id: companyId, name: '가상 회사' }], nextCursor: null }
        else if (url.pathname.endsWith('/select')) body = { company: { id: companyId, name: '가상 회사' }, roles: [role], permissions: ['accounts.read', ...(role === 'COMPANY_ADMIN' ? ['accounts.manage'] : [])] }
        else if (url.pathname.endsWith('/accounts')) body = { items: [row], nextCursor: null }
        else if (url.pathname.endsWith(row.id)) body = row
        else return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"UNMOCKED"}' })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.goto('/accounting/accounts')
}
for (const role of ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as CompanyRole[]) {
    test(`current role ${role} determines account management`, async ({ page }) => {
        await fixture(page, role); await expect(page.getByLabel('관리할 회사')).toHaveValue('')
        await page.getByLabel('관리할 회사').selectOption(companyId)
        await page.getByRole('button', { name: '101 · 가상 계정 상세' }).filter({ visible: true }).click()
        await expect(page.getByRole('button', { name: '계정 수정', exact: true })).toHaveCount(role === 'COMPANY_ADMIN' ? 1 : 0)
    })
}
for (const width of [375, 768, 1440]) {
    test(`account form and keyboard at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 960 }); await fixture(page)
        await page.getByLabel('관리할 회사').selectOption(companyId)
        await page.getByRole('button', { name: '새 계정 등록' }).click()
        await page.getByRole('button', { name: '계정 등록', exact: true }).click()
        await expect(page.getByRole('alert').filter({ hasText: '입력을 확인해 주세요' })).toBeFocused()
        await expect(page.getByLabel('계정 분류')).toHaveValue(''); await expect(page.getByLabel('정상 잔액 방향')).toHaveValue('')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `.artifacts/implementation-f04-accounts-browser/fixture-${width}.png`, fullPage: true })
    })
}
test('protected route requires a session', async ({ page }) => {
    await page.route('**/api/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"UNAUTHENTICATED"}' }))
    await page.goto('/accounting/accounts'); await expect(page.getByRole('heading', { name: '계정 로그인' })).toBeVisible()
})
