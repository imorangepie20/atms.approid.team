import { useEffect, useRef, useState } from 'react'
import Button from '../common/Button'
import { ApiError, evidenceApi, type EvidenceView } from '../../lib/api'
import PdfCanvasPreview from './PdfCanvasPreview'

interface Props {
    evidence: EvidenceView; companyId: string
    onUnauthorized: () => void; onForbidden: () => void; isCurrent: () => boolean
}

// [F03 V2~V5] 원본은 현재 상세에만 소유된다. Query/localStorage에 바이트·URL을 보관하지 않는다.
// 닫기/상세 전환으로 unmount되면 fetch를 취소하고 URL을 해제한다. 취소를 무시한 늦은 응답도 alive로 차단한다.
export default function EvidencePreview({ evidence, companyId, onUnauthorized, onForbidden, isCurrent }: Props) {
    const [url, setUrl] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
    const objectUrl = useRef('')
    const [pdf, setPdf] = useState<Blob | null>(null)
    useEffect(() => {
        const controller = new AbortController()
        let alive = true, ownedUrl = ''
        setLoading(true); setError(''); setUrl(''); setPdf(null)
        void evidenceApi.original(companyId, evidence.id, { signal: controller.signal, mediaType: evidence.mediaType }).then(bytes => {
            if (!alive || !isCurrent()) return
            // PDF 원본은 URL로 탐색하지 않고 파서에 바이트를 전달한다. 이미지만 Blob URL을 소유한다.
            if (evidence.mediaType === 'application/pdf') setPdf(bytes)
            else { ownedUrl = URL.createObjectURL(bytes); objectUrl.current = ownedUrl; setUrl(ownedUrl) }
        }).catch(failure => {
            if (!alive || !isCurrent()) return
            if (failure instanceof ApiError && failure.status === 401) onUnauthorized()
            else if (failure instanceof ApiError && failure.status === 403) onForbidden()
            else setError(failure instanceof ApiError && failure.code === 'FILE_TYPE_MISMATCH'
                ? '원본 형식이 상세 정보와 일치하지 않아 미리보기를 표시하지 않았습니다.'
                : failure instanceof ApiError && failure.status === 404 ? '증빙을 찾지 못했습니다. 목록을 다시 조회해 주세요.'
                    : '원본 미리보기를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.')
        }).finally(() => { if (alive && isCurrent()) setLoading(false) })
        return () => {
            alive = false; controller.abort()
            if (ownedUrl) URL.revokeObjectURL(ownedUrl)
            objectUrl.current = ''
        }
        // 현재 상세의 권한 콜백을 캡처한다. 부모의 상태 갱신만으로 원본을 다시 받지 않는다.
    }, [companyId, evidence.id, evidence.mediaType, attempt])
    const imageFailed = () => {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
        setUrl(''); setError('이미지를 표시하지 못했습니다. 원본을 다운로드하여 확인해 주세요.')
    }
    return <section id="evidence-preview" aria-labelledby="evidence-preview-title" className="mt-5 min-w-0 rounded-lg border border-hud-border-secondary p-3">
        <h3 id="evidence-preview-title" className="font-semibold">원본 미리보기</h3>
        <p className="mt-1 break-words text-sm text-hud-text-muted">{evidence.originalFileName}</p>
        {loading && <p role="status" className="mt-3 text-sm">원본 미리보기를 불러오는 중…</p>}
        {pdf && <PdfCanvasPreview bytes={pdf} title={evidence.title} />}
        {url && <img src={url} alt={`${evidence.title} 원본`} onError={imageFailed} className="mt-3 max-h-[36rem] w-full rounded bg-white object-contain" />}
        {error && <div className="mt-3"><p role="alert" className="text-sm text-hud-accent-danger">{error}</p>
            <Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)} className="mt-2 min-h-11">미리보기 다시 시도</Button></div>}
    </section>
}
