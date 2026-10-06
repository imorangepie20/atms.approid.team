import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AccountLoginForm from '../../components/auth/AccountLoginForm'
import { AccountNotice } from '../../components/auth/AccountPasswordForm'
import { useAuth } from '../../context/AuthContext'

const Login = () => {
    const { status } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    // [F01 계정 보안 안내 추가] router state는 고정 키만 해석한다. 임의 문자열/서버 오류/입력값은 출력하지 않는다.
    const notices: Record<string, string> = {
        'password-changed': '비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요.',
        'all-signed-out': '모든 기기에서 로그아웃했습니다. 다시 로그인해 주세요.',
        'account-action-unknown': '계정 작업 결과를 확인하지 못했습니다. 로그인으로 결과를 확인해 주세요.',
        'session-expired': '세션이 만료되었습니다. 다시 로그인해 주세요.',
    }
    const noticeKey = location.state?.accountNotice
    // [F01 호환성 수리] ES2020에서 사용 가능한 자체 속성 검사로 __proto__ 등 상속된 이름을 차단한다.
    const notice = typeof noticeKey === 'string' && Object.prototype.hasOwnProperty.call(notices, noticeKey) ? notices[noticeKey] : ''
    const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/')
        ? location.state.from : '/accounting/rules'
    useEffect(() => { document.title = '로그인 · ATMS' }, [])
    if (status === 'authenticated') return <Navigate to={from} replace />
    // [F01 양식 분리] 일반 로그인은 기존 보호 경로 복귀를 유지한다.
    return <main className="min-h-screen bg-hud-bg-primary hud-grid-bg flex items-center justify-center p-6">
        <div className="w-full max-w-md">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-3 mb-6">
                    <div aria-hidden="true" className="w-12 h-12 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-lg flex items-center justify-center font-bold text-xl text-hud-bg-primary">A</div>
                    <span className="font-bold text-2xl text-hud-text-primary text-glow">ATMS</span>
                </div>
                <h1 className="text-2xl font-bold text-hud-text-primary">계정 로그인</h1>
                <p className="text-hud-text-muted mt-2">회사별 회계·세무 업무 공간에 접속합니다.</p>
            </div>
            <div className="hud-card hud-card-bottom rounded-lg p-6 sm:p-8">
                {notice && <div className="mb-4"><AccountNotice>{notice}</AccountNotice></div>}
                <AccountLoginForm onSuccess={() => navigate(from, { replace: true })} />
                {/* [F01 계정 도움 추가] 링크 이동만으로 가입/발송/토큰 소비를 실행하지 않는다. */}
                <nav aria-label="계정 도움" className="mt-5 flex flex-wrap gap-x-4 text-sm">
                    <Link to="/register" className="inline-flex min-h-11 items-center text-hud-accent-primary underline focus-visible:outline focus-visible:outline-2">계정 가입</Link>
                    <Link to="/verify-email" className="inline-flex min-h-11 items-center text-hud-accent-primary underline focus-visible:outline focus-visible:outline-2">확인 메일 다시 요청</Link>
                    <Link to="/forgot-password" className="inline-flex min-h-11 items-center text-hud-accent-primary underline focus-visible:outline focus-visible:outline-2">비밀번호 복구</Link>
                </nav>
            </div>
        </div>
    </main>
}
export default Login
