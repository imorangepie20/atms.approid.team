import { Link } from 'react-router-dom'
import Button from '../common/Button'
import JournalReferencePicker from './JournalReferencePicker'
import { wonDisplay } from '../../lib/journalDraftForm'
import type { JournalDetailView } from '../../lib/api'

interface Props { row: JournalDetailView; companyId: string; userId: string; canWrite: boolean; canSubmit?: boolean; locked: boolean; onEdit: () => void; onSubmitApproval?: () => void; onAccessError: (error: unknown) => void }
export default function JournalDetail({ row, companyId, userId, canWrite, canSubmit = false, locked, onEdit, onSubmitApproval, onAccessError }: Props) {
    // [F05 W7] 승인 상태는 장부 확정과 별개이며 DRAFT만 수정할 수 있다.
    // [F05-01 확정 기반] 원장 화면 전에도 직접 상세 조회에서 확정 상태를 정확히 표시한다.
    const status = { DRAFT: '초안', SUBMITTED: '승인 요청', APPROVED: '승인 완료', REJECTED: '반려', POSTED: '장부 반영' }[row.status]
    // [B8 운영 검증 수리] POSTED는 실제 장부 반영 상태이므로 미확정 전표와 반대 의미의 안내를 표시한다.
    const postingNotice = row.status === 'POSTED'
        ? '장부·재무제표·세무 집계에 반영됩니다.'
        : '장부·재무제표·세무 집계에 반영되지 않습니다.'
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0 space-y-4" aria-labelledby="journal-detail-title">
        <h2 id="journal-detail-title" className="text-xl font-semibold break-all">{row.number} · {status} 상세</h2>
        <p className="text-sm text-hud-text-muted">{status} 상태입니다. {postingNotice}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">{([['전표 ID', row.id], ['회계연도 ID', row.fiscalYearId], ['회계일자', row.accountingDate], ['적요', row.memo], ['차변 합계', wonDisplay(row.debitTotal)], ['대변 합계', wonDisplay(row.creditTotal)], ['버전', String(row.version)], ['작성자 ID', row.createdById], ['등록 시각 UTC', row.createdAt], ['수정 시각 UTC', row.updatedAt]] as const).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-hud-text-muted">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
        <JournalReferencePicker kind="counterparty" id="journal-detail-party" label="거래처" companyId={companyId} userId={userId} selected={row.counterpartyId ? [row.counterpartyId] : []} readOnly onAccessError={onAccessError} />
        <h3 className="font-semibold">저장된 분개</h3><ol className="space-y-3">{row.lines.map(line => <li key={line.id} className="rounded-lg border border-hud-border-secondary p-3 min-w-0"><p className="text-sm">{line.position}행 · 차변 {wonDisplay(line.debit)} · 대변 {wonDisplay(line.credit)}</p><JournalReferencePicker kind="account" id={`journal-detail-account-${line.position}`} label="계정" companyId={companyId} userId={userId} selected={[line.accountId]} readOnly onAccessError={onAccessError} />{line.memo && <p className="text-sm break-words">{line.memo}</p>}</li>)}</ol>
        <h3 className="font-semibold">연결 증빙</h3>{!row.evidenceIds.length && <p>연결된 증빙이 없습니다.</p>}{row.evidenceIds.map(id => <div key={id} className="min-w-0"><JournalReferencePicker kind="evidence" id={`journal-detail-evidence-${id}`} label="증빙" companyId={companyId} userId={userId} selected={[id]} readOnly onAccessError={onAccessError} /><Link className="inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2" to={`/accounting/evidence?companyId=${encodeURIComponent(companyId)}&evidenceId=${encodeURIComponent(id)}`}>증빙 상세와 원본 열기</Link></div>)}
        {canWrite && row.status === 'DRAFT' && <Button type="button" className="min-h-11" disabled={locked} onClick={onEdit}>초안 수정</Button>}
        {/* [F05 A2] 서버가 현재 SUBMIT을 허용할 때만 요청한다. 비초안은 이력 화면으로 이동한다. */}
        {row.status === 'DRAFT' && canSubmit && <Button type="button" className="min-h-11 ml-2" disabled={locked} onClick={onSubmitApproval}>승인 요청</Button>}
        {row.status !== 'DRAFT' && <Link className="inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2 ml-2" to={`/accounting/approvals?companyId=${encodeURIComponent(companyId)}&journalId=${encodeURIComponent(row.id)}`}>승인 상태와 이력 보기</Link>}
    </section>
}
