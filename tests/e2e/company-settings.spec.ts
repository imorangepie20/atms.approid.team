import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const proof = resolve('.artifacts/implementation-f01-company-settings-browser')
mkdirSync(proof, { recursive: true })
const companyId = '10000000-0000-4000-8000-000000000031'
const otherId = '10000000-0000-4000-8000-000000000032'
const company = { id: companyId, name: '설정 검증 회사', currency: 'KRW', accountingStandard: 'K_GAAP', allowSelfApproval: false, version: 1 }
const other = { ...company, id: otherId, name: '설정 다른 회사' }
const password = 'Settings browser verification 2026!'
const session = { user: { id: '20000000-0000-4000-8000-000000000031', email: 'settings-browser@example.invalid' }, csrfToken: 'c'.repeat(64), idleExpiresAt: '2026-10-06T09:00:00Z', absoluteExpiresAt: '2026-10-07T08:00:00Z' }
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }) }
async function mock(page: Page, permissions = ['company.read', 'company.manage']) {
    const state = { company: { ...company }, permissions, expired: false, selects: 0 }
    await page.route('**/api/auth/session', route => json(route, state.expired ? { code: 'UNAUTHORIZED' } : session, state.expired ? 401 : 200))
    await page.route('**/api/companies?*', route => json(route, { items: [state.company, other], nextCursor: null }))
    await page.route('**/api/companies/*/fiscal-years?*', route => json(route, { items: [], nextCursor: null }))
    await page.route(`**/api/companies/${companyId}/select`, route => { state.selects++; return json(route, { company: state.company, roles: state.permissions.includes('company.manage') ? ['COMPANY_ADMIN'] : ['READ_ONLY'], permissions: state.permissions }) })
    await page.route(`**/api/companies/${otherId}/select`, route => json(route, { company: other, roles: ['READ_ONLY'], permissions: ['company.read'] }))
    await page.route('**/api/auth/reauthenticate', route => { expect(route.request().postDataJSON()).toEqual({ password }); return json(route, { success: true }) })
    return state
}
async function open(page: Page) {
    await page.goto('/companies'); await page.getByRole('button', { name: /설정 검증 회사/ }).click()
}
async function confirm(page: Page, allow = true) {
    await page.getByRole('radio', { name: allow ? '허용' : '금지', exact: true }).check()
    await page.getByRole('button', { name: '변경 확인', exact: true }).click()
    await expect(page.getByRole('heading', { name: '본인 승인 설정 변경 확인' })).toBeFocused()
}
async function submit(page: Page) {
    await page.getByLabel('설정 변경용 현재 비밀번호').fill(password)
    await page.getByRole('button', { name: '설정 변경 실행' }).click()
}
const settingUrl = `**/api/companies/${companyId}/settings/self-approval`

test('explicit bidirectional saves send only Boolean/version and preserve the current CSRF', async ({ page }) => {
    const state = await mock(page)
    const bodies: unknown[] = []
    await page.route(settingUrl, route => {
        const body = route.request().postDataJSON(); bodies.push(body)
        expect(route.request().method()).toBe('PATCH'); expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
        state.company = { ...state.company, allowSelfApproval: body.allowSelfApproval, version: state.company.version + 1 }
        return json(route, state.company)
    })
    await open(page); await expect(page.getByRole('button', { name: '변경 확인' })).toBeDisabled()
    await confirm(page); expect(bodies).toHaveLength(0)
    await submit(page); await expect(page.getByRole('status', { name: '본인 승인 설정 작업 결과' })).toContainText('허용')
    await expect(page.getByText('현재 설정:', { exact: false })).toContainText('회사 버전 2')
    await expect(page.getByRole('button', { name: '변경 확인' })).toBeDisabled()
    await confirm(page, false); await submit(page)
    await expect(page.getByRole('status', { name: '본인 승인 설정 작업 결과' })).toContainText('금지')
    await expect(page.getByRole('button', { name: /설정 검증 회사/ })).toContainText('v3')
    expect(bodies).toEqual([{ allowSelfApproval: true, version: 1 }, { allowSelfApproval: false, version: 2 }])
})

test('read-only user sees the flag and no setting controls or setting request', async ({ page }) => {
    await mock(page, ['company.read']); let writes = 0
    await page.route(settingUrl, route => { writes++; return json(route, {}) })
    await open(page); await expect(page.getByText('본인 승인', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '본인 승인 설정', exact: true })).toHaveCount(0)
    await expect(page.getByRole('radio')).toHaveCount(0); expect(writes).toBe(0)
})

test('pending save clears password immediately and locks selection/create/name/period and duplicate submit', async ({ page }) => {
    const state = await mock(page); let calls = 0; let release: () => void = () => undefined
    await page.route(settingUrl, async route => { calls++; await new Promise<void>(resolve => { release = resolve }); state.company = { ...company, allowSelfApproval: true, version: 2 }; await json(route, state.company) })
    await open(page); await confirm(page); await submit(page)
    await expect.poll(() => calls).toBe(1)
    await expect(page.getByLabel('설정 변경용 현재 비밀번호')).toHaveValue('')
    await expect(page.getByRole('button', { name: /설정 다른 회사/ })).toBeDisabled()
    await expect(page.getByLabel('회사 이름', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('새 회사 이름')).toBeDisabled()
    await expect(page.getByLabel('시작일', { exact: true })).toBeDisabled()
    await page.getByLabel('설정 변경용 현재 비밀번호').evaluate(input => input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(calls).toBe(1); release()
    await expect(page.getByRole('status', { name: '본인 승인 설정 작업 결과' })).toContainText('허용')
    await expect(page.getByRole('button', { name: /설정 다른 회사/ })).toBeEnabled()
})

test('wrong password 401 keeps session, clears input and never sends the setting PATCH', async ({ page }) => {
    await mock(page); let writes = 0
    await page.route('**/api/auth/reauthenticate', route => json(route, { code: 'UNAUTHORIZED' }, 401))
    await page.route(settingUrl, route => { writes++; return json(route, company) })
    await open(page); await confirm(page); await submit(page)
    await expect(page.getByRole('alert')).toContainText('비밀번호를 확인하지 못했습니다')
    await expect(page.getByLabel('설정 변경용 현재 비밀번호')).toHaveValue('')
    await expect(page).toHaveURL(/\/companies$/); expect(writes).toBe(0)
    const storage = await page.evaluate(() => JSON.stringify({ history: history.state, local: { ...localStorage }, session: { ...sessionStorage }, html: document.body.innerHTML }))
    expect(storage).not.toContain(password)
})

test('real session expiry during reauthentication returns to login', async ({ page }) => {
    const state = await mock(page)
    await page.route('**/api/auth/reauthenticate', route => { state.expired = true; return json(route, { code: 'UNAUTHORIZED' }, 401) })
    await open(page); await confirm(page); await submit(page)
    await expect(page).toHaveURL(/\/login$/)
})

test('409 drops confirmation, reselects current version and current permissions', async ({ page }) => {
    const state = await mock(page)
    await page.route(settingUrl, route => { state.company = { ...company, version: 2 }; state.permissions = ['company.read']; return json(route, { code: 'CONFLICT' }, 409) })
    await open(page); await confirm(page); await submit(page)
    await expect(page.getByRole('heading', { name: '본인 승인 설정 변경 확인' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '본인 승인 설정', exact: true })).toHaveCount(0)
    await expect(page.getByText('2', { exact: true })).toBeVisible()
    expect(state.selects).toBe(2)
})

test('409 with unchanged INTEGER-max version still discards the target without automatically saving', async ({ page }) => {
    const state = await mock(page); state.company.version = 2147483647; let writes = 0
    await page.route(settingUrl, route => { writes++; expect(route.request().postDataJSON()).toEqual({ allowSelfApproval: true, version: 2147483647 }); return json(route, { code: 'CONFLICT' }, 409) })
    await open(page); await confirm(page); await submit(page)
    await expect(page.getByRole('heading', { name: '본인 승인 설정 변경 확인' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '변경 확인' })).toBeDisabled(); expect(writes).toBe(1)
})

test('a name update shares version and discards the previously opened setting confirmation', async ({ page }) => {
    const state = await mock(page)
    await page.route(`**/api/companies/${companyId}`, route => { expect(route.request().postDataJSON()).toEqual({ name: '설정 검증 회사 새 이름', version: 1 }); state.company = { ...company, name: '설정 검증 회사 새 이름', version: 2 }; return json(route, state.company) })
    await open(page); await confirm(page)
    await page.getByLabel('새 회사 이름').fill('설정 검증 회사 새 이름'); await page.getByRole('button', { name: '이름 저장' }).click()
    await expect(page.getByRole('heading', { name: '본인 승인 설정 변경 확인' })).toHaveCount(0)
    await confirm(page); await expect(page.getByText('금지 → 허용 · 확인 버전 2')).toBeVisible()
})

for (const status of [403, 404]) {
    test(`setting ${status} clears inaccessible workspace and refreshes company list`, async ({ page }) => {
        const state = await mock(page)
        await page.route(settingUrl, route => { state.permissions = ['company.read']; return json(route, { code: 'DENIED' }, status) })
        await open(page); await confirm(page); await submit(page)
        await expect(page.getByRole('heading', { name: '관리할 회사를 선택하세요' })).toBeVisible()
        await expect(page.getByRole('heading', { name: '본인 승인 설정', exact: true })).toHaveCount(0)
        await expect(page.getByRole('alert')).toContainText('접근 가능한 회사 목록')
    })
}

for (const status of [400, 429]) {
    test(`setting ${status} shows fixed text, clears password and waits for explicit retry`, async ({ page }) => {
        await mock(page); let writes = 0
        await page.route(settingUrl, route => { writes++; return json(route, { code: 'FAILED', details: [{ message: password }] }, status) })
        await open(page); await confirm(page); await submit(page)
        await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('alert')).not.toContainText(password)
        await expect(page.getByLabel('설정 변경용 현재 비밀번호')).toHaveValue(''); expect(writes).toBe(1)
    })
}

for (const status of [503, 0]) {
    test(`uncertain ${status} blocks resave until readback even if the server committed`, async ({ page }) => {
        const state = await mock(page); let writes = 0
        await page.route(settingUrl, route => {
            writes++; const body = route.request().postDataJSON(); state.company = { ...state.company, allowSelfApproval: body.allowSelfApproval, version: state.company.version + 1 }
            return writes === 1 ? status ? json(route, { code: 'FAILED' }, status) : route.abort('failed') : json(route, state.company)
        })
        await open(page); await confirm(page); await submit(page)
        await expect(page.getByRole('alert')).toContainText('저장 결과를')
        await expect(page.getByRole('radio')).toHaveCount(0)
        await expect(page.getByLabel('새 회사 이름')).toBeDisabled()
        expect(writes).toBe(1)
        await page.getByRole('button', { name: '최신 회사 다시 확인' }).click()
        await expect(page.getByText('현재 설정:', { exact: false })).toContainText('허용')
        await expect(page.getByRole('button', { name: '변경 확인' })).toBeDisabled(); expect(writes).toBe(1)
        await confirm(page, false); await submit(page)
        await expect(page.getByRole('status', { name: '본인 승인 설정 작업 결과' })).toContainText('금지'); expect(writes).toBe(2)
    })
}

test('failed readback stays blocked and a subsequent permission denial clears stale details', async ({ page }) => {
    await mock(page)
    await page.route(settingUrl, route => route.abort('failed'))
    await open(page); await confirm(page); await submit(page)
    let status = 503
    await page.route(`**/api/companies/${companyId}/select`, route => json(route, { code: 'FAILED' }, status))
    await page.getByRole('button', { name: '최신 회사 다시 확인' }).click()
    await expect(page.getByRole('alert')).toContainText('최신 회사 상태를 확인하지 못했습니다')
    await expect(page.getByRole('radio')).toHaveCount(0)
    status = 403; await page.getByRole('button', { name: '최신 회사 다시 확인' }).click()
    await expect(page.getByRole('heading', { name: '관리할 회사를 선택하세요' })).toBeVisible()
})

test('company change clears the old confirmation and password', async ({ page }) => {
    await mock(page); await open(page); await confirm(page)
    await page.getByLabel('설정 변경용 현재 비밀번호').fill(password)
    await page.getByRole('button', { name: /설정 다른 회사/ }).click()
    await expect(page.getByRole('heading', { name: '본인 승인 설정 변경 확인' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '설정 다른 회사', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /설정 검증 회사/ }).click()
    await confirm(page); await expect(page.getByLabel('설정 변경용 현재 비밀번호')).toHaveValue('')
})

for (const width of [375, 768, 1440]) {
    test(`setting confirmation is keyboard accessible and fits ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 }); await mock(page); await open(page)
        await confirm(page); await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: '변경 확인' })).toBeFocused()
        await page.keyboard.press('Enter'); await expect(page.getByRole('heading', { name: '본인 승인 설정 변경 확인' })).toBeFocused()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: resolve(proof, `company-settings-${width}.png`), fullPage: true })
    })
}
