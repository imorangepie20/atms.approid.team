import { useEffect, useState } from 'react'
export type AccountAction = 'verify' | 'reset'
const paths: Record<AccountAction, string> = { verify: '/verify-email', reset: '/reset-password' }
type CapturedToken = { action: AccountAction; token: string | null }
const listeners = new Set<(value: CapturedToken) => boolean>()
// [F01 계정 토큰 추가] Router가 읽기 전에 URL에서 제거하고 목적/경로별 메모리로만 전달한다.
let initial: CapturedToken | null = capture()
function capture() {
    const action = (Object.keys(paths) as AccountAction[]).find(key => paths[key] === window.location.pathname)
    if (!action || !window.location.hash) return null
    const token = /^#token=([a-f0-9]{64})$/.exec(window.location.hash)?.[1] ?? null
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    return { action, token }
}
// [F01 재진입 수정] 같은 문서의 메일 링크는 새 마운트 없이 popstate/hashchange를 발생시킨다.
// 모듈 로딩 때 Router보다 먼저 등록하여 Router가 읽기 전에 fragment를 지운다.
function captureNavigation() {
    const value = capture()
    if (!value) return
    initial = value
    let delivered = false
    for (const listener of listeners) delivered = listener(value) || delivered
    // 현재 목적 화면이 받았으면 임시 복사본을 지운다. 다른 경로는 새 화면의 초기화가 읽는다.
    if (delivered) initial = null
}
window.addEventListener('popstate', captureNavigation)
window.addEventListener('hashchange', captureNavigation)
// 개발 중 모듈 교체에도 이전 리스너가 먼저 토큰을 가로채지 않게 정리한다.
import.meta.hot?.dispose(() => {
    window.removeEventListener('popstate', captureNavigation)
    window.removeEventListener('hashchange', captureNavigation)
    initial = null; listeners.clear()
})
export function useAccountActionToken(action: AccountAction) {
    const [token, setToken] = useState<string | null>(() => {
        if (window.location.hash) initial = capture()
        return initial?.action === action ? initial.token : null
    })
    // StrictMode 초기 렌더는 같은 값을 읽고 commit 뒤 임시 값을 지운다.
    // 같은 목적의 새 링크만 현재 화면에 전달하며 이탈 때 구독과 임시 복사본을 폐기한다.
    useEffect(() => {
        initial = null
        const receive = (value: CapturedToken) => {
            if (value.action !== action) return false
            setToken(value.token); return true
        }
        listeners.add(receive)
        return () => { listeners.delete(receive); initial = null }
    }, [action])
    return [token, () => setToken(null)] as const
}
