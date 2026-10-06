// [F01 초대 추가] Router 생성 전 fragment를 제거하고 화면 메모리로만 전달한다.
function captureFragment(): string | null {
    if (window.location.pathname !== '/accept-company-invitation' || !window.location.hash) return null
    const token = parseInvitationToken(window.location.hash)
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    return token
}
let initialToken = captureFragment()
// StrictMode 두 초기 렌더가 같은 값을 읽는다. commit 뒤 임시 변수는 지운다.
export function parseInvitationToken(hash: string): string | null { return /^#token=([0-9a-f]{64})$/.exec(hash)?.[1] ?? null }
export function readInvitationToken(): string | null {
    if (window.location.hash) initialToken = captureFragment()
    return initialToken
}
export function forgetInitialInvitationToken() { initialToken = null }
