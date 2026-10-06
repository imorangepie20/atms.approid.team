import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CompanyRole, CompanyView, CounterpartyView } from '../../src/lib/api'

// [F02 T1~T8] 사용자 동작/접근 가능한 이름과 실제 HTTP 요청을 검사한다. React state 자체는 검사하지 않는다.
const proof = resolve('.artifacts/implementation-f02-counterparties-browser')
mkdirSync(proof, { recursive: true })
const a = '10000000-0000-4000-8000-000000000001', b = '10000000-0000-4000-8000-000000000002'
const uid = (n: number) => `50000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const session = { user: { id: uid(700), email: 'counterparty@example.invalid' }, csrfToken: 'a'.repeat(64), idleExpiresAt: '2026-10-06T23:00:00.000Z', absoluteExpiresAt: '2026-10-07T23:00:00.000Z' }
const companies: CompanyView[] = [a, b].map((id, i) => ({ id, name: i ? '다른 회사' : '거래처 검증 회사', currency: 'KRW', accountingStandard: '일반기업회계기준', allowSelfApproval: false, version: 1 }))
const row = (n: number, data: Partial<CounterpartyView> = {}): CounterpartyView => ({ id: uid(n), companyId: a, name: `거래처 ${n}`, kind: 'BOTH', businessNumber: null, contactName: null, email: null, phone: null, address: null, memo: null, active: true, version: 1, createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z', ...data })
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
async function fixture(page: Page, options: { roles?: CompanyRole[]; write?: boolean; rows?: CounterpartyView[]; companies?: CompanyView[] } = {}) {
    const state = { items: options.rows ?? [row(1), row(2, { active: false })], reads: [] as URL[], creates: [] as Record<string, unknown>[], changes: [] as Record<string, unknown>[], deactivations: [] as Record<string, unknown>[], selects: [] as string[] }
    await page.route('**/api/auth/session', route => json(route, session))
    await page.route('**/api/companies?*', route => json(route, { items: options.companies ?? companies, nextCursor: null }))
    await page.route('**/api/companies/*/select', route => {
        expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
        const id = new URL(route.request().url()).pathname.split('/').at(-2)!
        state.selects.push(id)
        return json(route, { company: (options.companies ?? companies).find(item => item.id === id), roles: options.roles ?? ['ACCOUNTANT'], permissions: options.write === false ? ['company.read', 'counterparties.read'] : ['company.read', 'counterparties.read', 'counterparties.write'] })
    })
    await page.route('**/api/companies/*/counterparties**', async route => {
        const url = new URL(route.request().url()), parts = url.pathname.split('/'), companyId = parts[3], id = parts[5], method = route.request().method()
        if (method === 'GET' && !id) {
            state.reads.push(url)
            expect(url.searchParams.get('limit')).toBe('20')
            const q = url.searchParams.get('q'), kind = url.searchParams.get('kind'), active = url.searchParams.get('active'), cursor = url.searchParams.get('cursor')
            let items = state.items.filter(item => item.companyId === companyId && (active === 'all' || item.active === (active === 'active')) && (!kind || item.kind === kind || (kind !== 'BOTH' && item.kind === 'BOTH')) && (!q || item.name.includes(q) || (item.businessNumber?.includes(q.replaceAll('-', '')) ?? false)))
            items = items.sort((left, right) => left.id.localeCompare(right.id)).filter(item => !cursor || item.id > cursor)
            return json(route, { items: items.slice(0, 20), nextCursor: items.length > 20 ? items[19].id : null })
        }
        if (method === 'GET') return json(route, state.items.find(item => item.id === id && item.companyId === companyId) ?? { code: 'NOT_FOUND' }, state.items.some(item => item.id === id && item.companyId === companyId) ? 200 : 404)
        expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
        const body = route.request().postDataJSON()
        if (!id) {
            state.creates.push(body); const { creationRequestId: _requestId, ...fields } = body
            const item = row(999, { ...fields, companyId }); state.items.push(item); return json(route, { counterparty: item, created: true })
        }
        const item = state.items.find(item => item.id === id)!
        if (parts[6] === 'deactivate') { state.deactivations.push(body); item.active = false; item.version++; return json(route, item) }
        state.changes.push(body); Object.assign(item, body, { version: item.version + 1 }); return json(route, item)
    })
    await page.goto('/accounting/counterparties')
    await expect(page.getByRole('heading', { name: '거래처', exact: true })).toBeVisible()
    return state
}
async function select(page: Page, id = a) { await page.getByLabel('관리할 회사').selectOption(id); await expect(page.getByRole('heading', { name: '거래처 목록' })).toBeVisible(); await expect(page.getByText('거래처 목록 갱신 중…')).toHaveCount(0) }
async function createForm(page: Page) { await page.getByRole('button', { name: '새 거래처 등록' }).click(); await expect(page.getByRole('heading', { name: '거래처 등록', exact: true })).toBeVisible() }
async function fill(page: Page, name = '등록 거래처') { await page.getByLabel('거래처 이름 (필수)').fill(name); await page.getByLabel('구분 (필수)').selectOption('BOTH') }
async function openDetail(page: Page, name = '거래처 1') { await page.getByRole('button', { name: `${name} 상세`, exact: true }).click(); await expect(page.getByRole('heading', { name, exact: true })).toBeVisible() }

test('company explicit selection and protected route never loads counterparties before selection', async ({ page }) => {
    const state = await fixture(page); expect(state.selects).toEqual([]); expect(state.reads).toEqual([])
    await select(page); expect(state.selects).toEqual([a]); expect(state.reads[0].searchParams.get('active')).toBe('active')
    await page.reload(); await expect(page.getByLabel('관리할 회사')).toHaveValue(''); expect(state.selects).toEqual([a])
})
test('company empty state remains visible without a default company', async ({ page }) => {
    await page.route('**/api/auth/session', route => json(route, session)); await page.route('**/api/companies?*', route => json(route, { items: [], nextCursor: null }))
    await page.goto('/accounting/counterparties'); await expect(page.getByRole('heading', { name: '접근 가능한 회사가 없습니다' })).toBeVisible()
})
test('company pagination exposes a company beyond the first hundred', async ({ page }) => {
    const items = Array.from({ length: 101 }, (_, i) => ({ ...companies[0], id: uid(1000 + i), name: `회사 ${i + 1}` }))
    await fixture(page, { companies: items })
    await page.route('**/api/companies?*', route => { const url = new URL(route.request().url()); expect(url.searchParams.get('limit')).toBe('100'); return json(route, url.searchParams.has('cursor') ? { items: items.slice(100), nextCursor: null } : { items: items.slice(0, 100), nextCursor: items[99].id }) })
    await page.reload(); await page.getByRole('button', { name: '회사 더 불러오기' }).click(); await select(page, items[100].id); await expect(page.getByLabel('관리할 회사')).toHaveValue(items[100].id)
})
test('company late select response cannot replace the newly selected company', async ({ page }) => {
    await fixture(page)
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve })
    await page.route(`**/api/companies/${a}/select`, async route => { await pending; await json(route, { company: companies[0], roles: ['ACCOUNTANT'], permissions: ['counterparties.read', 'counterparties.write'] }) })
    await page.getByLabel('관리할 회사').selectOption(a); await expect(page.getByText('회사 권한을 확인하는 중입니다.')).toBeVisible()
    await page.getByLabel('관리할 회사').selectOption(b); await expect(page.getByRole('heading', { name: '거래처 목록' })).toBeVisible(); release()
    await expect(page.getByLabel('관리할 회사')).toHaveValue(b); await expect(page.getByRole('button', { name: '거래처 1 상세' })).toHaveCount(0)
})
for (const roles of [['COMPANY_ADMIN'], ['ACCOUNTANT'], ['APPROVER'], ['READ_ONLY'], ['EXTERNAL_TAX'], ['READ_ONLY', 'ACCOUNTANT']] as CompanyRole[][]) {
    test(`role permissions ${roles.join('+')} use current company response`, async ({ page }) => {
        const write = roles.some(role => ['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role))
        await fixture(page, { roles, write }); await select(page); await openDetail(page)
        await expect(page.getByRole('button', { name: '새 거래처 등록' })).toHaveCount(write ? 1 : 0)
        await expect(page.getByRole('button', { name: '거래처 수정', exact: true })).toHaveCount(write ? 1 : 0)
        await expect(page.getByRole('button', { name: '사용 중지', exact: true })).toHaveCount(write ? 1 : 0)
    })
}
test('list server filters include BOTH, query numbers, inactive and empty results', async ({ page }) => {
    const state = await fixture(page, { rows: [row(1, { kind: 'CUSTOMER', businessNumber: '1234567890' }), row(2), row(3, { kind: 'SUPPLIER' }), row(4, { active: false })] }); await select(page)
    await page.getByLabel('구분 필터').selectOption('CUSTOMER'); await expect(page.getByRole('button', { name: '거래처 2 상세' })).toBeVisible(); await expect(page.getByRole('button', { name: '거래처 3 상세' })).toHaveCount(0)
    await page.getByLabel('거래처 검색').fill('123-45'); await page.getByRole('button', { name: '검색', exact: true }).click(); await expect(page.getByRole('button', { name: '거래처 1 상세' })).toBeVisible(); await expect(page.getByRole('button', { name: '거래처 2 상세' })).toHaveCount(0)
    expect(state.reads.at(-1)?.searchParams.get('q')).toBe('123-45')
    await page.getByLabel('거래처 검색').fill(''); await page.getByRole('button', { name: '검색', exact: true }).click(); await page.getByLabel('구분 필터').selectOption(''); await page.getByLabel('사용 상태').selectOption('inactive'); await expect(page.getByRole('button', { name: '거래처 4 상세' })).toBeVisible()
    await page.getByLabel('거래처 검색').fill('없는 값'); await page.getByRole('button', { name: '검색', exact: true }).click(); await expect(page.getByText('검색 조건과 일치하는 거래처가 없습니다.')).toBeVisible()
})
test('list cursor previous next and filter resets page and selected detail', async ({ page }) => {
    const state = await fixture(page, { rows: Array.from({ length: 22 }, (_, i) => row(i + 1)) }); await select(page)
    await page.getByRole('button', { name: '다음 페이지', exact: true }).click(); await expect(page.getByText('2페이지', { exact: true })).toBeVisible(); await openDetail(page, '거래처 21')
    expect(state.reads.at(-1)?.searchParams.get('cursor')).toBe(uid(20))
    await page.getByLabel('구분 필터').selectOption('BOTH'); await expect(page.getByText('1페이지', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: '거래처 21', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '다음 페이지', exact: true }).click(); await page.getByRole('button', { name: '이전 페이지', exact: true }).click(); await expect(page.getByText('1페이지', { exact: true })).toBeVisible()
})
test('create normalizes Unicode code points nullable fields number and CSRF with a UUID', async ({ page }) => {
    const state = await fixture(page); await select(page); await createForm(page); await fill(page, ' 😀 '.trim().repeat(100))
    await page.getByLabel('사업자번호', { exact: true }).fill(' 123-45-67890 '); await page.getByLabel('담당자', { exact: true }).fill('  담당자  '); await page.getByLabel('메모', { exact: true }).fill('  ')
    await page.getByRole('button', { name: '거래처 등록 저장' }).click(); await expect(page.getByRole('heading', { name: '😀'.repeat(100), exact: true })).toBeVisible()
    const payload = state.creates[0]; expect(payload.creationRequestId).toMatch(/^[0-9a-f-]{36}$/); expect(payload.businessNumber).toBe('1234567890'); expect(payload.contactName).toBe('담당자'); expect(payload.memo).toBeNull(); expect(payload.phone).toBeNull(); expect(payload).not.toHaveProperty('companyId')
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('담당자'); expect(page.url()).not.toContain('1234567890')
})
test('create double submit locks fields company filters and sends only one request', async ({ page }) => {
    await fixture(page); await select(page); await createForm(page); await fill(page)
    let count = 0, release!: () => void; const pending = new Promise<void>(resolve => { release = resolve })
    await page.route(`**/api/companies/${a}/counterparties`, async route => { count++; await pending; await json(route, { counterparty: row(999, { name: '등록 거래처' }), created: true }) })
    await page.getByRole('button', { name: '거래처 등록 저장' }).click(); await expect(page.getByLabel('관리할 회사')).toBeDisabled(); await expect(page.getByLabel('거래처 이름 (필수)')).toBeDisabled(); await expect(page.getByLabel('사용 상태')).toBeDisabled(); expect(count).toBe(1)
    release(); await expect(page.getByRole('heading', { name: '등록 거래처', exact: true })).toBeVisible(); expect(count).toBe(1)
})
test('create lost response retries only the identical request and shows current replay', async ({ page }) => {
    await fixture(page); await select(page); await createForm(page); await fill(page)
    const bodies: unknown[] = []
    await page.route(`**/api/companies/${a}/counterparties`, route => { bodies.push(route.request().postDataJSON()); return bodies.length === 1 ? route.abort('failed') : json(route, { counterparty: row(999, { name: '수정된 현재 거래처', version: 2 }), created: false }) })
    await page.getByRole('button', { name: '거래처 등록 저장' }).click(); await expect(page.getByRole('button', { name: '같은 등록 요청 다시 시도' })).toBeVisible(); await expect(page.getByLabel('거래처 이름 (필수)')).toBeDisabled()
    await page.waitForLoadState('networkidle'); expect(bodies).toHaveLength(1)
    await page.getByRole('button', { name: '같은 등록 요청 다시 시도' }).click(); await expect(page.getByRole('heading', { name: '수정된 현재 거래처', exact: true })).toBeVisible(); expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1])
})
test('create draft company switch and cancellation require explicit discard', async ({ page }) => {
    await fixture(page); await select(page); await createForm(page); await fill(page); await page.getByLabel('관리할 회사').selectOption(b)
    await expect(page.getByRole('button', { name: '입력 폐기 후 계속' })).toBeVisible(); await page.getByRole('button', { name: '계속 입력' }).click(); await expect(page.getByLabel('관리할 회사')).toHaveValue(a); await expect(page.getByLabel('거래처 이름 (필수)')).toHaveValue('등록 거래처')
    await page.getByRole('button', { name: '입력 취소' }).click(); await page.getByRole('button', { name: '입력 폐기 후 계속' }).click(); await expect(page.getByRole('heading', { name: '거래처 등록', exact: true })).toHaveCount(0)
})

for (const [label, value] of [['거래처 이름 (필수)', '😀'.repeat(101)], ['사업자번호', '123'], ['담당자', '가'.repeat(101)], ['이메일', 'invalid'], ['전화', '1'.repeat(41)], ['주소', '가'.repeat(301)], ['메모', '가'.repeat(1001)]]) {
    test(`input validation ${label} focuses summary with inline field errors`, async ({ page }) => {
        const state = await fixture(page); await select(page); await createForm(page); await fill(page); await page.getByLabel(label, { exact: true }).fill(value)
        await page.getByRole('button', { name: '거래처 등록 저장' }).click(); await expect(page.locator('form').last().getByRole('alert')).toBeFocused(); await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-invalid', 'true'); expect(state.creates).toEqual([])
    })
}
test('input required name and kind are not silently defaulted', async ({ page }) => {
    const state = await fixture(page); await select(page); await createForm(page); await page.getByRole('button', { name: '거래처 등록 저장' }).click()
    await expect(page.getByLabel('거래처 이름 (필수)')).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByLabel('구분 (필수)')).toHaveAttribute('aria-invalid', 'true'); expect(state.creates).toHaveLength(0)
})
for (const status of [400, 409, 429, 503]) {
    test(`create safe error ${status} preserves or freezes explicit retry input`, async ({ page }) => {
        await fixture(page); await select(page); await createForm(page); await fill(page)
        let count = 0; await page.route(`**/api/companies/${a}/counterparties`, route => { count++; return json(route, { code: 'REQUEST_FAILED', details: [{ message: 'DO_NOT_DISPLAY_RAW_VALUE' }] }, status) })
        await page.getByRole('button', { name: '거래처 등록 저장' }).click(); await expect(page.getByLabel('거래처 이름 (필수)')).toHaveValue('등록 거래처')
        if (status >= 500) { await expect(page.getByRole('button', { name: '같은 등록 요청 다시 시도' })).toBeVisible(); await expect(page.getByLabel('거래처 이름 (필수)')).toBeDisabled() }
        else await expect(page.getByRole('button', { name: '거래처 등록 저장' })).toBeEnabled()
        await expect(page.getByText('DO_NOT_DISPLAY_RAW_VALUE')).toHaveCount(0); await page.waitForLoadState('networkidle'); expect(count).toBe(1)
    })
}
test('create forbidden rechecks fresh permissions and removes write forms', async ({ page }) => {
    await fixture(page); await select(page); await createForm(page); await fill(page)
    await page.route(`**/api/companies/${a}/counterparties`, route => json(route, { code: 'FORBIDDEN' }, 403))
    await page.route(`**/api/companies/${a}/select`, route => json(route, { company: companies[0], roles: ['READ_ONLY'], permissions: ['counterparties.read'] }))
    await page.getByRole('button', { name: '거래처 등록 저장' }).click(); await expect(page.getByText('현재 회사 권한을 다시 확인했습니다.')).toBeVisible(); await expect(page.getByRole('button', { name: '새 거래처 등록' })).toHaveCount(0)
})
test('create session expiry clears draft and returns to login', async ({ page }) => {
    await fixture(page); await select(page); await createForm(page); await fill(page)
    await page.route(`**/api/companies/${a}/counterparties`, route => json(route, { code: 'UNAUTHENTICATED' }, 401))
    await page.getByRole('button', { name: '거래처 등록 저장' }).click(); await expect(page.getByRole('heading', { name: '계정 로그인' })).toBeVisible(); await expect(page.getByLabel('거래처 이름 (필수)')).toHaveCount(0)
})
test('edit only changed fields uses latest version and no-op sends nothing', async ({ page }) => {
    const state = await fixture(page); await select(page); await openDetail(page); await page.getByRole('button', { name: '거래처 수정', exact: true }).click()
    await page.getByRole('button', { name: '거래처 수정 저장' }).click(); await expect(page.getByText('변경된 값이 없습니다.')).toBeVisible(); expect(state.changes).toHaveLength(0)
    await page.getByLabel('전화', { exact: true }).fill(' 010-0000-0000 '); await page.getByRole('button', { name: '거래처 수정 저장' }).click(); await expect(page.getByText('사용중 · 버전 2')).toBeVisible(); expect(state.changes).toEqual([{ version: 1, phone: '010-0000-0000' }])
    await page.getByRole('button', { name: '거래처 수정', exact: true }).click(); await page.getByLabel('전화', { exact: true }).fill(' '); await page.getByRole('button', { name: '거래처 수정 저장' }).click(); await expect(page.getByText('사용중 · 버전 3')).toBeVisible(); expect(state.changes[1]).toEqual({ version: 2, phone: null })
})
test('edit conflict discards old draft reloads latest and never auto overwrites', async ({ page }) => {
    const state = await fixture(page); await select(page); await openDetail(page); await page.getByRole('button', { name: '거래처 수정', exact: true }).click(); await page.getByLabel('거래처 이름 (필수)').fill('이전 초안')
    const requests: Record<string, unknown>[] = []
    await page.route(`**/api/companies/${a}/counterparties/${uid(1)}`, route => {
        if (route.request().method() !== 'PATCH') return route.fallback()
        requests.push(route.request().postDataJSON())
        if (requests.length === 1) { state.items[0].name = '먼저 저장된 이름'; state.items[0].version = 2; return json(route, { code: 'CONFLICT' }, 409) }
        return route.fallback()
    })
    await page.getByRole('button', { name: '거래처 수정 저장' }).click(); await expect(page.getByRole('heading', { name: '먼저 저장된 이름', exact: true })).toBeVisible(); await expect(page.getByLabel('거래처 이름 (필수)')).toHaveCount(0)
    await page.waitForLoadState('networkidle'); expect(requests).toEqual([{ version: 1, name: '이전 초안' }])
    await page.getByRole('button', { name: '거래처 수정', exact: true }).click(); await page.getByLabel('거래처 이름 (필수)').fill('새 입력'); await page.getByRole('button', { name: '거래처 수정 저장' }).click(); await expect(page.getByRole('heading', { name: '새 입력', exact: true })).toBeVisible(); expect(requests[1]).toEqual({ version: 2, name: '새 입력' })
})
for (const status of [400, 404, 429, 503, 0]) {
    test(`edit error ${status} has safe feedback and no automatic mutation retry`, async ({ page }) => {
        await fixture(page); await select(page); await openDetail(page); await page.getByRole('button', { name: '거래처 수정', exact: true }).click(); await page.getByLabel('메모', { exact: true }).fill('수정 초안')
        let count = 0; await page.route(`**/api/companies/${a}/counterparties/${uid(1)}`, route => {
            if (route.request().method() !== 'PATCH') return route.fallback()
            count++; return status ? json(route, { code: 'REQUEST_FAILED', details: [{ message: 'HIDDEN_RAW_ERROR' }] }, status) : route.abort('failed')
        })
        await page.getByRole('button', { name: '거래처 수정 저장' }).click()
        if (!status || status >= 500) await expect(page.getByRole('heading', { name: '거래처 1', exact: true })).toBeVisible()
        else await expect(page.getByRole('button', { name: '거래처 수정 저장' })).toBeEnabled()
        await page.waitForLoadState('networkidle'); expect(count).toBe(1); await expect(page.getByText('HIDDEN_RAW_ERROR')).toHaveCount(0)
    })
}
test('deactivate inline confirmation cancel and preserve ID without inactive editing', async ({ page }) => {
    const state = await fixture(page); await select(page); await openDetail(page)
    await page.getByRole('button', { name: '사용 중지', exact: true }).click(); await page.getByRole('button', { name: '중지 취소' }).click(); expect(state.deactivations).toHaveLength(0)
    await page.getByRole('button', { name: '사용 중지', exact: true }).click(); await page.getByRole('button', { name: '사용 중지 확인' }).click(); await expect(page.getByText('중지 · 버전 2')).toBeVisible(); expect(state.items[0].id).toBe(uid(1)); expect(state.deactivations).toEqual([{ version: 1 }])
    await expect(page.getByRole('button', { name: '거래처 수정', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: '거래처 1 상세' })).toHaveCount(0)
})
for (const status of [409, 503, 0]) {
    test(`deactivate error ${status} reloads detail and never automatically reposts`, async ({ page }) => {
        await fixture(page); await select(page); await openDetail(page)
        let count = 0; await page.route(`**/api/companies/${a}/counterparties/${uid(1)}/deactivate`, route => { count++; return status ? json(route, { code: 'REQUEST_FAILED' }, status) : route.abort('failed') })
        await page.getByRole('button', { name: '사용 중지', exact: true }).click(); await page.getByRole('button', { name: '사용 중지 확인' }).click(); await expect(page.getByRole('heading', { name: '거래처 1', exact: true })).toBeVisible(); await page.waitForLoadState('networkidle'); expect(count).toBe(1)
    })
}
test('list and detail failure retry loaders are distinct from empty data', async ({ page }) => {
    await fixture(page)
    let count = 0; await page.route(`**/api/companies/${a}/counterparties?*`, route => ++count === 1 ? json(route, { code: 'UNAVAILABLE' }, 503) : route.fallback())
    await select(page); await expect(page.getByRole('heading', { name: '거래처 목록을 불러오지 못했습니다' })).toBeVisible(); await expect(page.getByText('등록된 사용중 거래처가 없습니다.')).toHaveCount(0); await page.getByRole('button', { name: '다시 시도', exact: true }).click(); await openDetail(page)
    await page.route(`**/api/companies/${a}/counterparties/${uid(1)}`, route => json(route, { code: 'NOT_FOUND' }, 404))
    await page.getByRole('button', { name: '거래처 1 상세' }).click(); await page.reload(); await select(page); await page.getByRole('button', { name: '거래처 1 상세' }).click(); await expect(page.getByRole('heading', { name: '거래처 상세를 불러오지 못했습니다' })).toBeVisible()
})
test('list forbidden and revoked membership clears company scope cache and forms', async ({ page }) => {
    await fixture(page); await select(page)
    await page.route(`**/api/companies/${a}/counterparties?*`, route => json(route, { code: 'FORBIDDEN' }, 403)); await page.route(`**/api/companies/${a}/select`, route => json(route, { code: 'FORBIDDEN' }, 403))
    await page.getByRole('button', { name: '목록 다시 조회' }).click(); await expect(page.getByLabel('관리할 회사')).toHaveValue(''); await expect(page.getByRole('heading', { name: '거래처 목록' })).toHaveCount(0); await expect(page.getByRole('button', { name: '새 거래처 등록' })).toHaveCount(0)
})
test('list session expiry redirects with original protected route', async ({ page }) => {
    await fixture(page); await page.route(`**/api/companies/${a}/counterparties?*`, route => json(route, { code: 'UNAUTHENTICATED' }, 401)); await page.getByLabel('관리할 회사').selectOption(a); await expect(page.getByRole('heading', { name: '계정 로그인' })).toBeVisible()
})
for (const width of [375, 768, 1440]) {
    test(`responsive keyboard labeled forms and clean screenshots ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 960 }); await fixture(page); await select(page); await openDetail(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: resolve(proof, `counterparties-${width}.png`), fullPage: true })
        await page.getByRole('button', { name: '새 거래처 등록' }).click(); await page.getByRole('button', { name: '거래처 등록 저장' }).click(); await expect(page.locator('form').last().getByRole('alert')).toBeFocused()
        await page.getByLabel('거래처 이름 (필수)').focus(); await page.keyboard.type('키보드 등록'); await page.keyboard.press('Tab'); await expect(page.getByLabel('사업자번호', { exact: true })).toBeFocused()
        await page.getByLabel('구분 (필수)').selectOption('CUSTOMER'); await page.getByLabel('거래처 이름 (필수)').fill(''); await page.getByRole('button', { name: '거래처 등록 저장' }).click()
        for (const label of ['거래처 이름 (필수)', '사업자번호', '담당자', '이메일', '전화', '주소', '메모', '구분 (필수)']) await expect(page.getByLabel(label, { exact: true })).toBeVisible()
        const buttons = await page.getByRole('button', { name: '거래처 등록 저장' }).boundingBox(); expect(buttons!.height).toBeGreaterThanOrEqual(44)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const summaryBox = await page.locator('form').last().getByRole('alert').boundingBox(); expect(summaryBox!.y).toBeGreaterThanOrEqual(64); expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(960)
        await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
        await page.screenshot({ path: resolve(proof, `counterparty-form-${width}.png`), fullPage: true })
        // 기존 외형 설정이 새 거래처 화면에도 유지되고 큰 글자에서 가로 넘침이 없는지 확인한다.
        await page.goto('/settings?section=appearance'); await page.getByLabel('Light', { exact: true }).locator('..').click()
        await page.getByLabel('Indigo', { exact: true }).locator('..').click(); await page.getByLabel('large', { exact: true }).locator('..').click()
        await page.goto('/accounting/counterparties'); await select(page); await createForm(page)
        await expect(page.locator('html')).not.toHaveClass(/dark/); await expect(page.locator('html')).toHaveAttribute('data-accent', 'indigo'); await expect(page.locator('html')).toHaveCSS('font-size', '18px')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.getByRole('button', { name: '다크 테마로 변경' }).click(); await expect(page.locator('html')).toHaveClass(/dark/)
        await page.goto('/settings?section=appearance'); await page.getByLabel('System', { exact: true }).locator('..').click(); await page.emulateMedia({ colorScheme: 'light' })
        await page.goto('/accounting/counterparties'); await select(page); await expect(page.locator('html')).not.toHaveClass(/dark/)
        await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('html')).toHaveClass(/dark/)
    })
}
