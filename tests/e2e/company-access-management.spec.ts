import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const proof = resolve('.artifacts/implementation-f01-company-access-browser')
mkdirSync(proof, { recursive: true })
const companyId = '10000000-0000-4000-8000-000000000011'
const invitationId = '40000000-0000-4000-8000-000000000011'
const secondInvitationId = '40000000-0000-4000-8000-000000000012'
const requestId = '50000000-0000-4000-8000-000000000011'
const secondRequestId = '50000000-0000-4000-8000-000000000012'
const userId = '20000000-0000-4000-8000-000000000011'
const session = { user: { id: userId, email: 'access-admin@example.invalid' }, csrfToken: 'c'.repeat(64), idleExpiresAt: '2026-10-06T09:00:00.000Z', absoluteExpiresAt: '2026-10-07T08:00:00.000Z' }
const company = { id: companyId, name: '접근 관리 검증 회사', currency: 'KRW', accountingStandard: 'K_GAAP', allowSelfApproval: false, version: 1 }
const invitation = { id: invitationId, companyId, email: 'invitee@example.invalid', roles: ['READ_ONLY'], issuerId: userId, status: 'PENDING', version: 1, expiresAt: '2026-10-13T00:00:00.000Z' }
const accessRequest = { id: requestId, companyId, requesterId: '20000000-0000-4000-8000-000000000012', status: 'PENDING', version: 1, expiresAt: '2026-10-13T00:00:00.000Z', requester: { id: '20000000-0000-4000-8000-000000000012', email: 'tax@example.invalid', emailVerified: true, disabled: false } }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockShell(page: Page, permissions = ['company.read', 'company.manage', 'company.members.manage']) {
  await page.route('**/api/auth/session', route => json(route, session))
  await page.route('**/api/companies?*', route => json(route, { items: [company], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/fiscal-years?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/members?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/select`, route => json(route, {
    company,
    roles: permissions.includes('company.members.manage') ? ['COMPANY_ADMIN'] : ['READ_ONLY'],
    permissions,
  }))
}

async function selectCompany(page: Page) {
  await page.goto('/companies')
  await page.getByRole('button', { name: /접근 관리 검증 회사/ }).click()
  await expect(page.getByRole('heading', { name: '초대·접근 요청', exact: true })).toBeVisible()
}

function invitationRow(page: Page, email = invitation.email) {
  return page.getByRole('listitem').filter({ hasText: email })
}

function requestRow(page: Page, email = accessRequest.requester.email) {
  return page.getByRole('listitem').filter({ hasText: email })
}

test('creates an invitation with the complete role set after reauthentication and clears the password', async ({ page }) => {
  let rows = [invitation]
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => json(route, { items: rows, nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route('**/api/auth/reauthenticate', route => {
    expect(route.request().postDataJSON()).toEqual({ password: 'Access verification 2026!' })
    return json(route, { success: true })
  })
  await page.route(`**/api/companies/${companyId}/invitations`, route => {
    expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
    expect(route.request().postDataJSON()).toEqual({ email: 'new@example.invalid', roles: ['ACCOUNTANT', 'READ_ONLY'] })
    const created = { ...invitation, id: secondInvitationId, email: 'new@example.invalid', roles: ['ACCOUNTANT', 'READ_ONLY'] }
    rows = [invitation, created]
    return json(route, { invitation: created, accepted: true })
  })

  await selectCompany(page)
  await page.getByLabel('초대 이메일').fill('new@example.invalid')
  await page.getByLabel('회계 담당자').check()
  await page.getByLabel('초대 생성용 현재 비밀번호').fill('Access verification 2026!')
  await page.getByRole('button', { name: '초대 보내기' }).click()
  await expect(page.getByLabel('초대 생성용 현재 비밀번호')).toHaveValue('')
  await expect(page.getByRole('status', { name: '접근 관리 작업 결과' })).toContainText('회사 초대를 만들었습니다')
  await expect(invitationRow(page, 'new@example.invalid')).toContainText('회계 담당자')
})

test('loads invitation cursors and performs resend then cancel with the displayed version', async ({ page }) => {
  let current = invitation
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    if (cursor) return json(route, { items: [{ ...invitation, id: secondInvitationId, email: 'older@example.invalid', status: 'CANCELLED', version: 2 }], nextCursor: null })
    return json(route, { items: [current], nextCursor: invitationId })
  })
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
  await page.route(`**/api/companies/${companyId}/invitations/${invitationId}/resend`, route => {
    expect(route.request().postDataJSON()).toEqual({ version: 1 })
    current = { ...invitation, version: 2 }
    return json(route, { invitation: current, accepted: true })
  })
  await page.route(`**/api/companies/${companyId}/invitations/${invitationId}/cancel`, route => {
    expect(route.request().postDataJSON()).toEqual({ version: 2 })
    current = { ...invitation, status: 'CANCELLED', version: 3 }
    return json(route, { invitation: current, accepted: true })
  })

  await selectCompany(page)
  await page.getByRole('button', { name: '초대 더 보기' }).click()
  await expect(invitationRow(page, 'older@example.invalid')).toContainText('취소')
  await invitationRow(page).getByRole('button', { name: '재발송' }).click()
  await page.getByLabel('초대 재발송용 현재 비밀번호').fill('Access verification 2026!')
  await page.getByRole('button', { name: '초대 재발송 실행' }).click()
  await expect(invitationRow(page)).toContainText('초대 버전 2')
  await invitationRow(page).getByRole('button', { name: '초대 취소' }).click()
  await page.getByLabel('초대 취소용 현재 비밀번호').fill('Access verification 2026!')
  await page.getByRole('button', { name: '초대 취소 실행' }).click()
  await expect(invitationRow(page)).toContainText('취소')
  await expect(invitationRow(page)).toContainText('초대 버전 3')
})

test('keeps the session and clears the password when invitation reauthentication fails', async ({ page }) => {
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => json(route, { items: [invitation], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route('**/api/auth/reauthenticate', route => json(route, { code: 'UNAUTHORIZED', details: [] }, 401))

  await selectCompany(page)
  await invitationRow(page).getByRole('button', { name: '초대 취소' }).click()
  await page.getByLabel('초대 취소용 현재 비밀번호').fill('wrong password')
  await page.getByRole('button', { name: '초대 취소 실행' }).click()
  await expect(page).toHaveURL(/\/companies$/)
  await expect(page.getByRole('alert')).toContainText('비밀번호를 확인하지 못했습니다')
  await expect(page.getByLabel('초대 취소용 현재 비밀번호')).toHaveValue('')
})

test('closes a stale confirmation and reloads the latest invitation after a 409 conflict', async ({ page }) => {
  let current = invitation
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => json(route, { items: [current], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
  await page.route(`**/api/companies/${companyId}/invitations/${invitationId}/resend`, route => {
    current = { ...invitation, status: 'CANCELLED', version: 2 }
    return json(route, { code: 'CONFLICT', details: [] }, 409)
  })

  await selectCompany(page)
  await invitationRow(page).getByRole('button', { name: '재발송' }).click()
  await page.getByLabel('초대 재발송용 현재 비밀번호').fill('Access verification 2026!')
  await page.getByRole('button', { name: '초대 재발송 실행' }).click()
  await expect(page.getByRole('alert')).toContainText('대상 상태가 바뀌었습니다')
  await expect(page.getByRole('button', { name: '초대 재발송 실행' })).toHaveCount(0)
  await expect(invitationRow(page)).toContainText('취소')
  await expect(invitationRow(page)).toContainText('초대 버전 2')
})

test('approves and rejects access requests after reauthentication and refreshes members', async ({ page }) => {
  const rejected = { ...accessRequest, id: secondRequestId, requesterId: '20000000-0000-4000-8000-000000000013', requester: { ...accessRequest.requester, id: '20000000-0000-4000-8000-000000000013', email: 'reject@example.invalid' } }
  let requests = [accessRequest, rejected]
  let memberReads = 0
  await mockShell(page)
  await page.unroute(`**/api/companies/${companyId}/members?*`)
  await page.route(`**/api/companies/${companyId}/members?*`, route => { memberReads += 1; return json(route, { items: [], nextCursor: null }) })
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => json(route, { items: requests, nextCursor: null }))
  await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
  await page.route(`**/api/companies/${companyId}/access-requests/${requestId}/approve`, route => {
    expect(route.request().postDataJSON()).toEqual({ version: 1 })
    requests = [{ ...accessRequest, status: 'APPROVED', version: 2 }, rejected]
    return json(route, { accessRequest: requests[0] })
  })
  await page.route(`**/api/companies/${companyId}/access-requests/${secondRequestId}/reject`, route => {
    expect(route.request().postDataJSON()).toEqual({ version: 1 })
    requests = [requests[0], { ...rejected, status: 'REJECTED', version: 2 }]
    return json(route, { accessRequest: requests[1] })
  })

  await selectCompany(page)
  await page.getByRole('tab', { name: '세무사 접근 요청' }).click()
  await requestRow(page).getByRole('button', { name: '승인' }).click()
  await page.getByLabel('접근 요청 승인용 현재 비밀번호').fill('Access verification 2026!')
  await page.getByRole('button', { name: '접근 요청 승인 실행' }).click()
  await expect(requestRow(page)).toContainText('승인')
  await requestRow(page, 'reject@example.invalid').getByRole('button', { name: '반려' }).click()
  await page.getByLabel('접근 요청 반려용 현재 비밀번호').fill('Access verification 2026!')
  await page.getByRole('button', { name: '접근 요청 반려 실행' }).click()
  await expect(requestRow(page, 'reject@example.invalid')).toContainText('반려')
  expect(memberReads).toBeGreaterThanOrEqual(2)
})

test('shows retryable list and rate-limit errors without exposing a password', async ({ page }) => {
  let available = false
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => available
    ? json(route, { items: [invitation], nextCursor: null })
    : json(route, { code: 'SERVICE_UNAVAILABLE', details: [] }, 503))
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
  await page.route(`**/api/companies/${companyId}/invitations`, route => json(route, { code: 'TOO_MANY_REQUESTS', details: [] }, 429))

  await selectCompany(page)
  await expect(page.getByRole('alert')).toContainText('접근 관리 서비스를 사용할 수 없습니다')
  available = true
  await page.getByRole('alert').getByRole('button', { name: '다시 시도' }).click()
  await expect(invitationRow(page)).toBeVisible()
  await page.getByLabel('초대 이메일').fill('limited@example.invalid')
  await page.getByLabel('초대 생성용 현재 비밀번호').fill('password-that-must-disappear')
  await page.getByRole('button', { name: '초대 보내기' }).click()
  await expect(page.getByRole('alert')).toContainText('요청 횟수가 너무 많습니다')
  await expect(page.getByLabel('초대 생성용 현재 비밀번호')).toHaveValue('')
  await expect(page.locator('body')).not.toContainText('password-that-must-disappear')
})

test('does not call invitation or request APIs for a read-only user', async ({ page }) => {
  let accessCalls = 0
  await mockShell(page, ['company.read'])
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => { accessCalls += 1; return json(route, { items: [], nextCursor: null }) })
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => { accessCalls += 1; return json(route, { items: [], nextCursor: null }) })

  await page.goto('/companies')
  await page.getByRole('button', { name: /접근 관리 검증 회사/ }).click()
  await expect(page.getByText('현재 권한으로는 구성원 정보를 요청하지 않습니다')).toBeVisible()
  await expect(page.getByRole('heading', { name: '초대·접근 요청', exact: true })).toHaveCount(0)
  expect(accessCalls).toBe(0)
})

test('supports tab keyboard focus and has no horizontal overflow at 375, 768, and 1440 pixels', async ({ page }) => {
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => json(route, { items: [invitation], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => json(route, { items: [accessRequest], nextCursor: null }))
  await page.setViewportSize({ width: 375, height: 812 })
  await selectCompany(page)
  const invitationTab = page.getByRole('tab', { name: '초대', exact: true })
  await invitationTab.focus()
  await expect(invitationTab).toBeFocused()
  await page.getByRole('tab', { name: '세무사 접근 요청' }).click()
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'access-tab-requests')
  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: resolve(proof, `company-access-${viewport.width}.png`), fullPage: true })
  }
})
