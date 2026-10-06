import { FormEvent, useEffect, useId, useRef, useState } from 'react'
import Button from '../common/Button'

interface Props {
    disabled: boolean
    error: string
    onError: (message: string) => void
    onSubmit: (currentPassword: string, newPassword: string) => Promise<void>
}
const inputClass = 'min-h-11 min-w-0 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'

// [F01 변경 양식 추가] 현재/새/확인 값을 화면에만 두고 최종 제출 때 서버 목적별로 분리한다.
export default function PasswordChangeForm({ disabled, error, onError, onSubmit }: Props) {
    const id = useId()
    const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
    const inFlight = useRef(false), errorFocus = useRef<HTMLParagraphElement>(null), currentFocus = useRef<HTMLInputElement>(null)
    useEffect(() => { if (error) errorFocus.current?.focus() }, [error])
    const clear = () => { setCurrent(''); setPassword(''); setConfirmation('') }
    const submit = async (event: FormEvent) => {
        event.preventDefault(); if (disabled || inFlight.current) return
        // JS length는 Unicode를 두 칸으로 셀 수 있다. 서버와 같은 코드 포인트 수이며 trim/normalize하지 않는다.
        const currentLength = Array.from(current).length, length = Array.from(password).length
        if (currentLength < 1 || currentLength > 128) { onError('현재 비밀번호는 Unicode 문자 1~128개로 입력해 주세요.'); return }
        if (length < 15 || length > 128) { onError('새 비밀번호는 Unicode 문자 15~128개로 입력해 주세요.'); return }
        if (password !== confirmation) { onError('새 비밀번호 확인이 일치하지 않습니다.'); return }
        const oldValue = current, newValue = password
        clear(); onError(''); inFlight.current = true
        // 비밀은 제출 직후 state에서 삭제한다. 부모의 로컬 async 처리 동안만 사용하고 자동 재시도하지 않는다.
        try { await onSubmit(oldValue, newValue) } finally { inFlight.current = false }
    }
    return <form onSubmit={submit} className="space-y-4">
        <p id={`${id}-policy`} className="text-sm text-hud-text-muted">새 비밀번호는 15~128자입니다. Unicode와 공백을 보존하며 흔하거나 유출된 비밀번호는 사용할 수 없습니다. 변경하면 현재 기기를 포함한 모든 기기에서 다시 로그인해야 합니다.</p>
        <fieldset disabled={disabled} className="min-w-0 space-y-4"><legend className="sr-only">비밀번호 변경 입력</legend>
            <div><label htmlFor={`${id}-current`} className="mb-2 block text-sm text-hud-text-secondary">현재 비밀번호</label><input id={`${id}-current`} ref={currentFocus} type="password" autoComplete="current-password" required value={current} onChange={event => { setCurrent(event.target.value); onError('') }} aria-describedby={error ? `${id}-error` : undefined} className={inputClass} /></div>
            <div><label htmlFor={`${id}-new`} className="mb-2 block text-sm text-hud-text-secondary">새 비밀번호</label><input id={`${id}-new`} type="password" autoComplete="new-password" required value={password} onChange={event => { setPassword(event.target.value); onError('') }} aria-describedby={`${id}-policy${error ? ` ${id}-error` : ''}`} className={inputClass} /></div>
            <div><label htmlFor={`${id}-confirmation`} className="mb-2 block text-sm text-hud-text-secondary">새 비밀번호 확인</label><input id={`${id}-confirmation`} type="password" autoComplete="new-password" required value={confirmation} onChange={event => { setConfirmation(event.target.value); onError('') }} aria-describedby={error ? `${id}-error` : undefined} className={inputClass} /></div>
        </fieldset>
        {error && <div className="space-y-2"><p id={`${id}-error`} ref={errorFocus} tabIndex={-1} role="alert" className="text-sm text-hud-accent-danger focus-visible:outline focus-visible:outline-2">{error}</p><button type="button" disabled={disabled} onClick={() => currentFocus.current?.focus()} className="min-h-11 text-sm underline text-hud-accent-primary disabled:opacity-60">비밀번호 입력으로 이동</button></div>}
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={disabled} className="min-h-11 focus-visible:outline focus-visible:outline-2">비밀번호 변경</Button><Button type="button" variant="secondary" disabled={disabled} onClick={() => { clear(); onError(''); currentFocus.current?.focus() }} className="min-h-11 focus-visible:outline focus-visible:outline-2">입력 취소</Button></div>
    </form>
}
