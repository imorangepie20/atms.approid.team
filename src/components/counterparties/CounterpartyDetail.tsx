import { useState } from 'react'
import Button from '../common/Button'
import type { CounterpartyView } from '../../lib/api'
import { kindLabels } from './CounterpartyForm'

interface Props { row: CounterpartyView; canWrite: boolean; busy: boolean; onEdit: () => void; onDeactivate: () => Promise<void> }
// [F02 T5] 중지는 물리 삭제가 아니다. 확인 뒤 부모가 가진 최신 version으로만 쓰기를 호출한다.
export default function CounterpartyDetail({ row, canWrite, busy, onEdit, onDeactivate }: Props) {
    const [confirm, setConfirm] = useState(false)
    const entries = [['구분', kindLabels[row.kind]], ['사업자번호', row.businessNumber], ['담당자', row.contactName], ['이메일', row.email], ['전화', row.phone], ['주소', row.address], ['메모', row.memo]]
    return <section className="hud-card rounded-xl p-4 sm:p-6 min-w-0" aria-labelledby="counterparty-detail-title">
        <h2 id="counterparty-detail-title" className="text-xl font-semibold break-all">{row.name}</h2>
        <p className="mt-2 text-sm text-hud-text-muted">{row.active ? '사용중' : '중지'} · 버전 {row.version}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">{entries.map(([label, value]) => <div key={label} className={label === '메모' || label === '주소' ? 'sm:col-span-2 min-w-0' : 'min-w-0'}><dt className="text-sm text-hud-text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-all">{value ?? '—'}</dd></div>)}</dl>
        {canWrite && row.active && <div className="mt-5 flex flex-wrap gap-3"><Button type="button" disabled={busy} onClick={onEdit} className="min-h-11">거래처 수정</Button><Button type="button" variant="danger" disabled={busy} onClick={() => setConfirm(true)} className="min-h-11">사용 중지</Button></div>}
        {!row.active && <p className="mt-4 text-sm text-hud-text-muted">중지된 거래처입니다. 기존 식별자는 유지되며 수정과 재활성화는 제공하지 않습니다.</p>}
        {confirm && canWrite && row.active && <div role="alert" className="mt-4 rounded-lg border border-hud-accent-danger p-3">
            <p className="break-all">{row.name} 거래처의 사용을 중지할까요? 데이터와 식별자는 남습니다.</p>
            <div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="danger" disabled={busy} onClick={() => { setConfirm(false); void onDeactivate() }} className="min-h-11">사용 중지 확인</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(false)} className="min-h-11">중지 취소</Button></div>
        </div>}
    </section>
}
