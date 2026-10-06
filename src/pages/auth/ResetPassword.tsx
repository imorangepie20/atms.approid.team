import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountPasswordForm, { accountError, AccountNotice, AccountPage } from '../../components/auth/AccountPasswordForm'
import { useAuth } from '../../context/AuthContext'
import { ApiError, authApi } from '../../lib/api'
import { useAccountActionToken } from '../../lib/accountActionToken'

export default function ResetPassword() {
    const [token, discardToken] = useAccountActionToken('reset')
    const { status, expire, adoptSession } = useAuth()
    const [done, setDone] = useState(false), [error, setError] = useState('')
    // [F01 재진입 수정] 새 복구 링크를 열면 이전 완료/오류 안내를 비우고 새 입력을 기다린다.
    useEffect(() => { if (token) { setDone(false); setError('') } }, [token])
    const confirm = async (_email: string, password: string) => {
        if (!token) return
        setError('')
        try {
            await authApi.confirmReset(token, password)
            // [F01 복구 성공] 서버가 대상 전체 세션과 현재 쿠키를 폐기한다. 현재 캐시/인증도 정리한다.
            discardToken(); expire(); setDone(true)
        } catch (error) {
            if (!(error instanceof ApiError) || (error.status >= 500 && error.status !== 503)) {
                // commit 뒤 응답 유실 가능성: 같은 토큰을 재소비하지 않으며 조회로 현재 인증만 확인한다.
                discardToken(); setError('저장 결과를 확인하지 못했습니다. 새 비밀번호로 로그인하거나 새 복구 메일을 요청해 주세요. 같은 링크를 자동 재실행하지 않습니다.')
                try { adoptSession(await authApi.session()) } catch (probe) { if (probe instanceof ApiError && probe.status === 401) expire() }
            } else setError(accountError(error))
            throw error
        }
    }
    return <AccountPage title="비밀번호 재설정" description="새 비밀번호를 저장하면 이 계정의 모든 기기에서 다시 로그인해야 합니다.">
        {done ? <AccountNotice>비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.</AccountNotice>
            : token ? <AccountPasswordForm submitLabel="새 비밀번호 저장" disabled={status === 'loading'} error={error} onSubmit={confirm} />
                : <><AccountNotice>메일의 최신 복구 링크를 다시 열어 주세요.</AccountNotice>{error && <p role="alert" className="text-sm text-hud-accent-danger">{error}</p>}<Link to="/forgot-password" className="inline-flex min-h-11 items-center text-hud-accent-primary underline focus-visible:outline focus-visible:outline-2">새 복구 메일 요청</Link></>}
    </AccountPage>
}
