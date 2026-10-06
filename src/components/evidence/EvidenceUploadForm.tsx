import { useEffect, useRef, useState, type FormEvent } from 'react'
import Button from '../common/Button'
import { ApiError, evidenceApi, type CounterpartyView, type EvidenceKind, type EvidenceMetadata, type EvidenceRequestStatus, type EvidenceView } from '../../lib/api'

const field = 'w-full min-h-11 rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'
type Errors = Partial<Record<'title' | 'file' | 'occurredOn' | 'counterpartyId', string>>
type Attempt = { metadata: EvidenceMetadata; file: File }
interface Props {
    companyId: string; csrfToken: string; counterparties: CounterpartyView[]; moreCounterparties: boolean
    onMoreCounterparties: () => void; onDone: (row: EvidenceView) => void; onUnauthorized: () => void
    onForbidden: () => void; onDraftChange: (dirty: boolean) => void; isCurrent: () => boolean
}

// [F03 B4/B5] File과 고정 메타데이터를 페이지 메모리에만 둔다. 서버가 최종 입력/바이트/바이러스 검사를 한다.
export default function EvidenceUploadForm(props: Props) {
    const [title, setTitle] = useState(''), [kind, setKind] = useState<EvidenceKind>('RECEIPT')
    const [occurredOn, setOccurredOn] = useState(''), [counterpartyId, setCounterpartyId] = useState(''), [file, setFile] = useState<File | null>(null)
    const [errors, setErrors] = useState<Errors>({}), [error, setError] = useState(''), [notice, setNotice] = useState('')
    const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [status, setStatus] = useState<EvidenceRequestStatus | null>(null)
    const attempt = useRef<Attempt | null>(null), running = useRef(false), fileInput = useRef<HTMLInputElement>(null), alert = useRef<HTMLDivElement>(null)
    const unresolved = Boolean(attempt.current && (uncertain || status)), locked = busy || unresolved
    useEffect(() => { if (error || Object.keys(errors).length) { alert.current?.focus({ preventScroll: true }); alert.current?.scrollIntoView({ block: 'center' }) } }, [error, errors])
    useEffect(() => {
        if (!locked) return
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [locked])
    const dirty = () => props.onDraftChange(true)
    const validate = (): Errors => {
        const next: Errors = {}, trimmed = title.trim()
        if (!trimmed || [...trimmed].length > 100 || /[\x00-\x1f\x7f]/.test(trimmed)) next.title = '제목은 공백을 제외하고 1~100자로 입력해 주세요.'
        if (!file || file.size < 1 || file.size > 10_485_760 || [...file.name].length > 200 || /[\x00-\x1f\x7f/\\]/.test(file.name)
            || !(/\.pdf$/i.test(file.name) && file.type === 'application/pdf'
                || /\.(jpg|jpeg)$/i.test(file.name) && file.type === 'image/jpeg'
                || /\.png$/i.test(file.name) && file.type === 'image/png')) next.file = 'PDF·JPEG·PNG 파일 1개를 10MiB 이내로 선택해 주세요.'
        if (occurredOn && (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || occurredOn.startsWith('0000')
            || Number.isNaN(Date.parse(`${occurredOn}T00:00:00Z`)) || new Date(`${occurredOn}T00:00:00Z`).toISOString().slice(0, 10) !== occurredOn)) next.occurredOn = '실제 달력 날짜를 선택해 주세요.'
        if (counterpartyId && !props.counterparties.some(row => row.id === counterpartyId && row.active)) next.counterpartyId = '현재 회사의 사용중 거래처를 다시 선택해 주세요.'
        return next
    }
    const complete = (row: EvidenceView) => {
        attempt.current = null; setUncertain(false); setStatus(null); setError(''); setErrors({})
        setTitle(''); setKind('RECEIPT'); setOccurredOn(''); setCounterpartyId(''); setFile(null)
        if (fileInput.current) fileInput.current.value = ''
        props.onDraftChange(false); setNotice('증빙 등록을 확인했습니다. 완료 목록에서 확인할 수 있습니다.')
        props.onDone(row)
    }
    const send = async (snapshot: Attempt) => {
        if (running.current) return
        running.current = true; setBusy(true); setError(''); setNotice(''); setStatus(null)
        try {
            const result = await evidenceApi.register(props.companyId, snapshot.metadata, snapshot.file, props.csrfToken)
            if (props.isCurrent()) complete(result.evidence)
        } catch (failure) {
            if (!props.isCurrent()) return
            if (failure instanceof ApiError && failure.status === 401) props.onUnauthorized()
            else if (failure instanceof ApiError && failure.status === 403) props.onForbidden()
            else if (!(failure instanceof ApiError) || [409, 503].includes(failure.status)) {
                setUncertain(true); setError('등록 결과를 확인하지 못했습니다. 아래 버튼으로 이 요청의 상태를 확인해 주세요. 자동 재전송은 하지 않습니다.')
            } else {
                attempt.current = null
                setError(failure instanceof ApiError && failure.status === 413 ? '파일 또는 요청 크기가 허용 범위를 넘었습니다.'
                    : failure instanceof ApiError && failure.status === 422 ? '파일 내용이나 연결 거래처를 확인해 주세요.'
                        : failure instanceof ApiError && failure.status === 429 ? '요청이 많습니다. 잠시 기다린 뒤 새 요청으로 제출해 주세요.'
                            : '입력 형식을 확인한 뒤 새 요청으로 제출해 주세요.')
            }
        } finally { running.current = false; if (props.isCurrent()) setBusy(false) }
    }
    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (running.current || attempt.current) return
        const found = validate(); setErrors(found); setError('')
        if (Object.keys(found).length || !file) return
        const metadata: EvidenceMetadata = { creationRequestId: crypto.randomUUID(), title: title.trim(), kind,
            occurredOn: occurredOn || null, counterpartyId: counterpartyId || null }
        attempt.current = { metadata, file }
        void send(attempt.current)
    }
    const checkStatus = async () => {
        if (running.current || !attempt.current) return
        running.current = true; setBusy(true); setError('')
        try {
            const result = await evidenceApi.status(props.companyId, attempt.current.metadata.creationRequestId)
            if (!props.isCurrent()) return
            if (result.state === 'READY' && result.evidenceId) {
                const detail = await evidenceApi.detail(props.companyId, result.evidenceId)
                if (props.isCurrent()) complete(detail.evidence)
                return
            }
            setStatus(result); setUncertain(result.state === 'PENDING' || result.state === 'CLEANING')
            setNotice(result.state === 'FAILED' ? '등록이 실패했습니다. 같은 파일과 입력으로만 명시적으로 재시도할 수 있습니다.'
                : result.state === 'EXPIRED' ? '이 요청은 만료됐습니다. 새 요청 ID로 등록해 주세요.'
                    : result.state === 'PENDING' ? '등록이 진행 중입니다. 잠시 뒤 상태를 다시 확인해 주세요.' : '정리 중입니다. 상태를 다시 확인해 주세요.')
        } catch (failure) {
            if (!props.isCurrent()) return
            if (failure instanceof ApiError && failure.status === 401) props.onUnauthorized()
            else if (failure instanceof ApiError && failure.status === 403) props.onForbidden()
            else setError('요청 상태를 확인하지 못했습니다. 완료 목록과 상태를 다시 확인한 뒤 다음 동작을 선택해 주세요.')
        } finally { running.current = false; if (props.isCurrent()) setBusy(false) }
    }
    const discard = () => {
        if (busy) return
        attempt.current = null; setStatus(null); setUncertain(false); setError(''); setNotice('새 제출은 새 요청 ID로 전송됩니다. 앞선 결과는 완료 목록에서 확인해 주세요.')
    }
    return <section className="hud-card rounded-xl p-5" aria-labelledby="evidence-upload-title">
        <h2 id="evidence-upload-title" className="text-lg font-semibold">증빙 등록</h2>
        <p className="mt-1 text-sm text-hud-text-muted">원본 1개 · PDF/JPEG/PNG · 최대 10MiB. 파일은 현재 화면에만 보관됩니다.</p>
        <div ref={alert} tabIndex={-1} role={error || Object.keys(errors).length ? 'alert' : undefined}
            className={error || Object.keys(errors).length ? 'mt-3 rounded-lg border border-hud-accent-danger p-3 text-sm text-hud-accent-danger focus-visible:outline focus-visible:outline-2' : ''}>
            {error || (Object.keys(errors).length ? '입력 항목을 확인해 주세요.' : '')}
        </div>
        {notice && <p role="status" className="mt-3 text-sm text-hud-text-secondary">{notice}</p>}
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label htmlFor="evidence-title" className="mb-1 block text-sm">제목 *</label><input id="evidence-title" value={title} disabled={locked} required
                onChange={event => { setTitle(event.target.value); dirty() }} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'evidence-title-error' : undefined} className={field} />
                {errors.title && <p id="evidence-title-error" role="alert" className="text-sm text-hud-accent-danger">{errors.title}</p>}</div>
            <div><label htmlFor="evidence-kind" className="mb-1 block text-sm">분류 *</label><select id="evidence-kind" value={kind} disabled={locked} onChange={event => { setKind(event.target.value as EvidenceKind); dirty() }} className={field}>
                <option value="RECEIPT">영수증</option><option value="TAX_INVOICE">세금계산서</option><option value="OTHER">기타</option></select></div>
            <div><label htmlFor="evidence-date" className="mb-1 block text-sm">발생일</label><input id="evidence-date" type="date" value={occurredOn} disabled={locked}
                onChange={event => { setOccurredOn(event.target.value); dirty() }} aria-invalid={Boolean(errors.occurredOn)} aria-describedby={errors.occurredOn ? 'evidence-date-error' : undefined} className={field} />
                {errors.occurredOn && <p id="evidence-date-error" role="alert" className="text-sm text-hud-accent-danger">{errors.occurredOn}</p>}</div>
            <div><label htmlFor="evidence-counterparty" className="mb-1 block text-sm">거래처</label><select id="evidence-counterparty" value={counterpartyId} disabled={locked}
                onChange={event => { setCounterpartyId(event.target.value); dirty() }} aria-invalid={Boolean(errors.counterpartyId)} aria-describedby={errors.counterpartyId ? 'evidence-counterparty-error' : undefined} className={field}>
                <option value="">연결하지 않음</option>{props.counterparties.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>{props.moreCounterparties && <Button type="button" variant="ghost" disabled={locked} onClick={props.onMoreCounterparties} className="mt-1 min-h-11">거래처 더 불러오기</Button>}
                {errors.counterpartyId && <p id="evidence-counterparty-error" role="alert" className="text-sm text-hud-accent-danger">{errors.counterpartyId}</p>}</div>
            <div><label htmlFor="evidence-file" className="mb-1 block text-sm">원본 파일 *</label><input id="evidence-file" ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={locked} required
                onChange={event => { setFile(event.target.files?.[0] ?? null); dirty() }} aria-invalid={Boolean(errors.file)} aria-describedby={errors.file ? 'evidence-file-error' : undefined}
                className={`${field} py-2 file:mr-3 file:rounded file:border-0 file:bg-hud-accent-primary file:px-3 file:py-1 file:text-hud-bg-primary`} />
                {errors.file && <p id="evidence-file-error" role="alert" className="text-sm text-hud-accent-danger">{errors.file}</p>}</div>
            <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={locked} className="min-h-11">{busy ? '등록 중…' : '증빙 등록'}</Button>
                {attempt.current && <Button type="button" variant="outline" disabled={busy} onClick={() => void checkStatus()} className="min-h-11">등록 상태 확인</Button>}
                {status?.state === 'FAILED' && status.retryable && attempt.current && <Button type="button" disabled={busy} onClick={() => void send(attempt.current!)} className="min-h-11">같은 내용 재시도</Button>}
                {attempt.current && <Button type="button" variant="ghost" disabled={busy} onClick={discard} className="min-h-11">요청 확인 후 새 등록</Button>}
            </div>
        </form>
    </section>
}
