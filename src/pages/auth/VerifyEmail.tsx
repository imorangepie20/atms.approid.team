import { useEffect, useState } from 'react'
import AccountPasswordForm, { accountError, AccountEmailRequestForm, AccountNotice, AccountPage, CurrentAccountLogin } from '../../components/auth/AccountPasswordForm'
import Button from '../../components/common/Button'
import { useAuth } from '../../context/AuthContext'
import { ApiError, authApi } from '../../lib/api'
import { useAccountActionToken } from '../../lib/accountActionToken'

export default function VerifyEmail() {
    const [token, discardToken] = useAccountActionToken('verify')
    const { status, expire, adoptSession } = useAuth()
    const [done, setDone] = useState(false), [error, setError] = useState(''), [sessionError, setSessionError] = useState(false), [checking, setChecking] = useState(false)
    // [F01 재진입 수정] 완료/오류 화면에서도 새 메일 링크는 새 명시적 입력으로 시작한다.
    useEffect(() => { if (token) { setDone(false); setError(''); setSessionError(false) } }, [token])
    const checkSession = async () => {
        setChecking(true); setSessionError(false)
        try { adoptSession(await authApi.session()) }
        catch (error) { if (error instanceof ApiError && error.status === 401) expire(); else setSessionError(true) }
        finally { setChecking(false) }
    }
    // [F01 확인 성공] 토큰 소유자를 자동 로그인하지 않는다. 현재 다른 계정 세션은 GET 확인 후 유지한다.
    const confirm = async (_email: string, password: string) => {
        if (!token) return
        setError('')
        try { await authApi.confirmVerification(token, password); discardToken(); setDone(true); await checkSession() }
        catch (error) {
            if (!(error instanceof ApiError) || (error.status >= 500 && error.status !== 503)) {
                discardToken(); setError('저장 결과를 확인하지 못했습니다. 로그인으로 결과를 확인하거나 새 확인 메일을 요청해 주세요. 같은 링크를 자동 재실행하지 않습니다.'); await checkSession()
            } else setError(accountError(error))
            throw error
        }
    }
    return <AccountPage title="이메일 확인" description="메일 소유자가 최종 비밀번호를 설정합니다. 확인 후 자동 로그인하지 않습니다.">
        {done ? <><AccountNotice>이메일 확인과 비밀번호 설정을 완료했습니다. 로그인해 주세요.</AccountNotice><CurrentAccountLogin /></>
            : token ? <AccountPasswordForm submitLabel="이메일 확인 실행" disabled={status === 'loading'} error={error} onSubmit={confirm} />
                : <><AccountNotice>메일의 최신 확인 링크를 다시 열거나 확인 메일을 요청해 주세요.</AccountNotice>{error && <p role="alert" className="text-sm text-hud-accent-danger">{error}</p>}<AccountEmailRequestForm submitLabel="확인 메일 요청" onSend={authApi.requestVerification} /></>}
        {sessionError && <div className="space-y-3"><p role="alert" className="text-sm text-hud-accent-danger">현재 세션을 확인하지 못했습니다. 설정 요청은 다시 보내지 않습니다.</p><Button type="button" disabled={checking} onClick={() => void checkSession()}>현재 세션 다시 확인</Button></div>}
    </AccountPage>
}
