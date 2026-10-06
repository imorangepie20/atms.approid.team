import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// [F01 계정 보안 검증] 합성 자격 증명만 사용한다. 실제 DB/SMTP 검증은 별도 격리 실행에서 수행한다.
const proof = resolve('.artifacts/implementation-f01-account-security-browser')
mkdirSync(proof, { recursive: true })
const old = ' 현재 비밀번호😀 original ', fresh = ' 새 비밀번호😀 with spaces '
const session = { user: { id: '20000000-0000-4000-8000-000000000099', email: 'security@example.invalid' }, csrfToken: 'd'.repeat(64), idleExpiresAt: '2026-10-06T09:00:00Z', absoluteExpiresAt: '2026-10-07T08:00:00Z' }
const json = (route: Route, body: unknown = { success: true }, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
async function setup(page: Page, authenticated = true) {
    const state = { session: authenticated ? session : null as typeof session | null, status: 200 }
    await page.route('**/api/auth/session', route => json(route, state.session ?? { code: 'UNAUTHORIZED' }, state.session ? state.status : 401))
    await page.route('**/api/companies?*', route => json(route, { items: [], nextCursor: null }))
    await page.route('**/api/auth/login', route => json(route, session))
    return state
}
async function open(page: Page) { await page.goto('/settings?section=security'); await expect(page.getByLabel('현재 비밀번호', { exact: true })).toBeEnabled() }
async function fill(page: Page, current = old, next = fresh) {
    await page.getByLabel('현재 비밀번호', { exact: true }).fill(current)
    await page.getByLabel('새 비밀번호', { exact: true }).fill(next)
    await page.getByLabel('새 비밀번호 확인', { exact: true }).fill(next)
}
async function cleared(page: Page) { for (const label of ['현재 비밀번호', '새 비밀번호', '새 비밀번호 확인']) await expect(page.getByLabel(label, { exact: true })).toHaveValue('') }
async function clean(page: Page) {
    const state = await page.evaluate(() => JSON.stringify({ html: document.body.innerHTML, history: history.state, local: { ...localStorage }, session: { ...sessionStorage } }))
    expect(state).not.toContain(old); expect(state).not.toContain(fresh); expect(state).not.toContain(session.csrfToken)
}

test('security is protected, restores requested section after explicit login and requires no company or role', async ({ page }) => {
    await setup(page, false); await page.goto('/settings?section=security'); await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('이메일', { exact: true }).fill(session.user.email); await page.getByLabel('비밀번호', { exact: true }).fill(old)
    await page.getByRole('button', { name: '로그인', exact: true }).click(); await expect(page).toHaveURL(/\/settings\?section=security$/)
    await expect(page.getByText('현재 계정:')).toContainText(session.user.email)
    await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toHaveCount(0)
    await expect(page.getByText('Two-Factor Authentication', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '계정 보안', exact: true })).toHaveAttribute('aria-current', 'page')
})
test('code points, whitespace, equality and strict purpose-specific POST bodies; successful change waits for explicit login', async ({ page }) => {
    await setup(page); const calls: string[] = []
    await page.route('**/api/auth/reauthenticate', route => { calls.push('reauth'); expect(route.request().postDataJSON()).toEqual({ password: old }); expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken); return json(route) })
    await page.route('**/api/auth/password/change', route => { calls.push('change'); expect(route.request().postDataJSON()).toEqual({ newPassword: fresh }); expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken); return json(route) })
    await open(page); await fill(page, old, '😀'.repeat(14)); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('15~128'); await expect(page.getByRole('alert')).toBeFocused(); expect(calls).toEqual([])
    await page.getByRole('button', { name: '비밀번호 입력으로 이동' }).click(); await expect(page.getByLabel('현재 비밀번호', { exact: true })).toBeFocused()
    await fill(page); await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('different'); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('일치'); expect(calls).toEqual([])
    await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click(); await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('status')).toContainText('비밀번호를 변경'); await expect(page.getByRole('status')).toBeFocused(); expect(calls).toEqual(['reauth', 'change']); await clean(page)
    await page.getByLabel('이메일', { exact: true }).fill(session.user.email); await page.getByLabel('비밀번호', { exact: true }).fill(fresh); await page.getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page).toHaveURL(/\/settings\?section=security$/); await cleared(page)
})
for (const [current, next, valid] of [[old, '😀'.repeat(15), true], [old, '😀'.repeat(128), true], [old, '😀'.repeat(129), false], ['😀'.repeat(128), fresh, true], ['😀'.repeat(129), fresh, false]] as const) {
    test(`Unicode boundary current${Array.from(current).length}/new${Array.from(next).length} valid${valid}`, async ({ page }) => {
        await setup(page); let calls = 0
        await page.route('**/api/auth/reauthenticate', route => { calls++; expect(route.request().postDataJSON()).toEqual({ password: current }); return json(route, { code: 'LIMITED' }, 429) })
        await open(page); await fill(page, current, next); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); expect(calls).toBe(valid ? 1 : 0)
        if (valid) await cleared(page)
    })
}
test('pending reauthentication erases all secrets, locks both actions and rejects forged duplicate submissions', async ({ page }) => {
    await setup(page); let calls = 0, changes = 0, release = () => undefined as void
    await page.route('**/api/auth/reauthenticate', async route => { calls++; await new Promise<void>(resolve => { release = resolve }); await json(route, { code: 'LIMITED' }, 429) })
    await page.route('**/api/auth/password/change', route => { changes++; return json(route) })
    await open(page); await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click(); await cleared(page)
    await expect(page.getByLabel('현재 비밀번호', { exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: '모든 기기 로그아웃', exact: true })).toBeDisabled()
    await page.getByLabel('현재 비밀번호', { exact: true }).evaluate(input => input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(calls).toBe(1); await clean(page); release(); await expect(page.getByRole('alert')).toContainText('횟수'); expect(changes).toBe(0)
})
test('leaving during reauthentication never sends subsequent password change, and reentry discards inputs', async ({ page }) => {
    await setup(page); let changes = 0, release = () => undefined as void
    await page.route('**/api/auth/reauthenticate', async route => { await new Promise<void>(resolve => { release = resolve }); await json(route) })
    await page.route('**/api/auth/password/change', route => { changes++; return json(route) })
    await open(page); await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click(); await cleared(page)
    await page.getByRole('button', { name: 'Appearance', exact: true }).click(); release(); await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '계정 보안', exact: true }).click(); await cleared(page); expect(changes).toBe(0)
    await fill(page); await page.getByRole('button', { name: '입력 취소', exact: true }).click(); await cleared(page); await expect(page.getByLabel('현재 비밀번호', { exact: true })).toBeFocused()
})
for (const expired of [false, true]) test(`reauth401 probes session; expired${expired} never sends change`, async ({ page }) => {
    const state = await setup(page); let changes = 0
    await page.route('**/api/auth/reauthenticate', route => { if (expired) state.session = null; return json(route, { code: 'PRIVATE_DETAIL', details: [{ message: old }] }, 401) })
    await page.route('**/api/auth/password/change', route => { changes++; return json(route) })
    await open(page); await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
    if (expired) { await expect(page).toHaveURL(/\/login$/); await expect(page.getByRole('status')).toContainText('만료') }
    else { await expect(page.getByRole('alert')).toContainText('현재 비밀번호'); await cleared(page); await expect(page.getByLabel('현재 비밀번호', { exact: true })).toBeEnabled() }
    expect(changes).toBe(0); await clean(page)
})
for (const stage of ['reauthenticate', 'password/change'] as const) for (const status of [400, 403, 429, 503]) test(`${stage} ${status} clears secrets, gives safe error, needs fresh explicit input`, async ({ page }) => {
    await setup(page); let calls = 0
    await page.route('**/api/auth/reauthenticate', route => stage === 'reauthenticate' ? (calls++, json(route, { code: 'PRIVATE_DETAIL', details: [{ message: old }] }, status)) : json(route))
    await page.route('**/api/auth/password/change', route => { calls++; return json(route, { code: 'PRIVATE_DETAIL', details: [{ message: fresh }] }, status) })
    await open(page); await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await cleared(page)
    await expect(page.getByLabel('현재 비밀번호', { exact: true })).toBeEnabled(); expect(calls).toBe(1); await clean(page)
})
test('403 session refresh uses rotated CSRF on next explicit reauthentication and change', async ({ page }) => {
    const state = await setup(page); let calls = 0; const rotated = { ...session, csrfToken: 'e'.repeat(64) }
    await page.route('**/api/auth/reauthenticate', route => { calls++; expect(route.request().headers()['x-csrf-token']).toBe(calls === 1 ? session.csrfToken : rotated.csrfToken); if (calls === 1) { state.session = rotated; return json(route, {}, 403) } return json(route) })
    await page.route('**/api/auth/password/change', route => { expect(route.request().headers()['x-csrf-token']).toBe(rotated.csrfToken); return json(route) })
    await open(page); await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('현재 비밀번호', { exact: true })).toBeEnabled()
    await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click(); await expect(page).toHaveURL(/\/login$/); expect(calls).toBe(2)
})
test('logout all opens without POST, clears inputs, cancels with focus and sends only explicit final POST with CSRF', async ({ page }) => {
    await setup(page); let calls = 0, reauth = 0
    await page.route('**/api/auth/reauthenticate', route => { reauth++; return json(route) })
    await page.route('**/api/auth/logout-all', route => { calls++; expect(route.request().postDataJSON()).toEqual({}); expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken); return json(route) })
    await open(page); await fill(page); await page.getByRole('button', { name: '모든 기기 로그아웃', exact: true }).click(); await cleared(page)
    await expect(page.getByRole('heading', { name: '전체 기기 종료 확인' })).toBeFocused(); expect(calls).toBe(0)
    await page.getByRole('button', { name: '취소', exact: true }).click(); await expect(page.getByRole('button', { name: '모든 기기 로그아웃', exact: true })).toBeFocused(); expect(calls).toBe(0)
    await page.keyboard.press('Enter'); await page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true }).click(); await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('status')).toContainText('모든 기기'); await expect(page.getByRole('status')).toBeFocused(); expect(calls).toBe(1); expect(reauth).toBe(0); await clean(page)
})
test('identity replacement after probe discards old input and logout confirmation', async ({ page }) => {
    const state = await setup(page); let calls = 0
    await page.route('**/api/auth/logout-all', route => { calls++; state.session = { ...session, user: { id: '20000000-0000-4000-8000-000000000100', email: 'replacement@example.invalid' } }; return json(route, {}, 403) })
    await open(page); await fill(page); await page.getByRole('button', { name: '모든 기기 로그아웃', exact: true }).click(); await page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true }).click()
    await expect(page.getByText('현재 계정:')).toContainText('replacement@example.invalid'); await expect(page.getByRole('heading', { name: '전체 기기 종료 확인' })).toHaveCount(0); await cleared(page); expect(calls).toBe(1)
})
test('pending logout all locks final confirmation and password change without duplicate POST', async ({ page }) => {
    await setup(page); let calls = 0, release = () => undefined as void
    await page.route('**/api/auth/logout-all', async route => { calls++; await new Promise<void>(resolve => { release = resolve }); await json(route) })
    await open(page); await page.getByRole('button', { name: '모든 기기 로그아웃', exact: true }).click(); await page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true }).click()
    await expect(page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: '비밀번호 변경', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true }).evaluate(button => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(calls).toBe(1); release(); await expect(page).toHaveURL(/\/login$/)
})
for (const status of [400, 403, 429]) test(`logout all ${status} displays safe error and leaves explicit cancel/retry available`, async ({ page }) => {
    await setup(page); let calls = 0
    await page.route('**/api/auth/logout-all', route => { calls++; return json(route, { details: [{ message: old }] }, status) })
    await open(page); await page.getByRole('button', { name: '모든 기기 로그아웃', exact: true }).click(); await page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true }).click()
    await expect(page.getByRole('alert')).toBeFocused(); await expect(page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true })).toBeEnabled(); expect(calls).toBe(1); await clean(page)
    await page.getByRole('button', { name: '취소', exact: true }).click(); await expect(page.getByRole('button', { name: '모든 기기 로그아웃', exact: true })).toBeFocused()
})
test('reauthentication connection loss probes but never sends password change or automatically retries', async ({ page }) => {
    await setup(page); let calls = 0, changes = 0
    await page.route('**/api/auth/reauthenticate', route => { calls++; return route.abort('failed') }); await page.route('**/api/auth/password/change', route => { changes++; return json(route) })
    await open(page); await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('재확인'); await expect(page.getByLabel('현재 비밀번호', { exact: true })).toBeEnabled(); await cleared(page); expect(calls).toBe(1); expect(changes).toBe(0)
})
for (const stage of ['password/change', 'logout-all'] as const) test(`${stage}401 expires authentication with safe login notice`, async ({ page }) => {
    await setup(page); await page.route('**/api/auth/reauthenticate', route => json(route)); await page.route(`**/api/auth/${stage}`, route => json(route, {}, 401))
    await open(page)
    if (stage === 'password/change') { await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click() }
    else { await page.getByRole('button', { name: '모든 기기 로그아웃', exact: true }).click(); await page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true }).click() }
    await expect(page).toHaveURL(/\/login$/); await expect(page.getByRole('status')).toContainText('만료'); await clean(page)
})
for (const [stage, status] of [['password/change', 0], ['password/change', 500], ['logout-all', 0], ['logout-all', 500], ['logout-all', 503]] as const) test(`${stage} uncertain${status} preserves live session but locks both writes through manual GET; current logout is separate`, async ({ page }) => {
    await setup(page); let calls = 0, single = 0
    await page.route('**/api/auth/reauthenticate', route => json(route))
    await page.route(`**/api/auth/${stage}`, route => { calls++; return status === 0 ? route.abort('failed') : json(route, {}, status) })
    await page.route('**/api/auth/logout', route => { single++; expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken); return json(route) })
    await open(page)
    if (stage === 'password/change') { await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click() }
    else { await page.getByRole('button', { name: '모든 기기 로그아웃', exact: true }).click(); await page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true }).click() }
    await expect(page.getByRole('alert')).toContainText('결과'); await expect(page.getByRole('button', { name: '현재 세션 다시 확인' })).toBeEnabled(); await cleared(page)
    await page.getByRole('button', { name: '현재 세션 다시 확인' }).click(); await expect(page.getByRole('button', { name: '현재 세션 다시 확인' })).toBeEnabled()
    await expect(page.getByRole('button', { name: '비밀번호 변경', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: '모든 기기 로그아웃', exact: true })).toBeDisabled(); expect(calls).toBe(1); await clean(page)
    await page.getByRole('button', { name: '현재 기기 로그아웃 후 로그인' }).click(); await expect(page).toHaveURL(/\/login$/); await expect(page.getByRole('status')).toContainText('결과를 확인하지'); expect(single).toBe(1); expect(calls).toBe(1)
})
for (const probeStatus of [401, 500]) test(`uncertain write probe${probeStatus} never claims success or resubmits`, async ({ page }) => {
    const state = await setup(page); let calls = 0
    await page.route('**/api/auth/reauthenticate', route => json(route))
    await page.route('**/api/auth/password/change', route => { calls++; state.status = probeStatus; return route.abort('failed') })
    await open(page); await fill(page); await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
    if (probeStatus === 401) { await expect(page).toHaveURL(/\/login$/); await expect(page.getByRole('status')).toContainText('결과를 확인하지'); await expect(page.getByRole('status')).not.toContainText('변경했습니다') }
    else { await expect(page.getByRole('alert')).toContainText('세션도'); state.status = 200; await page.getByRole('button', { name: '현재 세션 다시 확인' }).click(); await expect(page.getByRole('button', { name: '현재 세션 다시 확인' })).toBeEnabled(); await expect(page.getByRole('button', { name: '비밀번호 변경', exact: true })).toBeDisabled() }
    expect(calls).toBe(1); await clean(page)
})
test('unknown notice keys and prototype names cannot display arbitrary login messages', async ({ page }) => {
    await setup(page, false); await page.goto('/login')
    for (const key of ['__proto__', 'constructor', old]) {
        await page.evaluate(key => { history.replaceState({ usr: { accountNotice: key } }, '', '/login') }, key); await page.reload()
        await expect(page.getByRole('heading', { name: '계정 로그인' })).toBeVisible(); await expect(page.getByRole('status')).toHaveCount(0)
    }
})
for (const width of [375, 768, 1440]) test(`security responsive ${width}px: labels, keyboard,44px,no overflow, confirmation and login notice`, async ({ page }) => {
    await setup(page); await page.setViewportSize({ width, height: 1000 }); await open(page)
    await expect(page.getByLabel('현재 비밀번호', { exact: true })).toHaveAttribute('autocomplete', 'current-password')
    await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveAttribute('autocomplete', 'new-password')
    await expect(page.getByLabel('새 비밀번호 확인', { exact: true })).toHaveAttribute('autocomplete', 'new-password')
    await page.getByLabel('현재 비밀번호', { exact: true }).focus(); await page.keyboard.press('Tab'); await expect(page.getByLabel('새 비밀번호', { exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const label of ['비밀번호 변경', '입력 취소', '모든 기기 로그아웃']) expect((await page.getByRole('button', { name: label, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: resolve(proof, `security-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: '모든 기기 로그아웃', exact: true }).click(); await expect(page.getByRole('heading', { name: '전체 기기 종료 확인' })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: resolve(proof, `security-confirm-${width}.png`), fullPage: true })
    await page.route('**/api/auth/logout-all', route => json(route)); await page.getByRole('button', { name: '모든 기기 로그아웃 확정', exact: true }).click(); await expect(page.getByRole('status')).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: resolve(proof, `security-notice-${width}.png`), fullPage: true }); await clean(page)
})
