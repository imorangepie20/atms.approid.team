import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const proof = resolve('.artifacts/implementation-f01-account-lifecycle-browser')
mkdirSync(proof, { recursive: true })
const token = 'b'.repeat(64), password = ' 새 비밀번호😀 with spaces ', email = 'account-ui@example.invalid'
const session = { user: { id: '20000000-0000-4000-8000-000000000088', email: 'other-ui@example.invalid' }, csrfToken: 'c'.repeat(64), idleExpiresAt: '2026-10-06T09:00:00Z', absoluteExpiresAt: '2026-10-07T08:00:00Z' }
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
async function auth(page: Page, authenticated = false, delay = 0) {
    await page.route('**/api/auth/session', async route => { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); await json(route, authenticated ? session : { code: 'UNAUTHORIZED' }, authenticated ? 200 : 401) })
    await page.route('**/api/companies?*', route => json(route, { items: [], nextCursor: null }))
}
async function open(page: Page, action: 'verify' | 'reset') {
    await page.goto(`/${action === 'verify' ? 'verify-email' : 'reset-password'}#token=${token}`)
    await expect(page).not.toHaveURL(/#token=/)
    await expect(page.getByLabel('새 비밀번호', { exact: true })).toBeEnabled()
}
async function fill(page: Page, label = '새 비밀번호', value = password) {
    await page.getByLabel(label, { exact: true }).fill(value)
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(value)
}
async function clean(page: Page) {
    const state = await page.evaluate(() => JSON.stringify({ history: history.state, local: { ...localStorage }, session: { ...sessionStorage }, html: document.body.innerHTML }))
    expect(state).not.toContain(token); expect(state).not.toContain(password)
}

test('registration checks code points and equality, preserves spaces and sends only email/password without automatic login', async ({ page }) => {
    await auth(page); let requests = 0, logins = 0
    await page.route('**/api/auth/register', route => { requests++; expect(route.request().postDataJSON()).toEqual({ email, password }); return json(route, { accepted: true }, 202) })
    page.on('request', request => { if (request.url().endsWith('/api/auth/login')) logins++ })
    await page.goto('/register'); await page.getByLabel('이메일', { exact: true }).fill(email)
    await fill(page, '비밀번호', '😀'.repeat(14)); await page.getByRole('button', { name: '가입 요청', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('15~128'); await expect(page.getByRole('alert')).toBeFocused(); expect(requests).toBe(0)
    await page.getByRole('button', { name: '비밀번호 입력으로 이동' }).click(); await expect(page.getByLabel('비밀번호', { exact: true })).toBeFocused()
    await fill(page, '비밀번호'); await page.getByLabel('비밀번호 확인').fill('different confirmation')
    await page.getByRole('button', { name: '가입 요청', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('일치'); expect(requests).toBe(0)
    await fill(page, '비밀번호'); await page.getByRole('button', { name: '가입 요청', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('요청을 접수'); await expect(page.getByRole('status')).toBeFocused()
    expect(requests).toBe(1); expect(logins).toBe(0); await clean(page)
})
test('pending registration clears both passwords immediately and blocks duplicate submission', async ({ page }) => {
    await auth(page); let calls = 0, release: () => void = () => undefined
    await page.route('**/api/auth/register', async route => { calls++; await new Promise<void>(resolve => { release = resolve }); await json(route, { accepted: true }, 202) })
    await page.goto('/register'); await page.getByLabel('이메일', { exact: true }).fill(email); await fill(page, '비밀번호')
    await page.getByRole('button', { name: '가입 요청', exact: true }).click()
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue(''); await expect(page.getByLabel('비밀번호 확인')).toHaveValue('')
    await expect(page.getByLabel('이메일', { exact: true })).toBeDisabled()
    await page.getByLabel('비밀번호', { exact: true }).evaluate(input => input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(calls).toBe(1); release(); await expect(page.getByRole('status')).toContainText('접수'); await clean(page)
})
for (const [path, api, button] of [['verify-email', 'email-verification', '확인 메일 요청'], ['forgot-password', 'password-reset', '복구 메일 요청']]) {
    test(`${path} waits for explicit request and gives identical generic acceptance for all email targets`, async ({ page }) => {
        await auth(page); let calls = 0
        await page.route(`**/api/auth/${api}/request`, route => { calls++; expect(Object.keys(route.request().postDataJSON())).toEqual(['email']); return json(route, { accepted: true }, 202) })
        await page.goto(`/${path}`); expect(calls).toBe(0)
        let first = ''
        for (const target of [email, 'missing@example.invalid']) {
            await page.getByLabel('이메일', { exact: true }).fill(target); await page.getByRole('button', { name: button, exact: true }).click()
            const accepted = page.getByRole('status').filter({ hasText: '요청을 접수' }); await expect(accepted).toBeFocused()
            const text = await accepted.textContent(); if (first) expect(text).toBe(first); else first = text!
        }
        expect(calls).toBe(2)
    })
}
test('verification survives initial loading/StrictMode, uses strict token/newPassword, consumes explicitly and never logs in automatically', async ({ page }) => {
    await auth(page, false, 120); let confirms = 0, logins = 0
    const errors: string[] = [], urls: string[] = []
    page.on('console', message => errors.push(message.text())); page.on('request', request => { urls.push(request.url()); if (request.url().endsWith('/api/auth/login')) logins++ })
    await page.route('**/api/auth/email-verification/confirm', route => { confirms++; expect(route.request().postDataJSON()).toEqual({ token, newPassword: password }); return json(route, { success: true }) })
    await open(page, 'verify'); expect(confirms).toBe(0); await clean(page)
    await fill(page); await page.getByRole('button', { name: '이메일 확인 실행' }).click()
    await expect(page.getByRole('status')).toContainText('완료'); await expect(page.getByRole('status')).toBeFocused()
    expect(confirms).toBe(1); expect(logins).toBe(0); await clean(page)
    expect(urls.every(url => !url.includes(token))).toBe(true); expect(errors.join('\n')).not.toContain(token)
})
test('verification preserves another valid account and offers explicit logout with existing CSRF', async ({ page }) => {
    await auth(page, true); let logouts = 0
    await page.route('**/api/auth/email-verification/confirm', route => json(route, { success: true }))
    await page.route('**/api/auth/logout', route => { logouts++; expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken); return json(route, { success: true }) })
    await open(page, 'verify'); await fill(page); await page.getByRole('button', { name: '이메일 확인 실행' }).click()
    await expect(page.getByText(`현재 로그인: ${session.user.email}`)).toBeVisible(); expect(logouts).toBe(0)
    await page.getByRole('button', { name: '다른 계정으로 로그인' }).click(); await expect(page).toHaveURL(/\/login$/); expect(logouts).toBe(1)
    await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible()
})
test('reset success clears current authentication and returns to explicit login rather than protected routes', async ({ page }) => {
    await auth(page, true)
    await page.route('**/api/auth/password-reset/confirm', route => { expect(route.request().postDataJSON()).toEqual({ token, newPassword: password }); return json(route, { success: true }) })
    await open(page, 'reset'); await fill(page); await page.getByRole('button', { name: '새 비밀번호 저장' }).click()
    await expect(page.getByRole('status')).toContainText('재설정했습니다'); await clean(page)
    await page.getByRole('link', { name: '로그인으로 이동' }).click(); await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible()
})
// [F01 재진입 회귀 추가] 두 목적 모두 새로고침 뒤 같은 문서의 hash 링크를 다시 연다.
for (const action of ['verify', 'reset'] as const) {
test(`${action} refresh and leaving discard tokens, same-document mail reentry restores memory without automatic consumption`, async ({ page }) => {
    await auth(page); let calls = 0
    await page.route(`**/api/auth/${action === 'verify' ? 'email-verification' : 'password-reset'}/confirm`, route => { calls++; return json(route, { success: true }) })
    await open(page, action); await page.reload(); await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveCount(0)
    await open(page, action); await clean(page); await page.getByRole('link', { name: '계정 가입', exact: true }).click()
    await page.goto(action === 'verify' ? '/verify-email' : '/reset-password'); await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveCount(0)
    await page.goto(action === 'verify' ? '/reset-password' : '/verify-email'); await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveCount(0)
    expect(calls).toBe(0)
})
test(`${action} completed page accepts a new mail link without another POST until explicit submission`, async ({ page }) => {
    await auth(page); let calls = 0
    await page.route(`**/api/auth/${action === 'verify' ? 'email-verification' : 'password-reset'}/confirm`, route => { calls++; return json(route, { success: true }) })
    await open(page, action); await fill(page)
    await page.getByRole('button', { name: action === 'verify' ? '이메일 확인 실행' : '새 비밀번호 저장' }).click()
    await expect(page.getByRole('status')).toContainText(action === 'verify' ? '완료' : '재설정했습니다')
    await open(page, action); await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveValue(''); expect(calls).toBe(1); await clean(page)
    await fill(page); await page.getByRole('button', { name: action === 'verify' ? '이메일 확인 실행' : '새 비밀번호 저장' }).click()
    await expect(page.getByRole('status')).toContainText(action === 'verify' ? '완료' : '재설정했습니다'); expect(calls).toBe(2)
})
}
for (const action of ['verify', 'reset'] as const) {
    for (const fragment of ['', '#token=invalid', '#token=' + 'A'.repeat(64), `#token=${token}&extra=1`]) {
        test(`${action} rejects missing/malformed fragment ${fragment.length} ${fragment.includes('extra')}`, async ({ page }) => {
            await auth(page); let calls = 0
            await page.route(`**/api/auth/${action === 'verify' ? 'email-verification' : 'password-reset'}/confirm`, route => { calls++; return json(route, { success: true }) })
            await page.goto(`/${action === 'verify' ? 'verify-email' : 'reset-password'}${fragment}`)
            await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveCount(0); await expect(page).not.toHaveURL(/#/); expect(calls).toBe(0)
        })
    }
    for (const status of [400, 403, 429, 503]) {
        test(`${action} ${status} clears passwords, focuses safe error and waits for new explicit input`, async ({ page }) => {
            await auth(page); let calls = 0
            await page.route(`**/api/auth/${action === 'verify' ? 'email-verification' : 'password-reset'}/confirm`, route => { calls++; return json(route, { code: 'BAD_REQUEST', details: [{ message: 'raw-private-detail' }] }, status) })
            await open(page, action); await fill(page); await page.getByRole('button', { name: action === 'verify' ? '이메일 확인 실행' : '새 비밀번호 저장' }).click()
            await expect(page.getByRole('alert')).toBeFocused(); await expect(page.getByRole('alert')).not.toContainText('raw-private-detail')
            await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveValue(''); await expect(page.getByLabel('비밀번호 확인')).toHaveValue(''); expect(calls).toBe(1); await clean(page)
        })
    }
    for (const status of [0, 500]) {
        test(`${action} uncertain ${status} discards token and prevents automatic or repeated consumption`, async ({ page }) => {
            await auth(page); let calls = 0
            await page.route(`**/api/auth/${action === 'verify' ? 'email-verification' : 'password-reset'}/confirm`, route => { calls++; return status ? json(route, { code: 'FAILED' }, status) : route.abort('failed') })
            await open(page, action); await fill(page); await page.getByRole('button', { name: action === 'verify' ? '이메일 확인 실행' : '새 비밀번호 저장' }).click()
            await expect(page.getByRole('alert')).toContainText('저장 결과'); await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveCount(0); expect(calls).toBe(1); await clean(page)
        })
    }
}
for (const width of [375, 768, 1440]) {
    test(`public account forms fit ${width}px with labeled inputs, keyboard error focus and clean screenshots`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 }); await auth(page)
        for (const [path, name] of [['/register', 'register'], [`/verify-email#token=${token}`, 'verify'], ['/forgot-password', 'forgot'], [`/reset-password#token=${token}`, 'reset']]) {
            await page.goto(path); await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
            await clean(page); await page.screenshot({ path: resolve(proof, `account-${name}-${width}.png`), fullPage: true })
        }
    })
}
