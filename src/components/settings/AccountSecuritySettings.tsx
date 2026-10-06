import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PasswordChangeForm from '../auth/PasswordChangeForm'
import HudCard from '../common/HudCard'
import { useAuth } from '../../context/AuthContext'
import { ApiError, authApi } from '../../lib/api'

type Stage = 'reauth' | 'change' | 'logout-all'
type Notice = 'password-changed' | 'all-signed-out' | 'account-action-unknown' | 'session-expired'
const buttonClass = 'min-h-11 rounded-lg border border-hud-border-secondary px-4 py-2 text-sm text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent-primary disabled:opacity-60'

// [F01 계정 보안 추가] identity가 바뀌면 패널을 다시 생성해 입력·확인·불명확 결과를 폐기한다.
export default function AccountSecuritySettings() {
    const { session } = useAuth()
    return session ? <AccountSecurityPanel key={session.user.id} userId={session.user.id} /> : null
}
function AccountSecurityPanel({ userId }: { userId: string }) {
    const { session, expire, adoptSession } = useAuth()
    const navigate = useNavigate()
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false), [probeFailed, setProbeFailed] = useState(false)
    const [confirmation, setConfirmation] = useState<string | null>(null), [formEpoch, setFormEpoch] = useState(0)
    const active = useRef(true), inFlight = useRef(false), latestSession = useRef(session)
    const confirmHeading = useRef<HTMLHeadingElement>(null), beginButton = useRef<HTMLButtonElement>(null)
    const wasConfirming = useRef(false)
    latestSession.current = session
    // [F01 이탈 수리] DOM을 제거하는 commit에서 즉시 막는다. passive effect까지 기다리지 않는다.
    useLayoutEffect(() => { active.current = true; document.title = '계정 보안 · ATMS'; return () => { active.current = false } }, [])
    // 확인을 닫은 다음 DOM에 돌아온 시작 버튼으로 포커스를 복원한다.
    useEffect(() => {
        if (confirmation) confirmHeading.current?.focus()
        else if (wasConfirming.current) beginButton.current?.focus()
        wasConfirming.current = Boolean(confirmation)
    }, [confirmation])
    const disabled = busy || uncertain || probeFailed || !session
    const leave = (notice: Notice) => {
        active.current = false
        // [F01 안내 수리] BrowserRouter도 transition으로 경로를 갱신한다. 인증과 경로를 같은 우선순위에 묶어
        // 이전 보호 화면의 RequireSession이 안내 없는 redirect를 먼저 실행하지 않도록 한다.
        // 고정 안내 키와 경로만 전달하며 비밀번호·이메일·CSRF/메일 토큰은 넣지 않는다.
        startTransition(() => {
            expire()
            navigate('/login', { replace: true, state: { accountNotice: notice, from: '/settings?section=security' } })
        })
    }
    const probe = async (notice: Notice = 'session-expired') => {
        try {
            const current = await authApi.session()
            if (!active.current) return
            adoptSession(current); setProbeFailed(false)
        } catch (failure) {
            if (!active.current) return
            if (failure instanceof ApiError && failure.status === 401) leave(notice)
            else setProbeFailed(true)
        }
    }
    const failed = async (stage: Stage, failure: unknown) => {
        if (!active.current) return
        if (failure instanceof ApiError && failure.status === 401) {
            if (stage !== 'reauth') { leave('session-expired'); return }
            // 재확인401은 틀린 현재 비밀번호일 수 있다. 정상 현재 세션은 GET200일 때 유지한다.
            setError('현재 비밀번호를 확인하지 못했습니다. 다시 입력해 주세요.'); await probe(); return
        }
        const unknownWrite = stage !== 'reauth' && (!(failure instanceof ApiError) || (failure.status >= 500 && (stage === 'logout-all' || failure.status !== 503)))
        if (unknownWrite) {
            setUncertain(true); setConfirmation(null)
            setError('작업 결과를 확인하지 못했습니다. 같은 작업을 자동으로 다시 실행하지 않습니다. 현재 세션을 확인하거나 현재 기기 로그아웃 후 로그인해 주세요.')
            // 세션401은 작업 완료의 증명이 아니다. 성공 안내 대신 결과 미확인 안내로 이동한다.
            await probe('account-action-unknown'); return
        }
        const status = failure instanceof ApiError ? failure.status : 0
        setError(status === 400 ? '입력 형식과 새 비밀번호 조건을 확인해 주세요.'
            : status === 403 ? '보호 검사 또는 비밀번호 재확인이 필요합니다. 다시 확인해 주세요.'
                : status === 429 ? '요청 횟수가 많습니다. 잠시 후 다시 시도해 주세요.'
                    : status === 503 ? '비밀번호 검사를 사용할 수 없습니다. 새 비밀번호 저장을 진행하지 않았습니다. 잠시 후 다시 입력해 주세요.'
                        : '재확인 결과를 확인하지 못했습니다. 연결을 확인한 뒤 직접 다시 입력해 주세요.')
        if (status === 403 || status === 0 || status >= 500) await probe()
    }
    const begin = () => {
        if (disabled || inFlight.current || latestSession.current?.user.id !== userId) return false
        inFlight.current = true; setBusy(true); setError(''); return true
    }
    const finish = () => { inFlight.current = false; if (active.current) setBusy(false) }
    const change = async (currentPassword: string, newPassword: string) => {
        if (!begin()) return
        let stage: Stage = 'reauth'
        try {
            await authApi.reauthenticate(currentPassword, latestSession.current!.csrfToken)
            // 이탈/identity 교체 중 재확인이 끝나도 변경을 이어 보내지 않는다. 새 요청은 현재 CSRF를 읽는다.
            // history의 URL은 클릭 즉시 바뀌지만 Router의 DOM commit은 늦을 수 있다.
            // cleanup 전에도 다른 section/경로로 이동한 사용자의 후속 변경 POST를 보내지 않는다.
            if (!active.current || latestSession.current?.user.id !== userId
                || window.location.pathname !== '/settings' || new URLSearchParams(window.location.search).get('section') !== 'security') return
            stage = 'change'; await authApi.changePassword(newPassword, latestSession.current.csrfToken)
            if (active.current) leave('password-changed')
        } catch (failure) { await failed(stage, failure) } finally { finish() }
    }
    const endAll = async () => {
        if (confirmation !== userId || !begin()) return
        try { await authApi.logoutAll(latestSession.current!.csrfToken); if (active.current) leave('all-signed-out') }
        catch (failure) { await failed('logout-all', failure) } finally { finish() }
    }
    const checkAgain = async () => {
        if (inFlight.current) return
        inFlight.current = true; setBusy(true)
        try { await probe(uncertain ? 'account-action-unknown' : 'session-expired') } finally { finish() }
    }
    const endCurrent = async () => {
        if (inFlight.current) return
        inFlight.current = true; setBusy(true)
        // [F01 현재 기기 종료 수리] 기존 logout API/CSRF/401 계약을 재사용한다. Context.logout의 즉시 expire를
        // 호출하면 보호 redirect가 먼저 실행되므로, 인증 정리는 성공/401 뒤 위의 같은 transition에서 한다.
        try {
            try { await authApi.logout(latestSession.current!.csrfToken) }
            catch (failure) { if (!(failure instanceof ApiError && failure.status === 401)) throw failure }
            if (active.current) leave(uncertain ? 'account-action-unknown' : 'session-expired')
        }
        catch { if (active.current) { setProbeFailed(true); setError('현재 기기 로그아웃 결과를 확인하지 못했습니다. 다시 세션을 확인해 주세요.') } }
        finally { finish() }
    }
    return <div className="min-w-0 space-y-6">
        <p className="break-all text-sm text-hud-text-secondary">현재 계정: <strong>{session?.user.email}</strong></p>
        {busy && <p role="status" className="text-sm text-hud-text-muted">요청을 처리하고 있습니다. 중복 요청을 보내지 않습니다.</p>}
        <HudCard title="비밀번호 변경" headingLevel={2} subtitle="이 계정의 모든 기기에 적용됩니다.">
            <PasswordChangeForm key={formEpoch} disabled={disabled || Boolean(confirmation)} error={error + (probeFailed ? ' 현재 세션도 확인하지 못했습니다. 작업을 다시 보내지 않고 세션 조회를 다시 시도해 주세요.' : '')} onError={setError} onSubmit={change} />
        </HudCard>
        {(uncertain || probeFailed) && <div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={busy} onClick={() => void checkAgain()}>현재 세션 다시 확인</button><button type="button" className={buttonClass} disabled={busy} onClick={() => void endCurrent()}>현재 기기 로그아웃 후 로그인</button></div>}
        <HudCard title="모든 기기 로그아웃" headingLevel={2} subtitle="현재 기기도 포함하여 이 계정의 모든 로그인을 종료합니다.">
            <p className="text-sm text-hud-text-muted mb-4">비밀번호와 회사 소속·역할은 유지됩니다. 다른 사용자 계정의 세션은 종료하지 않습니다.</p>
            {confirmation ? <section className="space-y-4"><h3 ref={confirmHeading} tabIndex={-1} className="text-hud-text-primary font-semibold focus-visible:outline focus-visible:outline-2">전체 기기 종료 확인</h3><p className="break-all text-sm text-hud-text-secondary">{session?.user.email} 계정의 현재 기기를 포함한 모든 기기에서 다시 로그인해야 합니다.</p><div className="flex flex-wrap gap-3"><button type="button" className={`${buttonClass} text-hud-accent-danger`} disabled={disabled} onClick={() => void endAll()}>모든 기기 로그아웃 확정</button><button type="button" className={buttonClass} disabled={busy} onClick={() => { setConfirmation(null); setError('') }}>취소</button></div></section>
                : <button type="button" ref={beginButton} className={buttonClass} disabled={disabled} onClick={() => { setFormEpoch(value => value + 1); setError(''); setConfirmation(userId) }}>모든 기기 로그아웃</button>}
        </HudCard>
    </div>
}
