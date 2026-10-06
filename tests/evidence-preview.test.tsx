// @vitest-environment jsdom
// [F03 V3/V4] 실제 React 컴포넌트를 DOM에 올려 요청·URL 소유권과 부모 전환을 검증한다.
// 브라우저 도구의 계측 제약과 별개인 단위 시험이다. 배포 화면의 PDF 렌더링은 별도로 확인한다.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EvidenceDetail from '../src/components/evidence/EvidenceDetail'
import EvidencePreview from '../src/components/evidence/EvidencePreview'
import PdfCanvasPreview from '../src/components/evidence/PdfCanvasPreview'
import Evidence from '../src/pages/accounting/Evidence'
import { companyApi, counterpartyApi, evidenceApi, type EvidenceView } from '../src/lib/api'

const control = vi.hoisted(() => ({ expire: vi.fn(), getDocument: vi.fn() }))
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'test-user' }, csrfToken: 'test-csrf' }, expire: control.expire }) }))
vi.mock('pdfjs-dist', () => ({ getDocument: control.getDocument, GlobalWorkerOptions: {} }))
const row: EvidenceView = { id: 'proof-a', companyId: 'company-a', title: '검증 원본', kind: 'RECEIPT', originalFileName: 'sample.png',
    mediaType: 'image/png', byteSize: 3, occurredOn: null, counterpartyId: null, createdById: 'test-user', createdAt: '2026-10-06' }
let createUrl: ReturnType<typeof vi.fn>, revokeUrl: ReturnType<typeof vi.fn>, fetchMock: ReturnType<typeof vi.fn>
const bytesResponse = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } })
const props = () => ({ evidence: row, companyId: row.companyId, isCurrent: () => true, onUnauthorized: vi.fn(), onForbidden: vi.fn() })
const open = () => fireEvent.click(screen.getByRole('button', { name: '원본 미리보기' }))
const loaded = () => screen.findByRole('img', { name: '검증 원본 원본' })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

beforeEach(() => {
    vi.clearAllMocks()
    createUrl = vi.fn().mockImplementation(() => `blob:test-${createUrl.mock.calls.length}`); revokeUrl = vi.fn()
    Object.defineProperties(URL, { createObjectURL: { value: createUrl, configurable: true }, revokeObjectURL: { value: revokeUrl, configurable: true } })
    vi.stubGlobal('Blob', NodeBlob)
    // Response 본문은 한 번만 소비할 수 있으므로 실제 HTTP처럼 호출마다 새 응답을 만든다.
    fetchMock = vi.fn().mockImplementation(async () => bytesResponse()); vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('ResizeObserver', class { constructor(private callback: ResizeObserverCallback) {} observe(target: Element) { this.callback([{ target, contentRect: { width: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver) } disconnect() {} })
    Element.prototype.scrollIntoView = vi.fn()
    window.localStorage.clear(); window.sessionStorage.clear()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('original ownership and safe recovery', () => {
    it('detail fetches only on explicit open, revokes on close and opens a fresh request', async () => {
        render(<EvidenceDetail {...props()} />); expect(fetchMock).not.toHaveBeenCalled()
        open(); await loaded(); const url = createUrl.mock.results[0].value
        fireEvent.click(screen.getByRole('button', { name: '미리보기 닫기' })); expect(revokeUrl).toHaveBeenCalledWith(url)
        expect(screen.queryByRole('img')).toBeNull(); open(); await loaded(); expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    it.each(['image/png', 'image/jpeg'])('renders only validated %s bytes', async mediaType => {
        fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': mediaType } }))
        render(<EvidenceDetail {...props()} evidence={{ ...row, mediaType }} />); open(); await loaded()
        expect(createUrl.mock.calls[0][0].type).toBe(mediaType)
    })
    it('closing a pending request aborts its signal and ignores a response that ignores abort', async () => {
        const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise)
        render(<EvidenceDetail {...props()} />); open(); const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
        fireEvent.click(screen.getByRole('button', { name: '미리보기 닫기' })); expect(signal.aborted).toBe(true)
        await act(async () => pending.resolve(bytesResponse())); expect(createUrl).not.toHaveBeenCalled()
    })
    it.each(['company', 'detail'])('%s replacement revokes the old URL and aborts the old request', async mode => {
        const p = props(), mounted = render(<EvidencePreview {...p} />); await loaded()
        const old = createUrl.mock.results[0].value, signal = fetchMock.mock.calls[0][1].signal as AbortSignal
        mounted.rerender(<EvidencePreview {...p} companyId={mode === 'company' ? 'company-b' : row.companyId} evidence={{ ...row, id: mode === 'detail' ? 'proof-b' : row.id }} />)
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); expect(signal.aborted).toBe(true); expect(revokeUrl).toHaveBeenCalledWith(old)
    })
    it.each(['navigation', 'logout'])('%s unmount cancels and releases the preview owner', async () => {
        const mounted = render(<EvidenceDetail {...props()} />); open(); await loaded()
        const signal = fetchMock.mock.calls[0][1].signal as AbortSignal, url = createUrl.mock.results[0].value
        mounted.unmount(); expect(signal.aborted).toBe(true); expect(revokeUrl).toHaveBeenCalledWith(url)
    })
    it('stale request does not invoke authentication callbacks or create a URL', async () => {
        const pending = deferred<Response>(), p = props(); fetchMock.mockReturnValue(pending.promise)
        const mounted = render(<EvidencePreview {...p} />); mounted.unmount()
        await act(async () => pending.resolve(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 })))
        expect(p.onUnauthorized).not.toHaveBeenCalled(); expect(createUrl).not.toHaveBeenCalled()
    })
    it.each(['text/html', 'image/svg+xml', 'image/jpeg'])('rejects %s for PNG without exposing response content', async type => {
        fetchMock.mockResolvedValue(new Response('PRIVATE_MARKER', { headers: { 'Content-Type': type } }))
        render(<EvidenceDetail {...props()} />); open(); expect((await screen.findByRole('alert')).textContent).toContain('형식')
        expect(createUrl).not.toHaveBeenCalled(); expect(document.body.textContent).not.toContain('PRIVATE_MARKER')
    })
    it.each([401, 403])('original %s invokes the existing authentication or permission callback', async status => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'PRIVATE_MARKER' }), { status })); const p = props()
        render(<EvidenceDetail {...p} />); open()
        await waitFor(() => expect(status === 401 ? p.onUnauthorized : p.onForbidden).toHaveBeenCalledOnce())
        expect(document.body.textContent).not.toContain('PRIVATE_MARKER'); expect(createUrl).not.toHaveBeenCalled()
    })
    it.each([404, 503, 'offline'])('%s shows safe feedback and retries only on explicit action', async status => {
        if (status === 'offline') fetchMock.mockRejectedValueOnce(new Error('PRIVATE_MARKER'))
        else fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PRIVATE_MARKER' }), { status: Number(status) }))
        render(<EvidenceDetail {...props()} />); open(); await screen.findByRole('alert'); expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(document.body.textContent).not.toContain('PRIVATE_MARKER')
        fireEvent.click(screen.getByRole('button', { name: '미리보기 다시 시도' })); await loaded(); expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    it('image decode failure releases URL and supports explicit retry', async () => {
        render(<EvidenceDetail {...props()} />); open(); const image = await loaded(), url = createUrl.mock.results[0].value
        fireEvent.error(image); expect(revokeUrl).toHaveBeenCalledWith(url); expect(screen.queryByRole('img')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: '미리보기 다시 시도' })); await loaded(); expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    it('raw bytes and original URLs never enter persistent browser storage', async () => {
        render(<EvidenceDetail {...props()} />); open(); await loaded()
        expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0)
    })
})

describe('actual evidence page transitions', () => {
    async function page() {
        const companies = ['company-a', 'company-b'].map(id => ({ id, name: id, currency: 'KRW', accountingStandard: 'K-GAAP', allowSelfApproval: false, version: 1 }))
        vi.spyOn(companyApi, 'list').mockResolvedValue({ items: companies, nextCursor: null })
        const select = vi.spyOn(companyApi, 'select').mockImplementation(async id => ({ company: companies.find(value => value.id === id)!, roles: ['READ_ONLY'], permissions: ['evidence.read'] }))
        vi.spyOn(counterpartyApi, 'list').mockResolvedValue({ items: [], nextCursor: null })
        vi.spyOn(evidenceApi, 'list').mockImplementation(async (companyId, _filters, cursor) => ({ items: [{ ...row, companyId }], nextCursor: cursor ? null : 'next' }))
        vi.spyOn(evidenceApi, 'detail').mockResolvedValue({ evidence: row })
        const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const mounted = render(<QueryClientProvider client={cache}><Evidence /></QueryClientProvider>)
        await screen.findByRole('option', { name: 'company-a' }); fireEvent.change(screen.getByLabelText('현재 회사'), { target: { value: 'company-a' } })
        const detail = await screen.findAllByRole('button', { name: /^검증 원본/ }); fireEvent.click(detail[0]); await screen.findByRole('heading', { name: '증빙 상세' })
        open(); await loaded()
        return { ...mounted, select, cache }
    }
    it.each(['company', 'filter', 'next', 'previous'])('%s change removes detail, aborts request and revokes original', async mode => {
        await page(); const signal = fetchMock.mock.calls[0][1].signal as AbortSignal, url = createUrl.mock.results[0].value
        if (mode === 'company') fireEvent.change(screen.getByLabelText('현재 회사'), { target: { value: 'company-b' } })
        if (mode === 'filter') { fireEvent.change(screen.getByLabelText('제목 검색'), { target: { value: 'new' } }); fireEvent.click(screen.getByRole('button', { name: '검색' })) }
        if (mode === 'next' || mode === 'previous') fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
        await waitFor(() => expect(screen.queryByRole('heading', { name: '증빙 상세' })).toBeNull())
        expect(signal.aborted).toBe(true); expect(revokeUrl).toHaveBeenCalledWith(url)
        if (mode === 'previous') {
            const detail = await screen.findAllByRole('button', { name: /^검증 원본/ }); fireEvent.click(detail[0]); await screen.findByRole('heading', { name: '증빙 상세' }); open(); await loaded()
            const secondUrl = createUrl.mock.results[1].value
            fireEvent.click(screen.getByRole('button', { name: '이전 페이지' })); await waitFor(() => expect(screen.queryByRole('img')).toBeNull()); expect(revokeUrl).toHaveBeenCalledWith(secondUrl)
        }
    })
    it('403 refreshes company permissions and clears the preview instead of reposting', async () => {
        const { select } = await page(); fireEvent.click(screen.getByRole('button', { name: '미리보기 닫기' }))
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PRIVATE_MARKER' }), { status: 403 }))
        select.mockResolvedValueOnce({ company: { id: 'company-a', name: 'company-a', currency: 'KRW', accountingStandard: 'K-GAAP', allowSelfApproval: false, version: 1 }, roles: [], permissions: [] })
        open(); await screen.findByText('증빙 권한이 없습니다'); expect(select).toHaveBeenCalledTimes(2); expect(screen.queryByRole('img')).toBeNull()
        expect(fetchMock.mock.calls.every(call => !call[1]?.method || call[1].method === 'GET')).toBe(true)
    })
    it('401 original expires the current session', async () => {
        await page(); fireEvent.click(screen.getByRole('button', { name: '미리보기 닫기' }))
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 })); open()
        await waitFor(() => expect(control.expire).toHaveBeenCalledOnce())
    })
    it('query cache contains safe metadata and no original Blob or Blob URL', async () => {
        const { cache } = await page(); const stored = JSON.stringify(cache.getQueryCache().getAll().map(query => query.state.data))
        expect(stored).not.toContain('blob:test'); expect(localStorage.length + sessionStorage.length).toBe(0)
    })
})

describe('PDF canvas task ownership', () => {
    function parser() {
        const draw = vi.fn().mockResolvedValue(undefined), cancel = vi.fn(), destroy = vi.fn().mockResolvedValue(undefined)
        const page = { getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: vi.fn(() => ({ promise: draw(), cancel })),
            getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'FICTIONAL PAGE' }] }), cleanup: vi.fn() }
        const doc = { numPages: 2, getPage: vi.fn().mockResolvedValue(page) }
        control.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy })
        return { page, doc, cancel, destroy, draw }
    }
    it('passes local-only data/resources, renders one page, moves pages and destroys the worker owner', async () => {
        const p = parser(), mounted = render(<PdfCanvasPreview bytes={new Blob(['%PDF-fixture'])} title="검증 PDF" />)
        await waitFor(() => expect(screen.queryByRole('status')).toBeNull()); expect(screen.getAllByRole('img')).toHaveLength(1)
        const options = control.getDocument.mock.calls[0][0]; expect(options.data).toBeInstanceOf(Uint8Array); expect(options.enableXfa).toBe(false)
        expect(options.cMapUrl).toBe('/assets/pdfjs/6.4.299/cmaps/'); expect(options.wasmUrl).toBe('/assets/pdfjs/6.4.299/wasm/')
        fireEvent.click(screen.getByRole('button', { name: 'PDF 다음 페이지' })); await screen.findByText('2 / 2 페이지'); await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
        expect(p.doc.getPage).toHaveBeenCalledWith(2); expect(screen.getAllByRole('img')).toHaveLength(1)
        const canvas = screen.getByRole('img') as HTMLCanvasElement; expect(canvas.width * canvas.height).toBeLessThanOrEqual(4_000_000)
        mounted.unmount(); expect(p.cancel).toHaveBeenCalled(); expect(p.destroy).toHaveBeenCalledOnce(); expect(canvas.width * canvas.height).toBe(0); expect(createUrl).not.toHaveBeenCalled()
    })
    it('unmount destroys a pending PDF loading task and ignores its late document', async () => {
        const pending = deferred<unknown>(), destroy = vi.fn().mockResolvedValue(undefined); control.getDocument.mockReturnValue({ promise: pending.promise, destroy })
        const mounted = render(<PdfCanvasPreview bytes={new Blob(['%PDF-fixture'])} title="검증 PDF" />)
        await waitFor(() => expect(control.getDocument).toHaveBeenCalled()); mounted.unmount(); expect(destroy).toHaveBeenCalledOnce()
        await act(async () => pending.resolve({ numPages: 2 })); expect(screen.queryByRole('img')).toBeNull()
    })
    it('corrupt PDF gives safe guidance and explicit retry without leaking parser errors', async () => {
        control.getDocument.mockReturnValue({ promise: Promise.reject(new Error('PRIVATE_MARKER')), destroy: vi.fn().mockResolvedValue(undefined) })
        render(<PdfCanvasPreview bytes={new Blob(['invalid'])} title="검증 PDF" />); await screen.findByRole('alert')
        expect(document.body.textContent).not.toContain('PRIVATE_MARKER'); expect(control.getDocument).toHaveBeenCalledOnce()
        parser(); fireEvent.click(screen.getByRole('button', { name: 'PDF 다시 시도' })); await screen.findByText('1 / 2 페이지')
        await waitFor(() => expect(screen.queryByRole('status')).toBeNull()); expect(control.getDocument).toHaveBeenCalledTimes(2)
    })
})
