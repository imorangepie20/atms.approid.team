import { FormEvent, useState } from 'react'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import Button from '../common/Button'
import { useAuth } from '../../context/AuthContext'
import { ApiError } from '../../lib/api'

// [F01 공유 로그인 추가] 부모가 성공 후 이동을 결정한다. 초대 화면은 이동하지 않는다.
export default function AccountLoginForm({ onSuccess }: { onSuccess?: () => void }) {
    const { login } = useAuth()
    const [showPassword, setShowPassword] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (submitting || !email || !password) return
        const submittedPassword = password
        setPassword(''); setShowPassword(false); setError(''); setSubmitting(true)
        try { await login(email, submittedPassword); onSuccess?.() }
        catch (caught) {
            setError(caught instanceof ApiError && caught.status === 401
                ? '이메일 또는 비밀번호를 확인해 주세요.'
                : '로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
        } finally { setSubmitting(false) }
    }
    return <form onSubmit={submit} className="space-y-6" noValidate>
        <div>
            <label htmlFor="login-email" className="block text-sm text-hud-text-secondary mb-2">이메일</label>
            <div className="relative">
                <Mail aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-hud-text-muted" size={18} />
                <input id="login-email" type="email" value={email} onChange={event => setEmail(event.target.value)}
                    autoComplete="email" required aria-required="true" disabled={submitting}
                    aria-describedby={error ? 'login-error' : undefined} aria-invalid={Boolean(error)}
                    className="w-full min-h-11 pl-12 pr-4 py-3 bg-hud-bg-primary border border-hud-border-secondary rounded-lg text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" />
            </div>
        </div>
        <div>
            <label htmlFor="login-password" className="block text-sm text-hud-text-secondary mb-2">비밀번호</label>
            <div className="relative">
                <Lock aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-hud-text-muted" size={18} />
                <input id="login-password" type={showPassword ? 'text' : 'password'} value={password}
                    onChange={event => setPassword(event.target.value)} autoComplete="current-password" required aria-required="true"
                    aria-describedby={error ? 'login-error' : undefined} aria-invalid={Boolean(error)} disabled={submitting}
                    className="w-full min-h-11 pl-12 pr-12 py-3 bg-hud-bg-primary border border-hud-border-secondary rounded-lg text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" />
                <button type="button" disabled={submitting} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'} onClick={() => setShowPassword(value => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-h-11 min-w-11 grid place-items-center text-hud-text-muted hover:text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
            </div>
        </div>
        {error && <p id="login-error" role="alert" className="text-sm text-hud-accent-danger">{error}</p>}
        <Button variant="primary" fullWidth glow type="submit" disabled={submitting || !email || !password}
            className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud-text-primary">
            {submitting ? '로그인 중…' : '로그인'}
        </Button>
    </form>
}
