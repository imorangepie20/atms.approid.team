import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // [F08-09 테스트 준비] 보호된 화면의 외형 회귀 검증은 유효한 서버 세션을 고정한다.
  await page.route('**/api/auth/session', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      user: { id: '20000000-0000-4000-8000-000000000001', email: 'appearance@example.invalid' },
      csrfToken: 'a'.repeat(64),
      idleExpiresAt: '2026-10-06T09:00:00.000Z',
      absoluteExpiresAt: '2026-10-07T08:00:00.000Z',
    }),
  }))
  await page.goto('/settings?section=appearance')
})

test('themes follow device changes and header stays synchronized', async ({ page }) => {
  await page.getByLabel('Light', { exact: true }).locator('..').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: '다크 테마로 변경' }).click()
  await expect(page.getByLabel('Dark', { exact: true })).toBeChecked()
  await page.getByLabel('System', { exact: true }).locator('..').click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByLabel('System', { exact: true })).toBeChecked()
})

test('accent and text size persist after reload and navigation', async ({ page }) => {
  await page.getByLabel('Indigo', { exact: true }).locator('..').click()
  await page.getByLabel('large', { exact: true }).locator('..').click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'indigo')
  await expect(page.locator('html')).toHaveCSS('font-size', '18px')
  await page.reload()
  await expect(page.getByLabel('Indigo', { exact: true })).toBeChecked()
  await expect(page.getByLabel('large', { exact: true })).toBeChecked()
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'indigo')
  await expect(page.locator('h1')).toHaveCSS('font-size', '27px')
})

test('reset restores all defaults', async ({ page }) => {
  await page.getByLabel('Light', { exact: true }).locator('..').click()
  await page.getByLabel('Pink', { exact: true }).locator('..').click()
  await page.getByLabel('small', { exact: true }).locator('..').click()
  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  for (const value of ['Dark', 'Cyan', 'medium']) await expect(page.getByLabel(value, { exact: true })).toBeChecked()
})

test('keyboard and small-screen navigation remain usable', async ({ page }) => {
  await page.getByLabel('Dark', { exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByLabel('System', { exact: true })).toBeChecked()
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByLabel('large', { exact: true }).locator('..').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.getByRole('button', { name: '탐색 메뉴 열기' }).click()
  await expect(page.getByRole('dialog', { name: '탐색 메뉴' }).getByRole('link', { name: '대시보드', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '탐색 메뉴 열기' })).toBeFocused()
  await page.setViewportSize({ width: 812, height: 375 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('desktop submenu is compact while mobile navigation keeps touch-sized links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const desktopLinks = page.locator('aside nav ul ul a')
  await expect(desktopLinks).toHaveCount(6)
  const firstDesktop = await desktopLinks.nth(0).boundingBox(), secondDesktop = await desktopLinks.nth(1).boundingBox()
  expect(firstDesktop?.height).toBe(36)
  expect(secondDesktop && firstDesktop ? secondDesktop.y - firstDesktop.y : 0).toBe(38)

  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('button', { name: '탐색 메뉴 열기' }).click()
  const mobileLinks = page.getByRole('dialog', { name: '탐색 메뉴' }).locator('nav ul ul a')
  await expect(mobileLinks).toHaveCount(6)
  expect((await mobileLinks.first().boundingBox())?.height).toBeGreaterThanOrEqual(44)
})

test('storage denial leaves controls usable and explains persistence', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Denied', 'SecurityError') }
  })
  await page.reload()
  await expect(page.getByRole('status')).toContainText('could not be saved')
  await page.getByLabel('Orange', { exact: true }).locator('..').click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'orange')
})

test('development proxy reaches the database-ready API', async ({ request }) => {
  const response = await request.get('/api/health/ready')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok', database: 'up' })
})
