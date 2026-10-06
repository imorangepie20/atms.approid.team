import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CompanyRole, CompanyView, CounterpartyView, EvidenceRequestStatus, EvidenceView } from '../../src/lib/api'

// [F03 B1~B7] 브라우저의 실제 라우팅·HTTP 본문·다운로드·키보드 동작을 검사한다. 실제 R2/DB는 별도 통합 단계에서 확인한다.
const proof = resolve('.artifacts/implementation-f03-evidence-browser')
mkdirSync(proof, { recursive: true })
const a = '10000000-0000-4000-8000-000000000001', b = '10000000-0000-4000-8000-000000000002'
const uid = (n: number) => `60000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const session = { user: { id: uid(700), email: 'evidence@example.invalid' }, csrfToken: 'b'.repeat(64), idleExpiresAt: '2026-10-06T23:00:00Z', absoluteExpiresAt: '2026-10-07T23:00:00Z' }
const companies: CompanyView[] = [a, b].map((id, i) => ({ id, name: i ? '다른 회사' : '증빙 검증 회사', currency: 'KRW', accountingStandard: '일반기업회계기준', allowSelfApproval: false, version: 1 }))
const counterparty = (n: number): CounterpartyView => ({ id: uid(500 + n), companyId: a, name: `거래처 ${n}`, kind: 'BOTH', businessNumber: null, contactName: null, email: null, phone: null, address: null, memo: null, active: true, version: 1, createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z' })
const row = (n: number, data: Partial<EvidenceView> = {}): EvidenceView => ({ id: uid(n), companyId: a, kind: 'RECEIPT', title: `증빙 ${n}`, occurredOn: null,
    counterpartyId: null, originalFileName: `source-${n}.pdf`, mediaType: 'application/pdf', byteSize: 14, createdById: session.user.id, createdAt: '2026-10-06T00:00:00Z', ...data })
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
type Mode = 'ok' | 'lost-ready' | 'lost-failed' | 'invalid' | 'forbidden' | 'too-large' | 'rate-limited' | 'conflict' | 'offline'
async function fixture(page: Page, options: { roles?: CompanyRole[]; companies?: CompanyView[]; items?: EvidenceView[]; mode?: Mode } = {}) {
    const state = { items: options.items ?? [row(1)], mode: options.mode ?? 'ok' as Mode, calls: [] as string[], reads: [] as URL[], status: null as EvidenceRequestStatus | null, selects: [] as string[] }
    // [F03 V5] 배포 주소에서도 fixture가 지정하지 않은 API를 차단한다. 실제 쓰기 요청으로 흘러가지 않는다.
    await page.route('**/api/**', route => json(route, { code: 'MOCK_ONLY' }, 503))
    await page.route('**/api/auth/session', route => json(route, session))
    await page.route('**/api/companies?*', route => json(route, { items: options.companies ?? companies, nextCursor: null }))
    await page.route('**/api/companies/*/select', route => {
        const id = new URL(route.request().url()).pathname.split('/').at(-2)!
        state.selects.push(id); expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
        const roles = options.roles ?? ['ACCOUNTANT'], create = roles.some(role => ['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role))
        return json(route, { company: (options.companies ?? companies).find(item => item.id === id), roles, permissions: ['evidence.read', 'counterparties.read', ...(create ? ['evidence.create'] : [])] })
    })
    await page.route('**/api/companies/*/counterparties?*', route => json(route, { items: [counterparty(1)], nextCursor: null }))
    await page.route('**/api/companies/*/evidence**', async route => {
        const url = new URL(route.request().url()), parts = url.pathname.split('/'), companyId = parts[3], evidenceId = parts[5], method = route.request().method()
        if (parts[5] === 'requests') return json(route, state.status ?? { code: 'NOT_FOUND' }, state.status ? 200 : 404)
        if (method === 'GET' && parts[6] === 'original') return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': `attachment; filename="source.pdf"` }, body: '%PDF-1.4\n%%EOF' })
        if (method === 'GET' && evidenceId) {
            const found = state.items.find(item => item.id === evidenceId && item.companyId === companyId)
            return json(route, found ? { evidence: found } : { code: 'NOT_FOUND' }, found ? 200 : 404)
        }
        if (method === 'GET') {
            state.reads.push(url); expect(url.searchParams.get('limit')).toBe('20')
            let items = state.items.filter(item => item.companyId === companyId && (!url.searchParams.get('q') || item.title.includes(url.searchParams.get('q')!))
                && (!url.searchParams.get('kind') || item.kind === url.searchParams.get('kind')) && (!url.searchParams.get('counterpartyId') || item.counterpartyId === url.searchParams.get('counterpartyId')))
            items = items.sort((x, y) => x.id.localeCompare(y.id)).filter(item => !url.searchParams.get('cursor') || item.id > url.searchParams.get('cursor')!)
            return json(route, { items: items.slice(0, 20), nextCursor: items.length > 20 ? items[19].id : null })
        }
        expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
        expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=')
        const body = route.request().postDataBuffer()?.toString('utf8') ?? ''
        state.calls.push(body); expect(body).toContain('name="metadata"'); expect(body).toContain('name="file"')
        const requestId = body.match(/"creationRequestId":"([^"]+)"/)?.[1] ?? ''
        expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
        if (state.mode === 'invalid') return json(route, { code: 'UNPROCESSABLE_ENTITY' }, 422)
        if (state.mode === 'forbidden') return json(route, { code: 'FORBIDDEN' }, 403)
        if (state.mode === 'too-large') return json(route, { code: 'PAYLOAD_TOO_LARGE' }, 413)
        if (state.mode === 'rate-limited') return json(route, { code: 'TOO_MANY_REQUESTS' }, 429)
        if (state.mode === 'conflict') return json(route, { code: 'CONFLICT' }, 409)
        if (state.mode === 'offline') return route.abort('failed')
        const created = row(999, { title: body.match(/"title":"([^"]+)"/)?.[1] ?? '등록 증빙', companyId })
        if (state.mode === 'lost-ready') { state.items.push(created); state.status = { creationRequestId: requestId, state: 'READY', evidenceId: created.id, retryable: false, failureCode: null }; return json(route, { code: 'UNAVAILABLE' }, 503) }
        if (state.mode === 'lost-failed') { state.status = { creationRequestId: requestId, state: 'FAILED', evidenceId: null, retryable: true, failureCode: 'STORAGE_UNAVAILABLE' }; state.mode = 'ok'; return json(route, { code: 'UNAVAILABLE' }, 503) }
        state.items.push(created); state.status = { creationRequestId: requestId, state: 'READY', evidenceId: created.id, retryable: false, failureCode: null }
        return json(route, { evidence: created, created: true }, 201)
    })
    await page.goto('/accounting/evidence')
    await expect(page.getByRole('heading', { name: '증빙', exact: true })).toBeVisible()
    return state
}
async function select(page: Page, id = a) {
    await page.getByLabel('현재 회사').selectOption(id)
    await expect(page.getByRole('heading', { name: '완료 증빙' })).toBeVisible()
}
async function fill(page: Page, title = '등록 증빙') {
    await page.getByLabel('제목 *').fill(title)
    await page.getByLabel('원본 파일 *').setInputFiles({ name: 'source.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') })
}

test('protected route and explicit company selection keep evidence unread until selected', async ({ page }) => {
    const state = await fixture(page); expect(state.reads).toEqual([]); expect(state.selects).toEqual([])
    await select(page); expect(state.selects).toEqual([a]); await page.reload()
    await expect(page.getByLabel('현재 회사')).toHaveValue(''); expect(state.selects).toEqual([a])
})
test('unauthenticated direct address redirects to login', async ({ page }) => {
    await page.route('**/api/auth/session', route => json(route, { code: 'UNAUTHORIZED' }, 401))
    await page.goto('/accounting/evidence'); await expect(page).toHaveURL(/\/login$/)
})
test('company pagination exposes a company beyond the first hundred', async ({ page }) => {
    const all = Array.from({ length: 101 }, (_, n) => ({ ...companies[0], id: uid(1000 + n), name: `회사 ${n + 1}` }))
    await fixture(page, { companies: all })
    await page.route('**/api/companies?*', route => {
        const url = new URL(route.request().url()); expect(url.searchParams.get('limit')).toBe('100')
        return json(route, url.searchParams.has('cursor') ? { items: all.slice(100), nextCursor: null } : { items: all.slice(0, 100), nextCursor: all[99].id })
    })
    await page.reload(); await page.getByRole('button', { name: '회사 더 불러오기' }).click()
    await page.getByLabel('현재 회사').selectOption(all[100].id)
    await expect(page.getByLabel('현재 회사')).toHaveValue(all[100].id)
})
test('late company response cannot replace a newer selection', async ({ page }) => {
    await fixture(page)
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route(`**/api/companies/${a}/select`, async route => { await pending; await json(route, { company: companies[0], roles: ['ACCOUNTANT'], permissions: ['evidence.read', 'evidence.create', 'counterparties.read'] }) })
    await page.getByLabel('현재 회사').selectOption(a)
    await expect(page.getByText('현재 권한을 확인하는 중…')).toBeVisible()
    await page.getByLabel('현재 회사').selectOption(b)
    await expect(page.getByRole('heading', { name: '완료 증빙' })).toBeVisible(); release()
    await expect(page.getByLabel('현재 회사')).toHaveValue(b)
})
for (const roles of [['COMPANY_ADMIN'], ['ACCOUNTANT'], ['APPROVER'], ['READ_ONLY'], ['EXTERNAL_TAX'], ['READ_ONLY', 'ACCOUNTANT']] as CompanyRole[][]) {
    test(`current role ${roles.join('+')} gates create`, async ({ page }) => {
        await fixture(page, { roles }); await select(page)
        const canCreate = roles.some(role => ['COMPANY_ADMIN', 'ACCOUNTANT', 'EXTERNAL_TAX'].includes(role))
        await expect(page.getByRole('heading', { name: '증빙 등록' })).toHaveCount(canCreate ? 1 : 0)
        await expect(page.getByRole('heading', { name: '완료 증빙' })).toBeVisible()
    })
}
test('list filters, cursor and detail stay within selected company', async ({ page }) => {
    const items = Array.from({ length: 22 }, (_, n) => row(n + 1)); items.push(row(888, { companyId: b, title: '다른 회사 비밀' }))
    const state = await fixture(page, { items }); await select(page)
    await expect(page.getByText('다른 회사 비밀')).toHaveCount(0)
    await page.getByRole('button', { name: '다음 페이지' }).click(); await expect(page.getByText('2페이지')).toBeVisible()
    expect(state.reads.at(-1)?.searchParams.get('cursor')).toBe(uid(20))
    await page.getByLabel('제목 검색').fill('증빙 21'); await page.getByRole('button', { name: '검색', exact: true }).click()
    await expect(page.getByText('1페이지')).toBeVisible(); expect(state.reads.at(-1)?.searchParams.get('q')).toBe('증빙 21')
    await page.getByRole('button', { name: /증빙 21/ }).click(); await expect(page.getByRole('heading', { name: '증빙 상세' })).toBeVisible()
    await page.getByLabel('현재 회사').selectOption(b); await expect(page.getByRole('heading', { name: '증빙 상세' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /다른 회사 비밀/ })).toBeVisible()
})
test('multipart create sends only metadata/file, CSRF and one request after double click', async ({ page }) => {
    const state = await fixture(page); await select(page); await fill(page)
    await page.getByRole('button', { name: '증빙 등록', exact: true }).dblclick()
    await expect(page.getByText('완료 증빙을 저장했습니다.')).toBeVisible()
    expect(state.calls).toHaveLength(1); expect(state.calls[0]).toContain('"title":"등록 증빙"'); expect(state.calls[0]).toContain('filename="source.pdf"')
    expect(state.calls[0]).not.toContain('companyId')
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('등록 증빙')
})
test('bad file and overlong title stay client-side with announced errors', async ({ page }) => {
    const state = await fixture(page); await select(page)
    await page.getByLabel('제목 *').fill('x'.repeat(101))
    await page.getByLabel('원본 파일 *').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') })
    await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
    await expect(page.getByText('제목은 공백을 제외하고 1~100자로 입력해 주세요.')).toBeVisible()
    await expect(page.getByText(/PDF·JPEG·PNG 파일 1개/)).toBeVisible(); expect(state.calls).toHaveLength(0)
})

for (const [name, mime] of [['receipt.jpg', 'image/jpeg'], ['receipt.png', 'image/png']] as const) {
    test(`${name} original uses the selected active counterparty`, async ({ page }) => {
        const state = await fixture(page); await select(page)
        await page.getByLabel('제목 *').fill(name)
        await page.locator('#evidence-counterparty').selectOption(counterparty(1).id)
        await page.getByLabel('원본 파일 *').setInputFiles({ name, mimeType: mime, buffer: Buffer.from('image-test') })
        await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
        await expect(page.getByText('완료 증빙을 저장했습니다.')).toBeVisible()
        expect(state.calls).toHaveLength(1)
        expect(state.calls[0]).toContain(`"counterpartyId":"${counterparty(1).id}"`)
        expect(state.calls[0]).toContain(`filename="${name}"`)
    })
}

test('file larger than 10 MiB is rejected before multipart POST', async ({ page }) => {
    const state = await fixture(page); await select(page)
    await page.getByLabel('제목 *').fill('큰 파일')
    await page.getByLabel('원본 파일 *').setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10_485_761, 1) })
    await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
    await expect(page.getByText(/10MiB 이내/)).toBeVisible()
    expect(state.calls).toHaveLength(0)
})
test('uncertain completed write checks status without another POST', async ({ page }) => {
    const state = await fixture(page, { mode: 'lost-ready' }); await select(page); await fill(page)
    await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
    await expect(page.getByRole('button', { name: '등록 상태 확인' })).toBeVisible(); expect(state.calls).toHaveLength(1)
    await page.getByRole('button', { name: '등록 상태 확인' }).click()
    await expect(page.getByText('증빙 등록을 확인했습니다.')).toBeVisible(); expect(state.calls).toHaveLength(1)
})
test('FAILED retries only the identical file and request ID after explicit action', async ({ page }) => {
    const state = await fixture(page, { mode: 'lost-failed' }); await select(page); await fill(page)
    await page.getByRole('button', { name: '증빙 등록', exact: true }).click(); await page.getByRole('button', { name: '등록 상태 확인' }).click()
    await expect(page.getByRole('button', { name: '같은 내용 재시도' })).toBeVisible()
    await page.getByRole('button', { name: '같은 내용 재시도' }).click(); await expect(page.getByText('완료 증빙을 저장했습니다.')).toBeVisible()
    expect(state.calls).toHaveLength(2)
    const id = (body: string) => body.match(/"creationRequestId":"([^"]+)"/)?.[1]
    expect(id(state.calls[0])).toBe(id(state.calls[1])); expect(state.calls[0]).toContain('filename="source.pdf"'); expect(state.calls[1]).toContain('filename="source.pdf"')
})
test('PENDING waits for manual state check and EXPIRED starts a new request ID', async ({ page }) => {
    const state = await fixture(page, { mode: 'lost-ready' }); await select(page); await fill(page)
    await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
    state.status = { ...state.status!, state: 'PENDING', evidenceId: null }
    await page.getByRole('button', { name: '등록 상태 확인' }).click()
    await expect(page.getByText('등록이 진행 중입니다.')).toBeVisible(); expect(state.calls).toHaveLength(1)
    state.status = { ...state.status!, state: 'EXPIRED' }
    await page.getByRole('button', { name: '등록 상태 확인' }).click()
    await expect(page.getByText(/이 요청은 만료됐습니다/)).toBeVisible()
    await page.getByRole('button', { name: '요청 확인 후 새 등록' }).click()
    state.mode = 'ok'; await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
    await expect(page.getByText('완료 증빙을 저장했습니다.')).toBeVisible()
    const id = (body: string) => body.match(/"creationRequestId":"([^"]+)"/)?.[1]
    expect(state.calls).toHaveLength(2); expect(id(state.calls[0])).not.toBe(id(state.calls[1]))
})
test('download uses protected original endpoint and attachment filename', async ({ page }) => {
    await fixture(page); await select(page); await page.getByRole('button', { name: /증빙 1/ }).click()
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '원본 다운로드' }).click()
    const download = await pending; expect(download.suggestedFilename()).toBe('source-1.pdf')
    expect(readFileSync(await download.path()!, 'utf8')).toBe('%PDF-1.4\n%%EOF')
})

test('detail shows the complete eleven-field safe response', async ({ page }) => {
    await fixture(page); await select(page); await page.getByRole('button', { name: /증빙 1/ }).click()
    const detail = page.getByRole('region', { name: '증빙 상세' })
    for (const label of ['증빙 ID', '회사 ID', '제목', '분류', '발생일', '거래처 ID', '원본 파일명', '크기', '유형', '등록자 ID', '등록 시각']) {
        await expect(detail.locator('dt', { hasText: label })).toBeVisible()
    }
    await expect(detail.locator('dt')).toHaveCount(11)
})

for (const [mode, guidance] of [
    ['invalid', '파일 내용이나 연결 거래처를 확인해 주세요.'],
    ['too-large', '파일 또는 요청 크기가 허용 범위를 넘었습니다.'],
    ['rate-limited', '요청이 많습니다. 잠시 기다린 뒤 새 요청으로 제출해 주세요.'],
] as const) {
    test(`${mode} upload shows safe next-action guidance`, async ({ page }) => {
        const state = await fixture(page, { mode }); await select(page); await fill(page)
        await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
        await expect(page.getByRole('alert').filter({ hasText: guidance })).toBeVisible()
        expect(state.calls).toHaveLength(1)
    })
}

for (const mode of ['conflict', 'offline'] as const) {
    test(`${mode} upload holds one request for explicit status check`, async ({ page }) => {
        const state = await fixture(page, { mode }); await select(page); await fill(page)
        await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
        await expect(page.getByRole('button', { name: '등록 상태 확인' })).toBeVisible()
        expect(state.calls).toHaveLength(1)
        await expect(page.getByRole('button', { name: '증빙 등록', exact: true })).toBeDisabled()
    })
}

test('missing protected original displays a safe error without a download', async ({ page }) => {
    await fixture(page); await select(page); await page.getByRole('button', { name: /증빙 1/ }).click()
    await page.route(`**/api/companies/${a}/evidence/${uid(1)}/original`, route => json(route, { code: 'NOT_FOUND', internal: 'hidden' }, 404))
    await page.getByRole('button', { name: '원본 다운로드' }).click()
    await expect(page.getByRole('alert').filter({ hasText: '증빙을 찾지 못했습니다. 목록을 다시 조회해 주세요.' })).toBeVisible()
    await expect(page.getByText('hidden')).toHaveCount(0)
})
test('403 on upload refreshes current permissions and never reposts', async ({ page }) => {
    const state = await fixture(page, { mode: 'forbidden' }); await select(page); await fill(page)
    await page.getByRole('button', { name: '증빙 등록', exact: true }).click()
    await expect.poll(() => state.selects.length).toBe(2); expect(state.calls).toHaveLength(1)
})
for (const width of [375, 768, 1440]) {
    test(`evidence layout keyboard and no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 850 }); await fixture(page); await select(page)
        await expect(page.getByLabel('제목 *')).toBeVisible(); await page.getByLabel('제목 *').focus()
        await expect(page.getByLabel('제목 *')).toBeFocused()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: resolve(proof, `evidence-${width}.png`), fullPage: true })
    })
}
// [F03 V1~V5] 미리보기 검증은 별도 배포 설정에서 실행하며 모든 API는 fixture가 차단/대체한다.
// [검증 자원 수리] 새 체크아웃에도 존재하는 1px 이미지다. 로컬 .artifacts 파일에 의존하지 않는다.
const previewImages = {
    png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY/j///9/AAn7A/0FQ0XKAAAAAElFTkSuQmCC', 'base64'),
    jpg: Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==', 'base64'),
}
for (const [mediaType, extension] of [['image/png', 'png'], ['image/jpeg', 'jpg']] as const) {
    test(`preview explicitly loads and closes ${mediaType}`, async ({ page }) => {
        const item = row(1, { mediaType, originalFileName: `preview-test.${extension}` })
        await fixture(page, { items: [item] }); await select(page)
        let originalCalls = 0
        await page.route('**/evidence/*/original', route => {
            originalCalls++
            return route.fulfill({ contentType: mediaType, body: previewImages[extension] })
        })
        await page.getByRole('button', { name: /^증빙 1 / }).click()
        expect(originalCalls).toBe(0)
        await page.getByRole('button', { name: '원본 미리보기', exact: true }).click()
        const image = page.getByRole('img', { name: '증빙 1 원본' })
        await expect(image).toBeVisible()
        expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
        await page.getByRole('button', { name: '미리보기 닫기' }).click()
        await expect(image).toHaveCount(0)
        await page.getByRole('button', { name: '원본 미리보기', exact: true }).click()
        await expect(image).toBeVisible(); expect(originalCalls).toBe(2)
    })
}
for (const contentType of ['text/html', 'image/jpeg']) {
    test(`preview rejects response ${contentType} for PNG detail`, async ({ page }) => {
        await fixture(page, { items: [row(1, { mediaType: 'image/png' })] }); await select(page)
        await page.route('**/evidence/*/original', route => route.fulfill({ contentType, body: 'untrusted response' }))
        await page.getByRole('button', { name: /^증빙 1 / }).click()
        await page.getByRole('button', { name: '원본 미리보기', exact: true }).click()
        await expect(page.getByRole('alert')).toContainText('원본 형식이 상세 정보와 일치하지 않아')
        await expect(page.getByRole('img')).toHaveCount(0)
        await expect(page.locator('#evidence-preview iframe')).toHaveCount(0)
    })
}
for (const status of [401, 403, 404, 503]) {
    test(`preview safely handles original ${status}`, async ({ page }) => {
        await fixture(page); await select(page)
        await page.route('**/evidence/*/original', route => json(route, { code: 'FAILED', internal: 'PRIVATE_MARKER' }, status))
        await page.getByRole('button', { name: /^증빙 1 / }).click()
        await page.getByRole('button', { name: '원본 미리보기', exact: true }).click()
        if (status === 401) await expect(page).toHaveURL(/\/login$/)
        else if (status === 403) await expect(page.getByRole('status')).toContainText('현재 회사 권한을 다시 확인했습니다')
        else await expect(page.getByRole('alert')).toContainText(status === 404 ? '증빙을 찾지 못했습니다' : '원본 미리보기를 불러오지 못했습니다')
        await expect(page.getByText('PRIVATE_MARKER')).toHaveCount(0)
    })
}
test('preview connection failure requires an explicit retry', async ({ page }) => {
    await fixture(page); await select(page)
    let calls = 0
    await page.route('**/evidence/*/original', route => { calls++; return route.abort('failed') })
    await page.getByRole('button', { name: /^증빙 1 / }).click()
    await page.getByRole('button', { name: '원본 미리보기', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('원본 미리보기를 불러오지 못했습니다')
    expect(calls).toBe(1)
    await page.getByRole('button', { name: '미리보기 다시 시도' }).click()
    await expect.poll(() => calls).toBe(2)
})
test('closing a pending preview prevents a late original from displaying', async ({ page }) => {
    await fixture(page); await select(page)
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route('**/evidence/*/original', async route => {
        await pending
        await route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }).catch(() => {})
    })
    await page.getByRole('button', { name: /^증빙 1 / }).click()
    await page.getByRole('button', { name: '원본 미리보기', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('원본 미리보기를 불러오는 중')
    await page.getByRole('button', { name: '미리보기 닫기' }).click(); release()
    await expect(page.locator('#evidence-preview')).toHaveCount(0)
})
