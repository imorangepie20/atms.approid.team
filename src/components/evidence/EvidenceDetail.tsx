import { useState } from 'react'
import Button from '../common/Button'
import EvidencePreview from './EvidencePreview'
import EvidenceJournalLinks from '../journals/EvidenceJournalLinks'
import { ApiError, evidenceApi, type EvidenceKind, type EvidenceView } from '../../lib/api'

const kinds: Record<EvidenceKind, string> = { RECEIPT: '영수증', TAX_INVOICE: '세금계산서', OTHER: '기타' }
interface Props { evidence: EvidenceView; companyId: string; onUnauthorized: () => void; onForbidden: () => void; isCurrent: () => boolean; canReadJournals?: boolean; userId?: string }

// [F03 B6/V1] 다운로드는 종전 흐름을 유지한다. 미리보기는 명시적으로 열 때만 별도 수명으로 원본을 요청한다.
export default function EvidenceDetail({ evidence, companyId, onUnauthorized, onForbidden, isCurrent, canReadJournals = false, userId = '' }: Props) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('')
    const [previewOpen, setPreviewOpen] = useState(false)
    const download = async () => {
        if (busy) return
        setBusy(true); setError('')
        try {
            const bytes = await evidenceApi.original(companyId, evidence.id)
            if (!isCurrent()) return
            const url = URL.createObjectURL(bytes), anchor = document.createElement('a')
            anchor.href = url; anchor.download = evidence.originalFileName; anchor.style.display = 'none'
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            document.body.appendChild(anchor); anchor.click(); anchor.remove()
        } catch (failure) {
            if (!isCurrent()) return
            if (failure instanceof ApiError && failure.status === 401) onUnauthorized()
            else if (failure instanceof ApiError && failure.status === 403) onForbidden()
            else setError(failure instanceof ApiError && failure.status === 404 ? '증빙을 찾지 못했습니다. 목록을 다시 조회해 주세요.' : '원본을 내려받지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.')
        } finally { if (isCurrent()) setBusy(false) }
    }
    return <section className="hud-card rounded-xl p-5" aria-labelledby="evidence-detail-title">
        <h2 id="evidence-detail-title" className="text-lg font-semibold">증빙 상세</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {([['증빙 ID', evidence.id], ['회사 ID', evidence.companyId], ['제목', evidence.title], ['분류', kinds[evidence.kind]], ['발생일', evidence.occurredOn ?? '—'], ['거래처 ID', evidence.counterpartyId ?? '—'],
                ['원본 파일명', evidence.originalFileName], ['크기', `${evidence.byteSize.toLocaleString()}바이트`], ['유형', evidence.mediaType],
                ['등록자 ID', evidence.createdById], ['등록 시각', evidence.createdAt]] as const).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-hud-text-muted">{label}</dt><dd className="break-words text-hud-text-primary">{value}</dd></div>)}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setPreviewOpen(value => !value)} aria-expanded={previewOpen} aria-controls="evidence-preview" className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                {previewOpen ? '미리보기 닫기' : '원본 미리보기'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void download()} disabled={busy} className="min-h-11">{busy ? '원본 확인 중…' : '원본 다운로드'}</Button>
        </div>
        {previewOpen && <EvidencePreview evidence={evidence} companyId={companyId} onUnauthorized={onUnauthorized} onForbidden={onForbidden} isCurrent={isCurrent} />}
        {/* [B7] 현재 회사 전표 조회 권한으로 역조회한다. 기존 다운로드와 미리보기는 유지한다. */}
        {canReadJournals && <EvidenceJournalLinks companyId={companyId} userId={userId} evidenceId={evidence.id} isCurrent={isCurrent} onUnauthorized={onUnauthorized} onForbidden={onForbidden} />}
        {error && <p role="alert" className="mt-3 text-sm text-hud-accent-danger">{error}</p>}
    </section>
}
