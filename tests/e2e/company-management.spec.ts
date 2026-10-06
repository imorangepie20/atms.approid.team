import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const proof = resolve('.artifacts/implementation-f01-company-browser')
mkdirSync(proof, { recursive: true })
const companyId = '10000000-0000-4000-8000-000000000001'
const secondCompanyId = '10000000-0000-4000-8000-000000000002'
const session = { user: { id: '20000000-0000-4000-8000-000000000001', email: 'browser@example.invalid' }, csrfToken: 'a'.repeat(64), idleExpiresAt: '2026-10-06T09:00:00.000Z', absoluteExpiresAt: '2026-10-07T08:00:00.000Z' }
const rotatedSession = { ...session, csrfToken: 'b'.repeat(64) }
const company = { id: companyId, name: '브라우저 검증 회사', currency: 'KRW', accountingStandard: '일반기업회계기준', allowSelfApproval: false, version: 1 }
const secondCompany = { ...company, id: secondCompanyId, name: '빈 규칙 회사' }
const fiscalYear = { id: '40000000-0000-4000-8000-000000000001', startDate: '2026-01-01', endDate: '2026-12-31' }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockSession(page: Page) {
  await page.route('**/api/auth/session', route => json(route, session))
}

async function mockCompanyReads(page: Page, items = [company, secondCompany]) {
  await page.route('**/api/companies?*', route => json(route, { items, nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/fiscal-years?*`, route => json(route, { items: [fiscalYear], nextCursor: null }))
}

test('selects an accessible company, renames it and adds a fiscal year with increasing versions', async ({ page }) => {
  await mockSession(page)
  await mockCompanyReads(page)
  await page.route(`**/api/companies/${companyId}/select`, route => {
    expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
    return json(route, { company, roles: ['COMPANY_ADMIN'], permissions: ['company.read', 'company.manage'] })
  })
  await page.route(`**/api/companies/${companyId}`, route => {
    expect(route.request().method()).toBe('PATCH')
    expect(route.request().postDataJSON()).toEqual({ name: '수정한 검증 회사', version: 1 })
    return json(route, { ...company, name: '수정한 검증 회사', version: 2 })
  })
  await page.route(`**/api/companies/${companyId}/fiscal-years`, route => {
    expect(route.request().postDataJSON()).toEqual({ startDate: '2027-01-01', endDate: '2027-12-31', version: 2 })
    return json(route, { fiscalYear: { ...fiscalYear, id: '40000000-0000-4000-8000-000000000002', startDate: '2027-01-01', endDate: '2027-12-31' }, company: { ...company, name: '수정한 검증 회사', version: 3 } })
  })

  await page.goto('/companies')
  await page.getByRole('button', { name: /브라우저 검증 회사/ }).click()
  await expect(page.getByText('회사 관리자')).toBeVisible()
  await expect(page.getByText('2026-01-01')).toBeVisible()
  await page.getByLabel('새 회사 이름').fill('수정한 검증 회사')
  await page.getByRole('button', { name: '이름 저장' }).click()
  await expect(page.getByRole('heading', { name: '수정한 검증 회사', exact: true })).toBeVisible()
  await page.getByLabel('시작일', { exact: true }).fill('2027-01-01')
  await page.getByLabel('종료일', { exact: true }).fill('2027-12-31')
  await page.getByRole('button', { name: '기간 추가' }).click()
  await expect(page.getByText('3', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(proof, 'company-desktop.png'), fullPage: true })
})

test('reuses a creation UUID and adopts the rotated CSRF before selecting the new company', async ({ page }) => {
  let created = false
  await mockSession(page)
  await page.route('**/api/companies?*', route => json(route, { items: created ? [company] : [], nextCursor: null }))
  await page.route('**/api/companies', route => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postDataJSON() as Record<string, string>
    expect(body.creationRequestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body).toMatchObject({ name: '새 검증 회사', startDate: '2026-01-01', endDate: '2026-12-31' })
    expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
    created = true
    return json(route, { company: { ...company, name: '새 검증 회사' }, created: true, session: rotatedSession })
  })
  await page.route('**/api/auth/reauthenticate', route => {
    expect(route.request().postDataJSON()).toEqual({ password: 'Browser verification 2026!' })
    expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
    return json(route, { success: true })
  })
  await page.route(`**/api/companies/${companyId}/select`, route => {
    expect(route.request().headers()['x-csrf-token']).toBe(rotatedSession.csrfToken)
    return json(route, { company: { ...company, name: '새 검증 회사' }, roles: ['COMPANY_ADMIN'], permissions: ['company.read', 'company.manage'] })
  })
  await page.route(`**/api/companies/${companyId}/fiscal-years?*`, route => json(route, { items: [fiscalYear], nextCursor: null }))

  await page.goto('/companies')
  await expect(page.getByText('접근 가능한 회사가 없습니다')).toBeVisible()
  // [F01 자동완성 회귀] 저장된 로그인 자격증명이 회사명/재인증 입력에 주입되지 않도록 초기값과 목적을 고정한다.
  await expect(page.getByLabel('회사 이름')).toHaveValue('')
  await expect(page.getByLabel('첫 회계연도 시작일')).toHaveValue('')
  await expect(page.getByLabel('첫 회계연도 종료일')).toHaveValue('')
  await expect(page.getByLabel('회사 등록용 현재 비밀번호')).toHaveValue('')
  await expect(page.getByLabel('회사 이름')).toHaveAttribute('name', 'companyName')
  await expect(page.getByLabel('회사 이름')).toHaveAttribute('autocomplete', 'off')
  await expect(page.getByLabel('첫 회계연도 시작일')).toHaveAttribute('autocomplete', 'off')
  await expect(page.getByLabel('첫 회계연도 종료일')).toHaveAttribute('autocomplete', 'off')
  await expect(page.getByLabel('회사 등록용 현재 비밀번호')).toHaveAttribute('name', 'companyCreationPassword')
  await expect(page.getByLabel('회사 등록용 현재 비밀번호')).toHaveAttribute('autocomplete', 'new-password')
  await page.getByLabel('회사 이름').fill('새 검증 회사')
  await page.getByLabel('첫 회계연도 시작일').fill('2026-01-01')
  await page.getByLabel('첫 회계연도 종료일').fill('2026-12-31')
  await page.getByLabel('회사 등록용 현재 비밀번호').fill('Browser verification 2026!')
  await page.getByRole('button', { name: '회사 등록' }).click()
  await expect(page.getByRole('heading', { name: '새 검증 회사', exact: true })).toBeVisible()
  await expect(page.getByText('회사 관리자')).toBeVisible()
})

test('keeps the current session when password reauthentication fails', async ({ page }) => {
  await mockSession(page)
  await page.route('**/api/companies?*', route => json(route, { items: [], nextCursor: null }))
  await page.route('**/api/auth/reauthenticate', route => json(route, { code: 'UNAUTHORIZED', details: [] }, 401))
  await page.goto('/companies')
  await page.getByLabel('회사 이름', { exact: true }).fill('재확인 실패 회사')
  await page.getByLabel('첫 회계연도 시작일').fill('2026-01-01')
  await page.getByLabel('첫 회계연도 종료일').fill('2026-12-31')
  await page.getByLabel('회사 등록용 현재 비밀번호').fill('wrong password')
  await page.getByRole('button', { name: '회사 등록' }).click()
  await expect(page).toHaveURL(/\/companies$/)
  await expect(page.getByRole('alert')).toContainText('비밀번호를 확인하지 못했습니다')
  await expect(page.getByLabel('회사 등록용 현재 비밀번호')).toHaveValue('')
})

test('reloads the latest company after stale rename and reports overlapping periods', async ({ page }) => {
  const latest = { ...company, name: '다른 사용자가 수정한 회사', version: 2 }
  await mockSession(page)
  await mockCompanyReads(page, [latest])
  await page.route(`**/api/companies/${companyId}/select`, route => json(route, { company, roles: ['COMPANY_ADMIN'], permissions: ['company.read', 'company.manage'] }))
  await page.route(`**/api/companies/${companyId}`, route => route.request().method() === 'GET' ? json(route, latest) : json(route, { code: 'CONFLICT', details: [] }, 409))
  await page.route(`**/api/companies/${companyId}/fiscal-years`, route => json(route, { code: 'CONFLICT', details: [] }, 409))

  await page.goto('/companies')
  await page.getByRole('button', { name: /다른 사용자가 수정한 회사/ }).click()
  await page.getByLabel('새 회사 이름').fill('내가 수정한 이름')
  await page.getByRole('button', { name: '이름 저장' }).click()
  await expect(page.getByRole('alert')).toContainText('최신 회사 정보를 반영')
  await expect(page.getByLabel('새 회사 이름')).toHaveValue('다른 사용자가 수정한 회사')
  await page.getByLabel('시작일', { exact: true }).fill('2026-06-01')
  await page.getByLabel('종료일', { exact: true }).fill('2026-12-31')
  await page.getByRole('button', { name: '기간 추가' }).click()
  await expect(page.getByRole('alert')).toContainText('기존 회계연도와 겹칩니다')
})

test('shows retry, permission denial and session expiry states', async ({ page }) => {
  let allowList = false
  await mockSession(page)
  await page.route('**/api/companies?*', route => {
    return allowList ? json(route, { items: [company], nextCursor: null }) : json(route, { code: 'SERVICE_UNAVAILABLE', details: [] }, 503)
  })
  await page.route(`**/api/companies/${companyId}/select`, route => json(route, { code: 'FORBIDDEN', details: [] }, 403))
  await page.goto('/companies')
  await expect(page.getByRole('alert')).toContainText('회사 목록을 불러오지 못했습니다')
  allowList = true
  await page.getByRole('button', { name: '다시 시도' }).click()
  await page.getByRole('button', { name: /브라우저 검증 회사/ }).click()
  await expect(page.getByRole('alert')).toContainText('권한이 없습니다')

  await page.unroute(`**/api/companies/${companyId}/select`)
  await page.route(`**/api/companies/${companyId}/select`, route => json(route, { code: 'UNAUTHORIZED', details: [] }, 401))
  await page.getByRole('button', { name: /브라우저 검증 회사/ }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('keeps company management usable without horizontal overflow at 375px and 768px', async ({ page }) => {
  await mockSession(page)
  await mockCompanyReads(page)
  await page.route(`**/api/companies/${companyId}/select`, route => json(route, { company, roles: ['READ_ONLY'], permissions: ['company.read'] }))
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/companies')
  await page.getByRole('button', { name: /브라우저 검증 회사/ }).click()
  await expect(page.getByText('조회 권한으로 접속했습니다')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(proof, 'company-mobile-375.png'), fullPage: true })
  await page.setViewportSize({ width: 768, height: 1024 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(proof, 'company-tablet-768.png'), fullPage: true })
})
