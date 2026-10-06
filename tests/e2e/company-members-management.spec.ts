import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const proof = resolve('.artifacts/implementation-f01-company-members-browser')
mkdirSync(proof, { recursive: true })
const companyId = '10000000-0000-4000-8000-000000000001'
const ownMembershipId = '30000000-0000-4000-8000-000000000001'
const memberId = '30000000-0000-4000-8000-000000000002'
const thirdMemberId = '30000000-0000-4000-8000-000000000003'
const userId = '20000000-0000-4000-8000-000000000001'
const memberUserId = '20000000-0000-4000-8000-000000000002'
const session = { user: { id: userId, email: 'admin@example.invalid' }, csrfToken: 'a'.repeat(64), idleExpiresAt: '2026-10-06T09:00:00.000Z', absoluteExpiresAt: '2026-10-07T08:00:00.000Z' }
const rotatedSession = { ...session, csrfToken: 'b'.repeat(64) }
const company = { id: companyId, name: '구성원 검증 회사', currency: 'KRW', accountingStandard: 'K_GAAP', allowSelfApproval: false, version: 1 }
const ownMember = { id: ownMembershipId, companyId, active: true, version: 1, roles: ['COMPANY_ADMIN'], user: { id: userId, email: session.user.email, emailVerified: true, disabled: false } }
const otherMember = { id: memberId, companyId, active: true, version: 1, roles: ['READ_ONLY'], user: { id: memberUserId, email: 'member@example.invalid', emailVerified: true, disabled: false } }
const inactiveMember = { id: thirdMemberId, companyId, active: false, version: 2, roles: ['ACCOUNTANT'], user: { id: '20000000-0000-4000-8000-000000000003', email: 'inactive@example.invalid', emailVerified: true, disabled: false } }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockShell(page: Page, permissions = ['company.read', 'company.manage', 'company.members.manage']) {
  await page.route('**/api/auth/session', route => json(route, session))
  await page.route('**/api/companies?*', route => json(route, { items: [company], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/fiscal-years?*`, route => json(route, { items: [], nextCursor: null }))
  // 구성원 관리 검증은 새 접근 관리 영역의 병렬 조회와 독립적이어야 한다.
  await page.route(`**/api/companies/${companyId}/invitations?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/access-requests?*`, route => json(route, { items: [], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/select`, route => json(route, { company, roles: permissions.includes('company.members.manage') ? ['COMPANY_ADMIN'] : ['READ_ONLY'], permissions }))
}

async function selectCompany(page: Page) {
  await page.goto('/companies')
  await page.getByRole('button', { name: /구성원 검증 회사/ }).click()
}

function row(page: Page, email: string) {
  return page.getByRole('listitem').filter({ hasText: email })
}

function memberRoles(page: Page) {
  return page.getByRole('group', { name: '부여할 역할 — 1개 이상 선택' })
}

test('lists paged members and changes the complete role set after password reauthentication', async ({ page }) => {
  let roles = ['READ_ONLY']
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/members?*`, route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    return cursor ? json(route, { items: [inactiveMember], nextCursor: null })
      : json(route, { items: [ownMember, { ...otherMember, roles }], nextCursor: memberId })
  })
  await page.route(`**/api/companies/${companyId}/members/${memberId}`, route => json(route, { ...otherMember, roles }))
  await page.route('**/api/auth/reauthenticate', route => {
    expect(route.request().postDataJSON()).toEqual({ password: 'Member verification 2026!' })
    return json(route, { success: true })
  })
  await page.route(`**/api/companies/${companyId}/members/${memberId}/roles`, route => {
    expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
    expect(route.request().postDataJSON()).toEqual({ roles: ['ACCOUNTANT', 'READ_ONLY'], version: 1 })
    roles = ['ACCOUNTANT', 'READ_ONLY']
    return json(route, { member: { ...otherMember, roles, version: 2 }, session: null })
  })

  await selectCompany(page)
  await expect(row(page, 'member@example.invalid')).toContainText('조회 전용')
  await row(page, 'member@example.invalid').getByRole('button', { name: '역할·소속 관리' }).click()
  await memberRoles(page).getByLabel('회계 담당자').check()
  await page.getByLabel('구성원 관리용 현재 비밀번호').fill('Member verification 2026!')
  await page.getByRole('button', { name: '역할 저장' }).click()
  await expect(page.getByRole('status', { name: '구성원 작업 결과' })).toContainText('구성원 역할을 저장했습니다')
  await expect(row(page, 'member@example.invalid')).toContainText('회계 담당자')
  await page.getByRole('button', { name: '구성원 더 보기' }).click()
  await expect(row(page, 'inactive@example.invalid')).toContainText('소속 중지')
  await expect(row(page, 'inactive@example.invalid').getByRole('button', { name: '역할·소속 관리' })).toBeDisabled()
})

test('keeps the valid session and clears the password when member reauthentication fails', async ({ page }) => {
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/members?*`, route => json(route, { items: [ownMember, otherMember], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/members/${memberId}`, route => json(route, otherMember))
  await page.route('**/api/auth/reauthenticate', route => json(route, { code: 'UNAUTHORIZED', details: [] }, 401))

  await selectCompany(page)
  await row(page, 'member@example.invalid').getByRole('button', { name: '역할·소속 관리' }).click()
  await memberRoles(page).getByLabel('회계 담당자').check()
  await page.getByLabel('구성원 관리용 현재 비밀번호').fill('wrong password')
  await page.getByRole('button', { name: '역할 저장' }).click()
  await expect(page).toHaveURL(/\/companies$/)
  await expect(page.getByRole('alert')).toContainText('비밀번호를 확인하지 못했습니다')
  await expect(page.getByLabel('구성원 관리용 현재 비밀번호')).toHaveValue('')
})

test('drops a stale editor, reloads the latest member and explains the 409 conflict', async ({ page }) => {
  let latest = otherMember
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/members?*`, route => json(route, { items: [ownMember, latest], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/members/${memberId}`, route => json(route, otherMember))
  await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
  await page.route(`**/api/companies/${companyId}/members/${memberId}/roles`, route => {
    latest = { ...otherMember, version: 2, roles: ['APPROVER'] }
    return json(route, { code: 'CONFLICT', details: [] }, 409)
  })

  await selectCompany(page)
  await row(page, 'member@example.invalid').getByRole('button', { name: '역할·소속 관리' }).click()
  await memberRoles(page).getByLabel('승인자').check()
  await page.getByLabel('구성원 관리용 현재 비밀번호').fill('Member verification 2026!')
  await page.getByRole('button', { name: '역할 저장' }).click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 먼저 변경')
  await expect(row(page, 'member@example.invalid')).toContainText('승인자')
  await expect(row(page, 'member@example.invalid')).toContainText('소속 버전 2')
  await expect(page.getByRole('button', { name: '역할 저장' })).toHaveCount(0)
})

test('deactivates another member after explicit confirmation and preserves the manager session', async ({ page }) => {
  let current = otherMember
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/members?*`, route => json(route, { items: [ownMember, current], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/members/${memberId}`, route => json(route, current))
  await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
  await page.route(`**/api/companies/${companyId}/members/${memberId}/deactivate`, route => {
    expect(route.request().postDataJSON()).toEqual({ version: 1 })
    current = { ...otherMember, active: false, version: 2 }
    return json(route, { member: current, sessionRevoked: false })
  })

  await selectCompany(page)
  await row(page, 'member@example.invalid').getByRole('button', { name: '역할·소속 관리' }).click()
  await page.getByRole('button', { name: '소속 중지', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('이 회사 접근을 중지합니다')
  await page.getByLabel('구성원 관리용 현재 비밀번호').fill('Member verification 2026!')
  await page.getByRole('button', { name: '소속 중지 실행' }).click()
  await expect(page).toHaveURL(/\/companies$/)
  await expect(page.getByRole('status', { name: '구성원 작업 결과' })).toContainText('회사 소속을 중지했습니다')
  await expect(row(page, 'member@example.invalid')).toContainText('소속 중지')
})

test('adopts a rotated self-role session and stops requesting members after losing manage permission', async ({ page }) => {
  let selectCount = 0
  await mockShell(page)
  await page.unroute(`**/api/companies/${companyId}/select`)
  await page.route(`**/api/companies/${companyId}/select`, route => {
    selectCount += 1
    if (selectCount === 2) expect(route.request().headers()['x-csrf-token']).toBe(rotatedSession.csrfToken)
    return json(route, selectCount === 1
      ? { company, roles: ['COMPANY_ADMIN'], permissions: ['company.read', 'company.manage', 'company.members.manage'] }
      : { company, roles: ['READ_ONLY'], permissions: ['company.read'] })
  })
  await page.route(`**/api/companies/${companyId}/members?*`, route => json(route, { items: [ownMember, otherMember], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/members/${ownMembershipId}`, route => json(route, ownMember))
  await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
  await page.route(`**/api/companies/${companyId}/members/${ownMembershipId}/roles`, route => json(route, {
    member: { ...ownMember, roles: ['READ_ONLY'], version: 2 }, session: rotatedSession,
  }))

  await selectCompany(page)
  await row(page, session.user.email).getByRole('button', { name: '역할·소속 관리' }).click()
  await memberRoles(page).getByLabel('회사 관리자').uncheck()
  await memberRoles(page).getByLabel('조회 전용').check()
  await page.getByLabel('구성원 관리용 현재 비밀번호').fill('Member verification 2026!')
  await page.getByRole('button', { name: '역할 저장' }).click()
  await expect(page.getByText('현재 권한으로는 구성원 정보를 요청하지 않습니다')).toBeVisible()
  await expect(page.getByRole('heading', { name: '구성원 관리' })).toHaveCount(0)
})

test('returns to login when the manager deactivates their own membership', async ({ page }) => {
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/members?*`, route => json(route, { items: [ownMember, otherMember], nextCursor: null }))
  await page.route(`**/api/companies/${companyId}/members/${ownMembershipId}`, route => json(route, ownMember))
  await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
  await page.route(`**/api/companies/${companyId}/members/${ownMembershipId}/deactivate`, route => json(route, {
    member: { ...ownMember, active: false, version: 2 }, sessionRevoked: true,
  }))

  await selectCompany(page)
  await row(page, session.user.email).getByRole('button', { name: '역할·소속 관리' }).click()
  await page.getByRole('button', { name: '소속 중지', exact: true }).click()
  await page.getByLabel('구성원 관리용 현재 비밀번호').fill('Member verification 2026!')
  await page.getByRole('button', { name: '소속 중지 실행' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('retries a 503 member list and reports a missing member detail without exposing data', async ({ page }) => {
  let listAvailable = false
  await mockShell(page)
  await page.route(`**/api/companies/${companyId}/members?*`, route => listAvailable
    ? json(route, { items: [ownMember, otherMember], nextCursor: null })
    : json(route, { code: 'SERVICE_UNAVAILABLE', details: [] }, 503))
  await page.route(`**/api/companies/${companyId}/members/${memberId}`, route => json(route, { code: 'NOT_FOUND', details: [] }, 404))

  await selectCompany(page)
  await expect(page.getByRole('alert')).toContainText('구성원 서비스를 사용할 수 없습니다')
  listAvailable = true
  await page.getByRole('alert').getByRole('button', { name: '다시 시도' }).click()
  await row(page, 'member@example.invalid').getByRole('button', { name: '역할·소속 관리' }).click()
  await expect(page.getByRole('alert')).toContainText('대상 구성원을 찾지 못했습니다')
  await expect(page.getByText('member@example.invalid')).toHaveCount(1)
})

test('does not request member data for read-only users and stays responsive at 375 and 768 pixels', async ({ page }) => {
  let memberRequests = 0
  await mockShell(page, ['company.read'])
  await page.route(`**/api/companies/${companyId}/members?*`, route => { memberRequests += 1; return json(route, { items: [], nextCursor: null }) })
  await page.setViewportSize({ width: 375, height: 812 })
  await selectCompany(page)
  await expect(page.getByText('현재 권한으로는 구성원 정보를 요청하지 않습니다')).toBeVisible()
  expect(memberRequests).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.screenshot({ path: resolve(proof, 'company-members-mobile-375.png'), fullPage: true })
  await page.setViewportSize({ width: 768, height: 1024 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: resolve(proof, 'company-members-tablet-768.png'), fullPage: true })
})
