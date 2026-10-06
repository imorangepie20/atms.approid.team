import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, authApi, type SessionView } from '../lib/api'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'
interface AuthContextValue {
    status: AuthStatus
    session: SessionView | null
    login: (email: string, password: string) => Promise<void>
    logout: () => Promise<void>
    expire: () => void
    adoptSession: (session: SessionView) => void
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient()
    const [status, setStatus] = useState<AuthStatus>('loading')
    const [session, setSession] = useState<SessionView | null>(null)

    const expire = useCallback(() => {
        setSession(null)
        setStatus('anonymous')
        queryClient.clear()
    }, [queryClient])

    useEffect(() => {
        const controller = new AbortController()
        authApi.session(controller.signal).then(value => {
            setSession(value)
            setStatus('authenticated')
        }).catch(error => {
            if (error instanceof DOMException && error.name === 'AbortError') return
            setSession(null)
            setStatus('anonymous')
        })
        return () => controller.abort()
    }, [])

    const login = useCallback(async (email: string, password: string) => {
        const value = await authApi.login(email, password)
        queryClient.clear()
        setSession(value)
        setStatus('authenticated')
    }, [queryClient])

    const logout = useCallback(async () => {
        if (session) {
            try { await authApi.logout(session.csrfToken) }
            catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error }
        }
        expire()
    }, [expire, session])

    // [F01 회사 화면 추가] 회사 생성이 commit된 뒤 서버가 교체한 CSRF/만료를 즉시 사용한다.
    // 사용자 identity는 서버 응답 그대로 유지하며 HttpOnly 식별자는 브라우저 쿠키가 관리한다.
    const adoptSession = useCallback((nextSession: SessionView) => {
        setSession(nextSession)
        setStatus('authenticated')
    }, [])

    const value = useMemo(() => ({ status, session, login, logout, expire, adoptSession }), [adoptSession, expire, login, logout, session, status])
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const value = useContext(AuthContext)
    if (!value) throw new Error('useAuth must be used inside AuthProvider')
    return value
}
