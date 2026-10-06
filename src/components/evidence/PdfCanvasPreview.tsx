import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import Button from '../common/Button'

// [F03 PDF] PDF.js는 PDF 바이트를 해석하고 canvas에 그리는 라이브러리다.
// worker는 계산을 별도 스레드에서 수행한다. Vite가 같은 출처의 파일 URL로 묶어 CDN을 사용하지 않는다.
const resourceBase = `${import.meta.env.BASE_URL}assets/pdfjs/6.4.299/`

export default function PdfCanvasPreview({ bytes, title }: { bytes: Blob; title: string }) {
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null), [pageNumber, setPageNumber] = useState(1)
    const [error, setError] = useState(''), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0)
    const [width, setWidth] = useState(300), [text, setText] = useState('')
    const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        let alive = true, task: PDFDocumentLoadingTask | undefined
        setPdf(null); setPageNumber(1); setError(''); setLoading(true); setText('')
        // 큰 파서는 PDF가 열릴 때만 다운로드한다. import 실패도 안전한 오류 안내 흐름으로 처리한다.
        void Promise.all([bytes.arrayBuffer(), import('pdfjs-dist')]).then(([data, { getDocument, GlobalWorkerOptions }]) => {
            if (!alive) return
            GlobalWorkerOptions.workerSrc = workerUrl
            task = getDocument({ data: new Uint8Array(data), enableXfa: false,
                cMapUrl: `${resourceBase}cmaps/`, cMapPacked: true,
                standardFontDataUrl: `${resourceBase}standard_fonts/`, wasmUrl: `${resourceBase}wasm/`, iccUrl: `${resourceBase}iccs/`,
                maxImageSize: 16_000_000, canvasMaxAreaInBytes: 16_000_000, verbosity: 0 })
            return task.promise.then(document => { if (alive) setPdf(document) })
        }).catch(() => { if (alive) { setLoading(false); setError('PDF를 표시하지 못했습니다. 암호 또는 파일 상태를 확인하거나 원본을 다운로드해 주세요.') } })
        // 닫기/다른 원본/재시도 시 파서와 worker가 가진 바이트를 폐기한다. 실패 내용·PDF 데이터는 로그에 남기지 않는다.
        return () => { alive = false; void task?.destroy().catch(() => undefined) }
    }, [bytes, attempt])

    useEffect(() => {
        if (!host.current) return
        const observer = new ResizeObserver(entries => setWidth(Math.max(1, entries[0].contentRect.width)))
        observer.observe(host.current)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!pdf || !canvas.current) return
        let alive = true, render: RenderTask | undefined
        const target = canvas.current
        setLoading(true); setError(''); setText('')
        void (async () => {
            const page = await pdf.getPage(pageNumber)
            if (!alive) return
            const normal = page.getViewport({ scale: 1 })
            const view = page.getViewport({ scale: Math.min(width / normal.width, 1.5) })
            // 한 페이지·한 canvas만 소유한다. HiDPI는 최대2배, 버퍼는 최대4백만 픽셀로 제한한다.
            const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (view.width * view.height)))
            target.width = Math.max(1, Math.floor(view.width * density)); target.height = Math.max(1, Math.floor(view.height * density))
            target.style.width = `${view.width}px`; target.style.height = `${view.height}px`
            render = page.render({ canvas: target, viewport: view, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0], annotationMode: 0 })
            await render.promise
            const content = await page.getTextContent()
            if (alive) {
                setText(content.items.map(item => 'str' in item ? item.str : '').join(' ').slice(0, 20_000))
                setLoading(false)
            }
            page.cleanup()
        })().catch(() => { if (alive) { setLoading(false); setError('PDF 페이지를 표시하지 못했습니다. 다시 시도하거나 원본을 다운로드해 주세요.') } })
        // 페이지 이동·너비 변경·닫기 때 이전 그리기를 취소하여 한 canvas의 중복 사용과 늦은 결과를 막는다.
        return () => { alive = false; render?.cancel(); target.width = 0; target.height = 0 }
    }, [pdf, pageNumber, width])

    return <div ref={host} className="mt-3 min-w-0">
        {pdf && <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="PDF 페이지 이동">
            <Button type="button" variant="outline" disabled={pageNumber === 1 || loading} onClick={() => setPageNumber(value => value - 1)} className="min-h-11">PDF 이전 페이지</Button>
            <span className="text-sm">{pageNumber} / {pdf.numPages} 페이지</span>
            <Button type="button" variant="outline" disabled={pageNumber === pdf.numPages || loading} onClick={() => setPageNumber(value => value + 1)} className="min-h-11">PDF 다음 페이지</Button>
        </div>}
        {loading && <p role="status" className="mb-2 text-sm">PDF 페이지를 표시하는 중…</p>}
        <canvas ref={canvas} role="img" aria-label={`${title} PDF ${pageNumber}페이지`} className={`max-w-full rounded bg-white ${loading || error ? 'hidden' : ''}`} />
        {text && <p className="sr-only">{text}</p>}
        {error && <div><p role="alert" className="text-sm text-hud-accent-danger">{error}</p>
            <Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)} className="mt-2 min-h-11">PDF 다시 시도</Button></div>}
    </div>
}
