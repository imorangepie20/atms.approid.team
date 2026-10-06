import { expect, test, type Page } from '@playwright/test'
import type { CompanyRole } from '../../src/lib/api'
const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const company = id(1), year = id(2), account = id(3)
async function fixture(page: Page, role: CompanyRole = 'COMPANY_ADMIN', throughMenu = false) {
    const unexpected: string[] = []
    await page.route('**/api/**', route => {
        const p = new URL(route.request().url()).pathname
        let value: unknown
        if (p === '/api/auth/session') value = { user: { id: id(9), email: 'fixture@example.invalid' }, csrfToken: 'a'.repeat(64), idleExpiresAt: '2099-01-01', absoluteExpiresAt: '2099-01-01' }
        else if (p === '/api/companies') value = { items: [{ id: company, name: '가상 회사' }], nextCursor: null }
        else if (p.endsWith('/select')) value = { company: { id: company, name: '가상 회사' }, roles: [role], permissions: ['journal.read', 'accounts.read', 'counterparties.read', 'evidence.read', ...(['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role) ? ['journal.draft'] : [])] }
        else if (p.endsWith('/fiscal-years')) value = { items: [{ id: year, startDate: '2026-01-01', endDate: '2026-12-31' }], nextCursor: null }
        else if (p.endsWith('/accounts')) value = { items: [{ id: account, code: '101', name: '가상 계정', active: true, canUseInJournal: true }], nextCursor: null }
        else if (p.endsWith('/counterparties') || p.endsWith('/evidence') || p.endsWith('/journals')) value = { items: [], nextCursor: null }
        else { unexpected.push(`${route.request().method()} ${p}`); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"UNMOCKED"}' }) }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })
    })
    // [B1 회귀 보강] 역할별 시험은 메뉴의 실제 링크로 진입해 항목 누락도 검출한다.
    await page.goto(throughMenu ? '/' : '/accounting/journals')
    if (throughMenu) {
        const entry = page.getByRole('link', { name: '전표 초안', exact: true })
        await expect(entry).toHaveAttribute('href', '/accounting/journals')
        await entry.click()
        await expect(page).toHaveURL(/\/accounting\/journals$/)
        await expect(entry).toHaveAttribute('aria-current', 'page')
    }
    return unexpected
}
for (const role of ['COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX'] as CompanyRole[]) {
    test(`K1 current permission ${role}`, async ({ page }) => {
        const unmatched = await fixture(page, role, true)
        await expect(page.getByLabel('전표 회사')).toHaveValue('')
        await page.getByLabel('전표 회사').selectOption(company)
        await expect(page.getByRole('heading', { name: '전표 초안 목록' })).toBeVisible()
        await expect(page.getByRole('button', { name: '새 전표 초안' })).toHaveCount(['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role) ? 1 : 0)
        expect(unmatched).toEqual([])
    })
}
for (const width of [375, 768, 1440]) for (const theme of ['dark', 'light']) {
    test(`K6 keyboard labels/error focus/44px/no overflow ${width} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 960 })
        await page.addInitScript(value => localStorage.setItem('atms.appearance.v1', JSON.stringify({ theme: value, accentColor: 'cyan', fontSize: 'medium' })), theme)
        const unmatched = await fixture(page)
        await page.getByLabel('전표 회사').selectOption(company)
        await page.getByRole('button', { name: '새 전표 초안' }).click()
        await expect(page.getByLabel('회계연도', { exact: true })).toHaveValue('')
        await expect(page.getByLabel('회계일자', { exact: true })).toHaveValue('')
        await expect(page.getByLabel('1행 계정', { exact: true })).toHaveValue('')
        await page.getByRole('button', { name: '초안 저장', exact: true }).click()
        const summary = page.getByRole('alert').filter({ hasText: '전표 입력을 확인해 주세요' })
        await expect(summary).toBeFocused()
        await expect(page.getByText('Invalid UUID', { exact: true })).toHaveCount(0)
        const memoLink = summary.getByRole('link').filter({ hasText: '적요는' })
        await memoLink.focus(); await page.keyboard.press('Enter')
        await expect(page.getByLabel('전표 적요')).toBeFocused()
        await page.keyboard.type('키보드 가상 적요')
        await expect(page.getByLabel('전표 적요')).toHaveValue('키보드 가상 적요')
        for (const name of ['초안 저장', '분개 행 추가', '입력 취소']) {
            const box = await page.getByRole('button', { name, exact: true }).boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await page.locator('html').evaluate(node => node.classList.contains('dark'))).toBe(theme === 'dark')
        expect(unmatched).toEqual([])
        await page.screenshot({ path: `.artifacts/implementation-f04-journal-browser/fixture-${width}-${theme}.png`, fullPage: true })
    })
}
test('K1 route redirects unauthenticated browser', async ({ page }) => {
    await page.route('**/api/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"UNAUTHENTICATED"}' }))
    await page.goto('/accounting/journals'); await expect(page.getByRole('heading', { name: '계정 로그인' })).toBeVisible()
})
