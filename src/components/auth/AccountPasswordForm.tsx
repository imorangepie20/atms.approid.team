import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../common/Button'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

const inputClass = 'min-h-11 min-w-0 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary'
const linkClass = 'inline-flex min-h-11 items-center text-hud-accent-primary underline focus-visible:outline focus-visible:outline-2'
export const accountAcceptedText = '요청을 접수했습니다. 안내 대상 계정이면 메일이 발송됩니다. 수신함과 스팸함을 확인해 주세요.'
export function accountError(error: unknown) {
    if (error instanceof ApiError) {
        if (error.status === 400) return '입력 형식과 비밀번호 조건, 메일의 최신 링크를 확인해 주세요.'
        if (error.status === 403) return '요청을 처리할 수 없습니다. 같은 서비스 주소에서 다시 확인해 주세요.'
        if (error.status === 429) return '요청 횟수가 많습니다. 잠시 후 다시 시도해 주세요.'
        if (error.status === 503) return '비밀번호 검사 또는 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
    }
    return '요청 결과를 확인하지 못했습니다. 연결을 확인한 뒤 직접 다시 시도해 주세요.'
}
// [F01 공통 계정 화면] 계약에 없는 이름/약관/역할 입력을 만들지 않는다.
export function AccountPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
    useEffect(() => { document.title = `${title} · ATMS` }, [title])
    return <main className="min-h-screen bg-hud-bg-primary hud-grid-bg flex items-center justify-center p-4 sm:p-6"><div className="w-full max-w-lg min-w-0 space-y-6">
        <header><p className="font-bold text-xl text-hud-accent-primary">ATMS</p><h1 className="mt-3 text-2xl font-bold text-hud-text-primary">{title}</h1><p className="mt-2 text-sm text-hud-text-muted">{description}</p></header>
        <div className="hud-card hud-card-bottom rounded-lg p-5 sm:p-8 space-y-5">{children}</div>
        <nav aria-label="계정 도움" className="flex flex-wrap gap-x-5 text-sm"><Link className={linkClass} to="/login">로그인으로 이동</Link><Link className={linkClass} to="/register">계정 가입</Link><Link className={linkClass} to="/verify-email">확인 메일 다시 요청</Link><Link className={linkClass} to="/forgot-password">비밀번호 복구</Link></nav>
    </div></main>
}
export function AccountNotice({ children }: { children: ReactNode }) {
    const focus = useRef<HTMLParagraphElement>(null)
    useEffect(() => { focus.current?.focus() }, [])
    return <p ref={focus} tabIndex={-1} role="status" className="text-sm text-hud-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">{children}</p>
}
export function CurrentAccountLogin() {
    const { status, session, logout } = useAuth()
    const [error, setError] = useState(''), [busy, setBusy] = useState(false)
    const navigate = useNavigate()
    if (status !== 'authenticated') return null
    return <section className="space-y-3 text-sm text-hud-text-secondary"><p className="break-all">현재 로그인: {session?.user.email}</p><Button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try { await logout(); navigate('/login') } catch { setError('로그아웃 결과를 확인하지 못했습니다. 다시 확인해 주세요.') }
        finally { setBusy(false) }
    }}>다른 계정으로 로그인</Button>{error && <p role="alert">{error}</p>}</section>
}
interface PasswordProps { withEmail?: boolean; passwordLabel?: string; submitLabel: string; disabled?: boolean; error?: string; onSubmit: (email: string, password: string) => Promise<void> }
export default function AccountPasswordForm(props: PasswordProps) {
    const id = useId()
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
    const [clientError, setClientError] = useState(''), [busy, setBusy] = useState(false)
    const inFlight = useRef(false), errorFocus = useRef<HTMLParagraphElement>(null), passwordFocus = useRef<HTMLInputElement>(null)
    const error = clientError || props.error
    useEffect(() => { if (error) errorFocus.current?.focus() }, [error])
    const submit = async (event: FormEvent) => {
        event.preventDefault(); if (busy || inFlight.current || props.disabled) return
        // [F01 입력 검사] UTF-16 length/minLength 대신 코드 포인트 수를 세고 원문을 바꾸지 않는다.
        const count = Array.from(password).length
        if (count < 15 || count > 128) { setClientError('비밀번호는 Unicode 문자 15~128개로 입력해 주세요.'); return }
        if (password !== confirmation) { setClientError('비밀번호 확인이 일치하지 않습니다.'); return }
        const submittedPassword = password
        setPassword(''); setConfirmation(''); setClientError('')
        inFlight.current = true; setBusy(true)
        try { await props.onSubmit(email, submittedPassword) } catch { /* 부모가 고정 오류를 전달한다. 자동 재전송 없음. */ }
        finally { inFlight.current = false; setBusy(false) }
    }
    return <form onSubmit={submit} className="space-y-4"><p id={`${id}-policy`} className="text-sm text-hud-text-muted">비밀번호는 15~128자이며 Unicode와 공백을 사용할 수 있습니다. 흔하거나 유출된 비밀번호는 사용할 수 없습니다.</p>
        <fieldset disabled={busy || props.disabled} className="min-w-0 space-y-4"><legend className="sr-only">계정 비밀번호 입력</legend>
            {props.withEmail && <div><label className="mb-2 block text-sm text-hud-text-secondary" htmlFor={`${id}-email`}>이메일</label><input id={`${id}-email`} type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className={inputClass} /></div>}
            <div><label className="mb-2 block text-sm text-hud-text-secondary" htmlFor={`${id}-password`}>{props.passwordLabel ?? '새 비밀번호'}</label><input id={`${id}-password`} ref={passwordFocus} type="password" autoComplete="new-password" required value={password} onChange={event => { setPassword(event.target.value); setClientError('') }} aria-describedby={`${id}-policy${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)} className={inputClass} /></div>
            <div><label className="mb-2 block text-sm text-hud-text-secondary" htmlFor={`${id}-confirmation`}>비밀번호 확인</label><input id={`${id}-confirmation`} type="password" autoComplete="new-password" required value={confirmation} onChange={event => { setConfirmation(event.target.value); setClientError('') }} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error)} className={inputClass} /></div>
        </fieldset>
        {error && <div className="space-y-2"><p id={`${id}-error`} ref={errorFocus} tabIndex={-1} role="alert" className="text-sm text-hud-accent-danger focus-visible:outline focus-visible:outline-2">{error}</p><button type="button" className={linkClass} onClick={() => passwordFocus.current?.focus()}>비밀번호 입력으로 이동</button></div>}
        <Button type="submit" fullWidth disabled={busy || props.disabled} className="min-h-11 focus-visible:outline focus-visible:outline-2">{busy ? '처리 중…' : props.submitLabel}</Button>
    </form>
}
export function AccountEmailRequestForm({ submitLabel, onSend }: { submitLabel: string; onSend: (email: string) => Promise<unknown> }) {
    const id = useId(), [email, setEmail] = useState(''), [error, setError] = useState(''), [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false)
    const inFlight = useRef(false), focus = useRef<HTMLParagraphElement>(null)
    useEffect(() => { if (error || accepted) focus.current?.focus() }, [error, accepted])
    const submit = async (event: FormEvent) => {
        event.preventDefault(); if (inFlight.current) return
        inFlight.current = true; setBusy(true); setError(''); setAccepted(false)
        try { await onSend(email); setAccepted(true) } catch (error) { setError(accountError(error)) }
        finally { inFlight.current = false; setBusy(false) }
    }
    return <form onSubmit={submit} className="space-y-4"><label htmlFor={`${id}-email`} className="block text-sm text-hud-text-secondary">이메일</label><input id={`${id}-email`} type="email" required maxLength={254} autoComplete="email" disabled={busy} value={email} onChange={event => setEmail(event.target.value)} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error)} className={inputClass} />
        {(error || accepted) && <p id={`${id}-error`} ref={focus} tabIndex={-1} role={error ? 'alert' : 'status'} className="text-sm text-hud-text-secondary focus-visible:outline focus-visible:outline-2">{error || accountAcceptedText}</p>}
        <Button type="submit" fullWidth disabled={busy} className="min-h-11 focus-visible:outline focus-visible:outline-2">{busy ? '처리 중…' : submitLabel}</Button>
    </form>
}
