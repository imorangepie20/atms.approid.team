import { Link } from 'react-router-dom'
import Button from '../common/Button'
import JournalReferencePicker from './JournalReferencePicker'
import { wonDisplay } from '../../lib/journalDraftForm'
import type { JournalWorkflowEvent, JournalWorkflowView } from '../../lib/api'

interface Props {
    companyId: string; userId: string; workflow: JournalWorkflowView; events: JournalWorkflowEvent[]
    hasMore: boolean; loadingMore: boolean; onMore: () => void; onAccessError: (error: unknown) => void
}
const actionName = { SUBMIT: '승인 요청', APPROVE: '승인', REJECT: '반려', RETURN_TO_DRAFT: '초안 복귀', CONFIRM: '장부 반영' }
// [F05-01 확정 기반] 과거 승인 URL로 확정 전표를 다시 읽어도 상태명이 비지 않는다.
const statusName = { DRAFT: '초안', SUBMITTED: '승인 대기', APPROVED: '승인 완료', REJECTED: '반려', POSTED: '장부 반영' }

// [F05 A4 승인 상세] 현재 전표와 처리 당시 불변 제출본을 구분한다. 승인 완료는 장부 확정이 아니다.
export default function ApprovalDetail({ companyId, userId, workflow, events, hasMore, loadingMore, onMore, onAccessError }: Props) {
    const row = workflow.journal
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0 space-y-5" aria-labelledby="approval-detail-title">
        <div><h2 id="approval-detail-title" className="text-xl font-semibold break-all">{row.number} · {statusName[row.status]}</h2><p className="mt-2 text-sm text-hud-text-muted">승인 완료와 장부 반영 상태를 구분해 표시합니다.</p></div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">{([['전표 ID', row.id], ['회계일자', row.accountingDate], ['현재 적요', row.memo], ['차변 합계', wonDisplay(row.debitTotal)], ['대변 합계', wonDisplay(row.creditTotal)], ['현재 버전', String(row.version)], ['작성자 ID', row.createdById], ['수정 시각 UTC', row.updatedAt]] as const).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-hud-text-muted">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
        <Link className="inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2" to={`/accounting/journals?companyId=${encodeURIComponent(companyId)}&journalId=${encodeURIComponent(row.id)}`}>현재 전표 상세 열기</Link>
        {(row.status === 'APPROVED' || row.status === 'POSTED') && <Link className="ml-3 inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2" to={`/accounting/ledger?companyId=${encodeURIComponent(companyId)}&tab=journal-book`}>{row.status === 'POSTED' ? '반영된 원장 보기' : '장부 화면 열기'}</Link>}
        <div><h3 className="font-semibold">처리 이력과 제출 당시 내용</h3>{!events.length && <p className="mt-2 text-hud-text-muted">아직 처리 이력이 없습니다.</p>}
            <ol className="mt-3 space-y-4">{events.map(event => <li key={event.id} className="rounded-lg border border-hud-border-secondary p-3 min-w-0 space-y-3">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm"><strong>{actionName[event.action]}</strong><span>{statusName[event.statusBefore]} → {statusName[event.statusAfter]}</span><span>버전 {event.versionBefore} → {event.versionAfter}</span></div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2"><div className="min-w-0"><dt className="text-hud-text-muted">처리 시각 UTC</dt><dd className="break-all">{event.createdAt}</dd></div><div className="min-w-0"><dt className="text-hud-text-muted">처리자 ID</dt><dd className="break-all">{event.actorId}</dd></div>{event.reason && <div className="sm:col-span-2 min-w-0"><dt className="text-hud-text-muted">반려 사유</dt><dd className="whitespace-pre-wrap break-words">{event.reason}</dd></div>}</dl>
                <details className="min-w-0"><summary className="cursor-pointer min-h-11 flex items-center font-medium focus-visible:outline focus-visible:outline-2">제출 당시 내용 보기</summary>
                    <div className="mt-3 space-y-3 text-sm"><p>제출 시각 UTC: {event.submission.createdAt}</p><p>회계일자: {event.submission.content.accountingDate}</p><p className="break-words">적요: {event.submission.content.memo}</p>
                        <ol className="space-y-2">{event.submission.content.lines.map(line => <li key={line.id} className="rounded border border-hud-border-secondary p-2 min-w-0"><p>{line.position}행 · 차변 {wonDisplay(line.debit)} · 대변 {wonDisplay(line.credit)}</p><JournalReferencePicker kind="account" id={`approval-${event.id}-${line.id}`} label="제출 당시 계정 ID" companyId={companyId} userId={userId} selected={[line.accountId]} readOnly onAccessError={onAccessError} />{line.memo && <p className="break-words">{line.memo}</p>}</li>)}</ol>
                        <h4 className="font-medium">제출 당시 연결 증빙</h4>{!event.submission.content.evidenceIds.length && <p>없음</p>}{event.submission.content.evidenceIds.map(id => <Link key={id} className="block min-h-11 break-all underline focus-visible:outline focus-visible:outline-2" to={`/accounting/evidence?companyId=${encodeURIComponent(companyId)}&evidenceId=${encodeURIComponent(id)}`}>증빙 상세와 원본 열기 · {id}</Link>)}
                    </div>
                </details>
            </li>)}</ol>
            {hasMore && <Button type="button" variant="outline" className="mt-4 min-h-11" disabled={loadingMore} onClick={onMore}>이력 더 보기</Button>}
        </div>
    </section>
}
