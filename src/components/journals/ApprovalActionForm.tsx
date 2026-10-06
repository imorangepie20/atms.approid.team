import { useEffect, useRef, useState } from 'react'
import Button from '../common/Button'
import { journalInputClass } from './JournalReferencePicker'
import type { JournalWorkflowAction } from '../../lib/api'

interface Props {
    allowed: JournalWorkflowAction[]; locked: boolean; uncertain: boolean
    onAction: (action: JournalWorkflowAction, reason?: string) => void; onRetry: () => void; onRefresh: () => void
}
const labels = { SUBMIT: '승인 요청', APPROVE: '승인', REJECT: '반려', RETURN_TO_DRAFT: '초안 복귀' }

// [F05 A5/A6] 한 번에 한 작업만 확인한다. 결과 불명 재시도는 부모가 보관한 원래 본문/요청 ID로만 수행한다.
export default function ApprovalActionForm({ allowed, locked, uncertain, onAction, onRetry, onRefresh }: Props) {
    const [choice, setChoice] = useState<JournalWorkflowAction | null>(null), [reason, setReason] = useState(''), [error, setError] = useState('')
    const alert = useRef<HTMLParagraphElement>(null)
    useEffect(() => { if (error) alert.current?.focus({ preventScroll: true }) }, [error])
    const choose = (action: JournalWorkflowAction) => { setChoice(action); setReason(''); setError('') }
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0 space-y-3" aria-labelledby="approval-actions-title">
        <h2 id="approval-actions-title" className="text-xl font-semibold">가능한 처리</h2>
        {uncertain ? <div className="space-y-3"><p role="status">이전 요청의 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.</p><div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={locked} onClick={onRetry}>같은 요청으로 결과 확인</Button><Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={onRefresh}>현재 상태 조회</Button></div></div> : <>
            {!allowed.length && <p className="text-hud-text-muted">현재 상태와 권한에서 가능한 처리가 없습니다.</p>}
            <div className="flex flex-wrap gap-2">{allowed.map(action => <Button key={action} type="button" variant={action === 'REJECT' ? 'danger' : 'outline'} className="min-h-11" disabled={locked} onClick={() => choose(action)}>{labels[action]}</Button>)}</div>
            {choice && allowed.includes(choice) && <form className="rounded-lg border border-hud-border-secondary p-3 space-y-3" noValidate onSubmit={event => {
                event.preventDefault(); const trimmed = reason.trim()
                if (choice === 'REJECT' && (!trimmed || [...trimmed].length > 500 || trimmed.includes('\0'))) { setError('반려 사유를 1~500자로 입력해 주세요.'); return }
                setError(''); onAction(choice, choice === 'REJECT' ? trimmed : undefined); setChoice(null); setReason('')
            }}><p>{labels[choice]} 처리를 확인해 주세요.</p>{choice === 'REJECT' && <div><label htmlFor="approval-reason" className="mb-2 block">반려 사유 (필수, 1~500자)</label><textarea id="approval-reason" className={journalInputClass} rows={4} value={reason} disabled={locked} aria-invalid={Boolean(error)} aria-describedby={error ? 'approval-reason-error' : undefined} onChange={event => setReason(event.target.value)} />{error && <p ref={alert} tabIndex={-1} id="approval-reason-error" role="alert" className="mt-2 text-hud-accent-danger">{error}</p>}</div>}<div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={locked}>{labels[choice]} 확정</Button><Button type="button" variant="ghost" className="min-h-11" disabled={locked} onClick={() => setChoice(null)}>취소</Button></div></form>}
        </>}
    </section>
}
