import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import AccountLoginForm from '../../components/auth/AccountLoginForm'
import Button from '../../components/common/Button'
import { useAuth } from '../../context/AuthContext'
import { ApiError, authApi, companyApi, type AcceptedCompanyInvitation } from '../../lib/api'
import { forgetInitialInvitationToken, parseInvitationToken, readInvitationToken } from '../../lib/companyInvitationToken'

const roleLabel = { COMPANY_ADMIN: '회사 관리자', ACCOUNTANT: '회계 담당자', APPROVER: '승인자', READ_ONLY: '조회 전용', EXTERNAL_TAX: '외부 세무사' }

export default function AcceptCompanyInvitation() {
    const { status, session, logout, expire, adoptSession } = useAuth()
    const cache = useQueryClient()
    const location = useLocation()
    const navigate = useNavigate()
    const [token, setToken] = useState(readInvitationToken)
    const [password, setPassword] = useState('')
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const [result, setResult] = useState<AcceptedCompanyInvitation | null>(null)
    const resultHeading = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
        document.title = '회사 초대 수락 · ATMS'
        forgetInitialInvitationToken()
        if (location.hash) {
            setToken(parseInvitationToken(location.hash)); setResult(null); setError(''); setPassword('')
            navigate(location.pathname + location.search, { replace: true, state: null })
        }
    }, [location.hash, location.pathname, location.search, navigate])
    useEffect(() => { if (result) resultHeading.current?.focus() }, [result])

    const accept = async (event: FormEvent) => {
        event.preventDefault()
        if (!session || !token || !password || pending) return
        const submittedPassword = password
        setPassword(''); setPending(true); setError('')
        // mutation cache에 비밀 입력이 보관되지 않도록 로컬 제출 핸들러를 사용한다.
        let reauthenticated = false
        try {
            await authApi.reauthenticate(submittedPassword, session.csrfToken)
            reauthenticated = true
            const accepted = await companyApi.acceptInvitation(token, session.csrfToken)
            cache.clear(); adoptSession(accepted.session); setToken(null); setResult(accepted)
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 401) {
                if (!reauthenticated) {
                    // 비밀번호 불일치도 401이므로 세션 GET으로 실제 만료 여부를 구분한다.
                    try { await authApi.session(); setError('비밀번호를 확인하지 못했습니다. 다시 입력해 주세요.'); return }
                    catch (probe) {
                        if (!(probe instanceof ApiError && probe.status === 401)) {
                            setError('세션을 확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); return
                        }
                    }
                }
                expire(); setError('세션이 만료되었습니다. 같은 화면에서 다시 로그인해 주세요.')
            } else if (caught instanceof ApiError && caught.status === 400) {
                setToken(null); setError('이 초대를 사용할 수 없습니다. 메일의 최신 링크와 지정된 계정을 확인해 주세요.')
            } else if (caught instanceof ApiError && caught.status === 409) {
                setError('회사 소속 또는 초대 상태가 변경되었습니다. 관리자에게 확인해 주세요.')
            } else if (caught instanceof ApiError && caught.status === 403) {
                setError('이 작업을 허용하지 않습니다. 이메일 확인과 로그인 상태를 확인해 주세요.')
            } else if (caught instanceof ApiError && caught.status === 429) {
                setError('요청이 많습니다. 잠시 후 다시 시도해 주세요.')
            } else { setError('초대를 수락하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.') }
        } finally { setPending(false) }
    }
    const changeAccount = async () => {
        setPassword(''); setError(''); setPending(true)
        try { await logout() }
        catch { setError('로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.') }
        finally { setPending(false) }
    }

    return <main className="min-h-screen bg-hud-bg-primary hud-grid-bg px-5 py-10 text-hud-text-primary">
        <div className="mx-auto max-w-lg space-y-5">
            <h1 className="text-2xl font-bold">회사 초대 수락</h1>
            <div className="hud-card hud-card-bottom rounded-lg p-5 sm:p-8 space-y-5">
                {error && <p id="accept-error" role="alert" className="text-sm text-hud-accent-danger">{error}</p>}
                {result ? <>
                    <h2 ref={resultHeading} tabIndex={-1} className="text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary">초대를 수락했습니다</h2>
                    <dl className="space-y-3 text-sm"><div><dt className="text-hud-text-muted">회사 식별번호</dt><dd className="break-all">{result.member.companyId}</dd></div><div><dt className="text-hud-text-muted">부여 역할</dt><dd>{result.member.roles.map(role => roleLabel[role]).join(', ')}</dd></div></dl>
                    <p role="status" className="text-sm text-hud-text-secondary">새 세션이 적용되었습니다. 다른 기기의 기존 세션은 로그아웃되었습니다.</p>
                    <Link to="/companies" className="inline-flex min-h-11 items-center text-hud-accent-primary underline focus-visible:outline focus-visible:outline-2">회사 관리로 이동</Link>
                </> : !token ? <p role="status" className="text-sm leading-6 text-hud-text-secondary">유효한 초대 링크가 필요합니다. 새로고침하거나 이 화면을 떠났다면 메일의 최신 링크를 다시 열어 주세요.</p>
                    : status === 'loading' ? <p role="status">세션을 확인하고 있습니다.</p>
                        : status === 'anonymous' ? <>
                            <p className="text-sm leading-6 text-hud-text-secondary">메일에 지정된 이메일로 로그인해 주세요. 이메일 확인을 완료한 기존 계정이 필요합니다. 로그인만으로 초대를 수락하지 않습니다.</p>
                            <AccountLoginForm />
                        </> : <>
                            <p className="break-all text-sm">현재 로그인: <strong>{session?.user.email}</strong></p>
                            <p className="text-sm leading-6 text-hud-text-secondary">이 계정에 회사 소속과 초대의 역할이 부여됩니다. 수락하면 현재 세션이 교체되고 다른 기기는 로그아웃됩니다. 회사 식별번호와 역할은 수락 성공 후 확인할 수 있습니다.</p>
                            <form onSubmit={accept} className="space-y-3">
                                <label htmlFor="accept-password" className="block text-sm">수락용 현재 비밀번호</label>
                                <input id="accept-password" type="password" autoComplete="current-password" required value={password} disabled={pending}
                                    onChange={event => setPassword(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'accept-error' : undefined}
                                    className="min-h-11 w-full rounded-lg border border-hud-border-secondary bg-hud-bg-primary px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary" />
                                <Button type="submit" fullWidth disabled={pending || !password} className="min-h-11 focus-visible:outline focus-visible:outline-2">{pending ? '처리 중…' : '초대 수락'}</Button>
                            </form>
                            <Button variant="secondary" disabled={pending} onClick={() => void changeAccount()} className="min-h-11 focus-visible:outline focus-visible:outline-2">다른 계정으로 로그인</Button>
                        </>}
            </div>
        </div>
    </main>
}
