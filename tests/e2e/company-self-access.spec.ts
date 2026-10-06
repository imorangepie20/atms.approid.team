import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const proof = resolve('.artifacts/implementation-f01-company-self-access-browser')
mkdirSync(proof, { recursive: true })
const companyId = '10000000-0000-4000-8000-000000000021'
const userId = '20000000-0000-4000-8000-000000000021'
const requestId = '50000000-0000-4000-8000-000000000021'
const token = 'a'.repeat(64)
const password = 'Self access verification 2026!'
const session = { user: { id: userId, email: 'self-access@example.invalid' }, csrfToken: 'c'.repeat(64), idleExpiresAt: '2026-10-06T09:00:00Z', absoluteExpiresAt: '2026-10-07T08:00:00Z' }
const rotated = { ...session, csrfToken: 'd'.repeat(64) }
const ownRequest = { id: requestId, companyId, requesterId: userId, status: 'PENDING', version: 1, expiresAt: '2026-10-13T00:00:00Z' }
const accepted = { invitation: { id: requestId, companyId, email: session.user.email, roles: ['READ_ONLY'], issuerId: userId, status: 'ACCEPTED', version: 2, expiresAt: ownRequest.expiresAt }, member: { id: requestId, companyId, active: true, version: 1, roles: ['READ_ONLY'] }, session: rotated }
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }) }
async function auth(page: Page) { await page.route('**/api/auth/session', route => json(route, session)) }
async function own(page: Page) {
    await auth(page)
    await page.route('**/api/me/company-access-requests?*', route => json(route, { items: [ownRequest], nextCursor: null }))
}
async function openInvitation(page: Page) { await page.goto(`/accept-company-invitation#token=${token}`); await expect(page).toHaveURL(/\/accept-company-invitation$/) }
async function submitAccept(page: Page) { await page.getByLabel('수락용 현재 비밀번호').fill(password); await page.getByRole('button', { name: '초대 수락', exact: true }).click() }

test('fragment survives loading and inline login under StrictMode, accepts explicitly, then uses rotated CSRF', async ({ page }) => {
    let signedIn = false
    let accepts = 0
    const errors: string[] = []
    const calls: string[] = []
    page.on('console', message => errors.push(message.text()))
    page.on('request', request => { if (request.url().includes('/api/')) calls.push(new URL(request.url()).pathname) })
    await page.route('**/api/auth/session', async route => { await new Promise(resolve => setTimeout(resolve, 120)); await json(route, signedIn ? session : { code: 'UNAUTHORIZED' }, signedIn ? 200 : 401) })
    await page.route('**/api/auth/login', route => { expect(route.request().postDataJSON()).toEqual({ email: session.user.email, password }); signedIn = true; return json(route, session) })
    await page.route('**/api/auth/reauthenticate', route => { expect(route.request().postDataJSON()).toEqual({ password }); return json(route, { success: true }) })
    await page.route('**/api/company-invitations/accept', route => { accepts++; expect(route.request().postDataJSON()).toEqual({ token }); return json(route, accepted) })
    await page.route('**/api/me/company-access-requests?*', route => json(route, { items: [], nextCursor: null }))
    await page.route('**/api/companies?*', route => json(route, { items: [], nextCursor: null }))
    await page.route(`**/api/companies/${companyId}/access-requests`, route => { expect(route.request().headers()['x-csrf-token']).toBe(rotated.csrfToken); return json(route, { accessRequest: ownRequest }) })
    await openInvitation(page)
    await page.getByLabel('이메일', { exact: true }).fill(session.user.email)
    await page.getByLabel('비밀번호', { exact: true }).fill(password)
    await page.getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page.getByLabel('수락용 현재 비밀번호')).toBeVisible()
    expect(accepts).toBe(0)
    expect(calls.every(path => path.startsWith('/api/auth/'))).toBe(true)
    await submitAccept(page)
    await expect(page.getByRole('heading', { name: '초대를 수락했습니다' })).toBeFocused()
    await expect(page.getByText('조회 전용', { exact: true })).toBeVisible()
    expect(accepts).toBe(1)
    const state = await page.evaluate(() => JSON.stringify({ history: history.state, local: { ...localStorage }, session: { ...sessionStorage }, html: document.body.innerHTML }))
    expect(state).not.toContain(token); expect(state).not.toContain(password); expect(errors.join('\n')).not.toContain(token)
    await page.getByRole('link', { name: '회사 관리로 이동' }).click()
    await page.getByRole('link', { name: '회사 접근 요청', exact: true }).click()
    await page.getByLabel('회사 식별번호', { exact: true }).fill(companyId)
    await page.getByRole('button', { name: '접근 요청 제출' }).click()
    await expect(page.getByRole('status').filter({ hasText: '세무사 접근 요청을 제출했습니다' })).toBeVisible()
})

test('refresh discards memory, mail reentry restores it without automatic acceptance', async ({ page }) => {
    await auth(page); let accepts = 0
    await page.route('**/api/company-invitations/accept', route => { accepts++; return json(route, accepted) })
    await openInvitation(page); await expect(page.getByLabel('수락용 현재 비밀번호')).toBeVisible()
    await page.reload(); await expect(page.getByRole('status')).toContainText('메일의 최신 링크')
    await openInvitation(page); await expect(page.getByLabel('수락용 현재 비밀번호')).toBeVisible(); expect(accepts).toBe(0)
})

for (const fragment of ['', '#token=invalid', `#token=${token}&extra=1`]) {
    test(`invalid/missing fragment has no accept action (${fragment.length})`, async ({ page }) => {
        await auth(page); await page.goto(`/accept-company-invitation${fragment}`)
        await expect(page.getByRole('status')).toContainText('유효한 초대 링크')
        await expect(page.getByRole('button', { name: '초대 수락', exact: true })).toHaveCount(0)
        await expect(page).toHaveURL(/\/accept-company-invitation$/)
    })
}

test('wrong reauthentication password keeps session and immediately clears the input', async ({ page }) => {
    await auth(page); await page.route('**/api/auth/reauthenticate', route => json(route, { code: 'UNAUTHORIZED' }, 401))
    await openInvitation(page); await submitAccept(page)
    await expect(page.getByRole('alert')).toContainText('비밀번호를 확인하지 못했습니다')
    await expect(page.getByLabel('수락용 현재 비밀번호')).toHaveValue('')
    await expect(page.getByRole('button', { name: '다른 계정으로 로그인' })).toBeVisible()
})

test('real session expiry relogs inline and keeps invitation for a new explicit submit', async ({ page }) => {
    let expired = false; let accepts = 0
    await page.route('**/api/auth/session', route => json(route, expired ? { code: 'UNAUTHORIZED' } : session, expired ? 401 : 200))
    await page.route('**/api/auth/reauthenticate', route => { expired = true; return json(route, { code: 'UNAUTHORIZED' }, 401) })
    await page.route('**/api/auth/login', route => { expired = false; return json(route, session) })
    await page.route('**/api/company-invitations/accept', route => { accepts++; return json(route, accepted) })
    await openInvitation(page); await submitAccept(page)
    await expect(page.getByRole('alert')).toContainText('세션이 만료')
    await page.getByLabel('이메일', { exact: true }).fill(session.user.email); await page.getByLabel('비밀번호', { exact: true }).fill(password)
    await page.getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page.getByLabel('수락용 현재 비밀번호')).toBeVisible(); expect(accepts).toBe(0)
})

test('wrong account can logout and relogin without losing the mail invitation', async ({ page }) => {
    await auth(page); await page.route('**/api/auth/logout', route => json(route, { success: true })); await page.route('**/api/auth/login', route => json(route, session))
    await openInvitation(page); await page.getByRole('button', { name: '다른 계정으로 로그인' }).click()
    await page.getByLabel('이메일', { exact: true }).fill(session.user.email); await page.getByLabel('비밀번호', { exact: true }).fill(password)
    await page.getByRole('button', { name: '로그인', exact: true }).click(); await expect(page.getByLabel('수락용 현재 비밀번호')).toBeVisible()
})

for (const status of [400, 403, 409, 429, 503, 0]) {
    test(`accept failure ${status} is fixed text, clears password, and never retries automatically`, async ({ page }) => {
        await auth(page); let attempts = 0
        await page.route('**/api/auth/reauthenticate', route => json(route, { success: true }))
        await page.route('**/api/company-invitations/accept', route => { attempts++; return status ? json(route, { code: 'FAILED', details: [{ message: token }] }, status) : route.abort('failed') })
        await openInvitation(page); await submitAccept(page); await expect(page.getByRole('alert')).toBeVisible()
        await expect(page.getByRole('alert')).not.toContainText(token)
        if (status === 400) await expect(page.getByLabel('수락용 현재 비밀번호')).toHaveCount(0)
        else await expect(page.getByLabel('수락용 현재 비밀번호')).toHaveValue('')
        expect(attempts).toBe(1)
    })
}

test('own requests validates UUID, sends strict empty body, paginates 25, and exposes only own fields', async ({ page }) => {
    await auth(page); const calls: string[] = []; page.on('request', r => { if (r.url().includes('/api/')) calls.push(new URL(r.url()).pathname) })
    await page.route('**/api/me/company-access-requests?*', route => {
        const url = new URL(route.request().url()); expect(url.searchParams.get('limit')).toBe('25')
        return json(route, url.searchParams.has('cursor') ? { items: ['CANCELLED', 'APPROVED', 'REJECTED', 'EXPIRED'].map((status, i) => ({ ...ownRequest, id: `${requestId.slice(0, -1)}${i + 2}`, status })), nextCursor: null } : { items: [ownRequest], nextCursor: requestId })
    })
    let creates = 0
    await page.route(`**/api/companies/${companyId}/access-requests`, route => { creates++; expect(route.request().postDataJSON()).toEqual({}); return json(route, { accessRequest: ownRequest }) })
    await page.goto('/company-access'); await page.getByLabel('회사 식별번호', { exact: true }).fill('invalid'); await page.getByRole('button', { name: '접근 요청 제출' }).click()
    await expect(page.getByRole('alert')).toContainText('UUID'); expect(creates).toBe(0)
    await page.getByLabel('회사 식별번호', { exact: true }).fill(companyId); await page.getByRole('button', { name: '접근 요청 제출' }).click()
    await expect(page.getByRole('status').filter({ hasText: '관리자 승인 전' })).toBeVisible()
    await page.getByRole('button', { name: '요청 더 보기' }).click()
    const list = page.getByRole('list', { name: '내 접근 요청 목록' }); await expect(list.getByRole('listitem')).toHaveCount(5)
    for (const status of ['취소', '승인', '반려', '만료']) await expect(list).toContainText(status)
    expect(calls.every(path => path.startsWith('/api/auth/') || path === '/api/me/company-access-requests' || path === `/api/companies/${companyId}/access-requests`)).toBe(true)
    await expect(list).not.toContainText('@'); await expect(page.getByRole('link', { name: '회사 접근 요청', exact: true })).toBeVisible()
})

for (const conflict of [404, 409]) {
    test(`cancel ${conflict} closes stale confirmation and refreshes version`, async ({ page }) => {
        await auth(page); let row = ownRequest
        await page.route('**/api/me/company-access-requests?*', route => json(route, { items: [row], nextCursor: null }))
        await page.route(`**/api/me/company-access-requests/${requestId}/cancel`, route => { expect(route.request().postDataJSON()).toEqual({ version: 1 }); row = { ...ownRequest, status: 'CANCELLED', version: 2 }; return json(route, { code: 'FAILED' }, conflict) })
        await page.goto(`/company-access?companyId=${companyId}`); await expect(page.getByLabel('회사 식별번호', { exact: true })).toHaveValue(companyId)
        await page.getByRole('button', { name: '요청 취소' }).click(); await expect(page.getByRole('heading', { name: '접근 요청 취소 확인' })).toBeFocused()
        await page.getByRole('button', { name: '취소 실행' }).click()
        await expect(page.getByRole('heading', { name: '접근 요청 취소 확인' })).toHaveCount(0)
        await expect(page.getByRole('list', { name: '내 접근 요청 목록' })).toContainText('요청 버전 2')
    })
}

for (const status of [400, 403, 404, 409, 429, 503, 0]) {
    test(`request failure ${status} offers safe retry without company detail lookup`, async ({ page }) => {
        await own(page); let attempts = 0
        await page.route(`**/api/companies/${companyId}/access-requests`, route => { attempts++; return status ? json(route, { code: 'FAILED' }, status) : route.abort('failed') })
        await page.goto(`/company-access?companyId=${companyId}`); await page.getByRole('button', { name: '접근 요청 제출' }).click()
        await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('button', { name: '접근 요청 제출' })).toBeEnabled(); expect(attempts).toBe(1)
    })
}

test('list failure retries, and approval-revoked session redirects login retaining company link', async ({ page }) => {
    await auth(page); let status = 503
    await page.route('**/api/me/company-access-requests?*', route => json(route, status === 200 ? { items: [], nextCursor: null } : { code: 'FAILED' }, status))
    await page.goto(`/company-access?companyId=${companyId}`); await expect(page.getByRole('heading', { name: '접근 요청을 불러오지 못했습니다' })).toBeVisible()
    status = 200; await page.getByRole('button', { name: /다시/ }).click(); await expect(page.getByRole('heading', { name: '접근 요청이 없습니다' })).toBeVisible()
    status = 401; await page.reload(); await expect(page).toHaveURL(/\/login$/)
    await expect.poll(() => page.evaluate(() => history.state?.usr?.from)).toBe(`/company-access?companyId=${companyId}`)
})

for (const width of [375, 768, 1440]) {
    test(`self access screens fit ${width}px and cancel confirmation restores keyboard focus`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 }); await own(page)
        await page.goto('/company-access'); await page.getByRole('button', { name: '요청 취소' }).click()
        await expect(page.getByRole('heading', { name: '접근 요청 취소 확인' })).toBeFocused()
        await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '요청 취소' })).toBeFocused()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: resolve(proof, `own-access-${width}.png`), fullPage: true })
        await openInvitation(page); await expect(page.getByLabel('수락용 현재 비밀번호')).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: resolve(proof, `invitation-${width}.png`), fullPage: true })
    })
}

test('admin shares company-only link with selectable clipboard fallback; read-only has no link', async ({ page }) => {
    const company = { id: companyId, name: '전달 링크 검증 회사', currency: 'KRW', accountingStandard: 'K_GAAP', allowSelfApproval: false, version: 1 }
    let permissions = ['company.read', 'company.members.manage']
    await auth(page); await page.route('**/api/companies?*', route => json(route, { items: [company], nextCursor: null }))
    await page.route(`**/api/companies/${companyId}/select`, route => json(route, { company, roles: ['READ_ONLY'], permissions }))
    for (const suffix of ['fiscal-years', 'members', 'invitations', 'access-requests']) await page.route(`**/api/companies/${companyId}/${suffix}?*`, route => json(route, { items: [], nextCursor: null }))
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('unavailable')) }, configurable: true }))
    await page.goto('/companies'); await page.getByRole('button', { name: /전달 링크 검증 회사/ }).click()
    const input = page.getByLabel('전달할 회사 접근 요청 링크'); await expect(input).toHaveValue(`http://127.0.0.1:4174/company-access?companyId=${companyId}`)
    await page.getByRole('button', { name: '접근 요청 링크 복사' }).click(); await expect(page.getByRole('status').filter({ hasText: '자동 복사' })).toBeVisible()
    await input.focus(); expect(await input.evaluate(el => (el as HTMLInputElement).selectionEnd! - (el as HTMLInputElement).selectionStart!)).toBe((await input.inputValue()).length)
    permissions = ['company.read']; await page.reload(); await page.getByRole('button', { name: /전달 링크 검증 회사/ }).click(); await expect(input).toHaveCount(0)
})
