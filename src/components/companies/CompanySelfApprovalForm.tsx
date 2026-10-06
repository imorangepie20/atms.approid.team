import { FormEvent, useEffect, useRef, useState } from 'react'
import type { CompanyView } from '../../lib/api'
import Button from '../common/Button'
import HudCard from '../common/HudCard'

export interface SelfApprovalChange { companyId: string; version: number; allowSelfApproval: boolean }
interface Props {
    company: CompanyView
    busy: boolean
    needsRefresh: boolean
    error: string
    notice: string
    onSave: (input: SelfApprovalChange, password: string) => Promise<void>
    onRefresh: () => Promise<void>
    onReset: () => void
}

// [F01 설정 양식 추가] 라디오와 확인 버튼은 서버 상태를 바꾸지 않는다.
// 확인 대상의 ID/version/목표값을 고정하고 회사나 서버 값 변경 시 기존 확인을 폐기한다.
export default function CompanySelfApprovalForm(props: Props) {
    const { company } = props
    const [desired, setDesired] = useState(company.allowSelfApproval)
    const [confirmation, setConfirmation] = useState<SelfApprovalChange | null>(null)
    const [password, setPassword] = useState('')
    const confirmHeading = useRef<HTMLHeadingElement>(null)
    const beginButton = useRef<HTMLButtonElement>(null)
    const wasConfirming = useRef(false)
    useEffect(() => {
        setDesired(company.allowSelfApproval); setConfirmation(null); setPassword('')
    }, [company.id, company.version, company.allowSelfApproval])
    useEffect(() => {
        if (props.needsRefresh) { setConfirmation(null); setPassword(''); setDesired(company.allowSelfApproval) }
    }, [props.needsRefresh, company.allowSelfApproval])
    useEffect(() => {
        if (confirmation) confirmHeading.current?.focus()
        else if (wasConfirming.current) beginButton.current?.focus()
        wasConfirming.current = Boolean(confirmation)
    }, [confirmation])
    const close = () => { setConfirmation(null); setPassword('') }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (!confirmation || !password || props.busy || props.needsRefresh) return
        const submittedPassword = password
        setPassword('') // 비밀은 화면 state에서 즉시 삭제하며 cache/storage/log에 전달하지 않는다.
        try { await props.onSave(confirmation, submittedPassword); setConfirmation(null) }
        catch { return } // 부모가 고정 오류·재조회 상태를 전달한다. 자동 저장 재시도는 없다.
    }
    return <HudCard title="본인 승인 설정" headingLevel={2} subtitle="설정 허용과 승인 권한이 모두 있어야 작성자가 본인 전표를 승인할 수 있습니다.">
        <p className="text-sm text-hud-text-secondary">현재 설정: <strong>{company.allowSelfApproval ? '허용' : '금지'}</strong> · 회사 버전 {company.version}</p>
        {props.notice && <p role="status" aria-label="본인 승인 설정 작업 결과" className="mt-3 text-sm text-hud-text-secondary">{props.notice}</p>}
        {props.error && <p id="self-approval-error" role="alert" className="mt-3 text-sm text-hud-accent-danger">{props.error}</p>}
        {props.needsRefresh ? <Button type="button" variant="secondary" disabled={props.busy} onClick={() => void props.onRefresh()} className="mt-4 min-h-11 focus-visible:outline focus-visible:outline-2">최신 회사 다시 확인</Button>
            : confirmation ? <section aria-labelledby="self-approval-confirm-title" className="mt-4 space-y-3 rounded-lg border border-hud-border-secondary p-4"
                onKeyDown={event => { if (event.key === 'Escape' && !props.busy) close() }}>
                <h3 id="self-approval-confirm-title" ref={confirmHeading} tabIndex={-1} className="font-semibold text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">본인 승인 설정 변경 확인</h3>
                <p className="break-all text-sm text-hud-text-secondary">{company.name} · {confirmation.companyId}</p>
                <p className="text-sm text-hud-text-secondary">{company.allowSelfApproval ? '허용' : '금지'} → {confirmation.allowSelfApproval ? '허용' : '금지'} · 확인 버전 {confirmation.version}</p>
                <form onSubmit={submit} className="space-y-3">
                    <label htmlFor="self-approval-password" className="block text-sm text-hud-text-secondary">설정 변경용 현재 비밀번호</label>
                    <input id="self-approval-password" type="password" autoComplete="current-password" required disabled={props.busy}
                        value={password} onChange={event => setPassword(event.target.value)} aria-describedby={props.error ? 'self-approval-error' : undefined} aria-invalid={Boolean(props.error)}
                        className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" />
                    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={props.busy || !password} className="min-h-11 focus-visible:outline focus-visible:outline-2">{props.busy ? '처리 중…' : '설정 변경 실행'}</Button>
                        <Button type="button" variant="secondary" disabled={props.busy} onClick={close} className="min-h-11 focus-visible:outline focus-visible:outline-2">돌아가기</Button></div>
                </form>
            </section> : <>
                <fieldset disabled={props.busy} className="mt-4 space-y-2">
                    <legend className="mb-2 text-sm font-medium text-hud-text-secondary">변경할 본인 승인 설정</legend>
                    {[false, true].map(value => <label key={String(value)} className="flex min-h-11 items-center gap-3 rounded-lg border border-hud-border-secondary px-3 text-sm text-hud-text-primary">
                        <input type="radio" name="self-approval-value" checked={desired === value} onChange={() => { props.onReset(); setDesired(value) }} className="h-4 w-4 accent-hud-accent-primary focus-visible:outline focus-visible:outline-2" />{value ? '허용' : '금지'}
                    </label>)}
                </fieldset>
                <button ref={beginButton} type="button" disabled={props.busy || desired === company.allowSelfApproval}
                    onClick={() => { props.onReset(); setPassword(''); setConfirmation({ companyId: company.id, version: company.version, allowSelfApproval: desired }) }}
                    className="mt-4 min-h-11 rounded-lg bg-hud-accent-primary px-4 text-sm font-medium text-hud-text-on-accent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">변경 확인</button>
            </>}
    </HudCard>
}
