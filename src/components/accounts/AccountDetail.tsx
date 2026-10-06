import { useState } from 'react'
import Button from '../common/Button'
import type { AccountView } from '../../lib/api'
import { balanceLabels, categoryLabels } from './AccountForm'

interface Props { row: AccountView; canWrite: boolean; busy: boolean; onEdit: () => void; onDeactivate: () => Promise<void> }
// [B3/B5] 구조상 자격과 후속 전표 검사를 구분한다. 중지는 최신 version을 가진 부모가 실행한다.
export default function AccountDetail({ row, canWrite, busy, onEdit, onDeactivate }: Props) {
    const [confirm, setConfirm] = useState(false)
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0" aria-labelledby="account-detail-title">
        <h2 id="account-detail-title" className="text-xl font-semibold break-all">{row.name}</h2>
        <p className="mt-2 text-sm text-hud-text-muted">{row.active ? '사용중' : '중지'} · 버전 {row.version}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">{[['계정 코드', row.code], ['분류', row.category ? categoryLabels[row.category] : '미분류'], ['정상 잔액 방향', row.normalBalance ? balanceLabels[row.normalBalance] : '미분류'], ['전표 사용 자격', row.canUseInJournal ? '계정 구조상 자격 있음' : '자격 없음']].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-hud-text-muted">{label}</dt><dd className="mt-1 break-all">{value}</dd></div>)}</dl>
        <p className="mt-4 text-sm text-hud-text-muted">전표 사용 자격은 사용중이며 분류와 방향이 설정됐다는 뜻입니다. 실제 전표 저장의 권한·기간·상태 검사는 별도이며 전표 기능은 후속입니다.</p>
        {canWrite && row.active && <div className="mt-5 flex flex-wrap gap-3"><Button type="button" disabled={busy} onClick={onEdit} className="min-h-11">계정 수정</Button><Button type="button" variant="danger" disabled={busy} onClick={() => setConfirm(true)} className="min-h-11">사용 중지</Button></div>}
        {!row.active && <p className="mt-4 text-sm text-hud-text-muted">중지된 계정입니다. 기존 코드와 식별자는 유지되며 수정·삭제·재활성화는 제공하지 않습니다.</p>}
        {confirm && canWrite && row.active && <div role="alert" className="mt-4 rounded-lg border border-hud-accent-danger p-3"><p className="break-all">{row.code} · {row.name} 계정의 사용을 중지할까요? 코드와 과거 참조는 남습니다.</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="danger" disabled={busy} onClick={() => { setConfirm(false); void onDeactivate() }} className="min-h-11">사용 중지 확인</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(false)} className="min-h-11">중지 취소</Button></div></div>}
    </section>
}
