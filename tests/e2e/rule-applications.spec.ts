import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const proof = resolve('.artifacts/implementation-f08-accounting-browser')
mkdirSync(proof, { recursive: true })
const companyId = '10000000-0000-4000-8000-000000000001'
const session = { user: { id: '20000000-0000-4000-8000-000000000001', email: 'browser@example.invalid' }, csrfToken: 'a'.repeat(64),
  idleExpiresAt: '2026-10-06T09:00:00.000Z', absoluteExpiresAt: '2026-10-07T08:00:00.000Z' }
const companies = { items: [{ id: companyId, name: '브라우저 검증 회사', currency: 'KRW', accountingStandard: '일반기업회계기준', allowSelfApproval: false, version: 1 }], nextCursor: null }

const application = (id: string, domain: 'ACCOUNTING' | 'TAX', name: string, code: string) => ({
  id, effectiveFrom: '2026-01-01', effectiveTo: null,
  rule: { id: `${id.slice(0, -1)}a`, domain, jurisdiction: 'KR', code, name },
  version: { id: `${id.slice(0, -1)}b`, version: 'verify-1', officialSourceTitle: '브라우저 검증용 근거',
    officialSourceUrl: 'https://example.invalid/verification', legalProvision: '검증용 조항', promulgatedOn: '2025-12-01',
    effectiveFrom: '2026-01-01', effectiveTo: null, applicableFrom: '2026-01-01', applicableTo: null,
    companyConditions: {}, transitionalProvisions: {}, artifacts: [{ id: `${id.slice(0, -1)}c`, kind: 'CONFIG', version: 'verify-1',
      repositoryLocator: 'repo://verification/config@verify-1', contentSha256: '1'.repeat(64), metadata: {} }] },
})
const accounting = application('30000000-0000-4000-8000-000000000001', 'ACCOUNTING', '검증 회계 규칙', 'VERIFY_ACCOUNTING')
const tax = application('30000000-0000-4000-8000-000000000002', 'TAX', '검증 세무 규칙', 'VERIFY_TAX')

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockAuthenticated(page: Page, ruleHandler?: (route: Route) => Promise<void>) {
  await page.route('**/api/auth/session', route => fulfillJson(route, session))
  await page.route('**/api/companies?*', route => fulfillJson(route, companies))
  await page.route(`**/api/companies/${companyId}/rule-applications?*`, ruleHandler ?? (route => fulfillJson(route, { items: [accounting, tax], nextCursor: null })))
}

test('logs in through the real UI contract and returns to the requested rule page', async ({ page }) => {
  let loggedIn = false
  await page.route('**/api/auth/session', route => fulfillJson(route, loggedIn ? session : { code: 'UNAUTHORIZED', message: '인증이 필요합니다.', details: [] }, loggedIn ? 200 : 401))
  await page.route('**/api/auth/login', async route => {
    expect(route.request().postDataJSON()).toEqual({ email: 'browser@example.invalid', password: 'Browser verification 2026!' })
    loggedIn = true
    await fulfillJson(route, session)
  })
  await page.route('**/api/companies?*', route => fulfillJson(route, companies))
  await page.route(`**/api/companies/${companyId}/rule-applications?*`, route => fulfillJson(route, { items: [accounting], nextCursor: null }))
  await page.goto('/accounting/rules')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('이메일').fill('browser@example.invalid')
  await page.getByLabel('비밀번호', { exact: true }).fill('Browser verification 2026!')
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page).toHaveURL(/\/accounting\/rules$/)
  await expect(page.getByRole('heading', { name: '규칙 적용 현황', exact: true })).toBeVisible()
})

test('announces loading while the accessible company list is pending', async ({ page }) => {
  let releaseCompanies: () => void = () => undefined
  const companyGate = new Promise<void>(resolve => { releaseCompanies = resolve })
  await page.route('**/api/auth/session', route => fulfillJson(route, session))
  await page.route('**/api/companies?*', async route => {
    await companyGate
    await fulfillJson(route, companies)
  })
  await page.route(`**/api/companies/${companyId}/rule-applications?*`, route => fulfillJson(route, { items: [accounting, tax], nextCursor: null }))

  await page.goto('/accounting/rules')
  await expect(page.getByRole('status')).toContainText('회사 목록을 불러오는 중입니다')
  releaseCompanies()
  await expect(page.getByRole('heading', { name: '규칙 적용 현황', exact: true })).toBeVisible()
})

test('filters, expands and paginates the desktop rule table with accessible controls', async ({ page }) => {
  await mockAuthenticated(page, async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    await fulfillJson(route, cursor ? { items: [tax], nextCursor: null } : { items: [accounting, tax], nextCursor: tax.id })
  })
  await page.goto('/accounting/rules')
  await expect(page.getByText('검증 회계 규칙').first()).toBeVisible()
  await page.getByLabel('구분').selectOption('ACCOUNTING')
  await expect(page.getByText('검증 세무 규칙')).toHaveCount(0)
  await page.getByLabel('구분').selectOption('ALL')
  await page.getByLabel('현재 페이지 검색').fill('세무')
  await expect(page.getByText('검증 세무 규칙').first()).toBeVisible()
  await page.getByLabel('현재 페이지 검색').clear()
  await page.getByRole('button', { name: '검증 회계 규칙 상세 열기' }).click()
  await expect(page.getByText('검증용 조항').first()).toBeVisible()
  await page.screenshot({ path: resolve(proof, 'rules-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.getByText('2페이지')).toBeVisible()
  await page.getByRole('button', { name: '이전', exact: true }).click()
  await expect(page.getByText('1페이지')).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
})

test('shows useful empty and retry states', async ({ page }) => {
  let attempts = 0
  await mockAuthenticated(page, async route => {
    attempts += 1
    if (attempts === 1) await fulfillJson(route, { code: 'SERVICE_UNAVAILABLE', message: '요청을 처리할 수 없습니다.', details: [] }, 503)
    else await fulfillJson(route, { items: [], nextCursor: null })
  })
  await page.goto('/accounting/rules')
  await expect(page.getByRole('alert')).toContainText('불러오지 못했습니다')
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('적용된 규칙이 없습니다')).toBeVisible()
  await page.screenshot({ path: resolve(proof, 'rules-empty.png'), fullPage: true })
})

test('uses cards at 375px and 768px without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockAuthenticated(page)
  await page.goto('/accounting/rules')
  await expect(page.getByRole('article').first()).toBeVisible()
  await expect(page.locator('table')).toBeHidden()
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(width.scroll).toBeLessThanOrEqual(width.client)
  await page.screenshot({ path: resolve(proof, 'rules-mobile-375.png'), fullPage: true })

  await page.setViewportSize({ width: 768, height: 1024 })
  await expect(page.getByRole('article').first()).toBeVisible()
  await expect(page.locator('table')).toBeHidden()
  const tabletWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(tabletWidth.scroll).toBeLessThanOrEqual(tabletWidth.client)
  await page.screenshot({ path: resolve(proof, 'rules-tablet-768.png'), fullPage: true })
})

test('returns to login when an authenticated session expires', async ({ page }) => {
  await page.route('**/api/auth/session', route => fulfillJson(route, session))
  await page.route('**/api/companies?*', route => fulfillJson(route, companies))
  await page.route(`**/api/companies/${companyId}/rule-applications?*`, route =>
    fulfillJson(route, { code: 'UNAUTHORIZED', message: 'Session expired.', details: [] }, 401))

  await page.goto('/accounting/rules')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('main')).toBeVisible()
})
