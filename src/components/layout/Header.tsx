import { LogOut, Menu, Moon, Sun, User } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

interface HeaderProps { onMenuToggle: () => void }

const Header = ({ onMenuToggle }: HeaderProps) => {
    const { isDark, toggleTheme } = useTheme()
    const { session, logout } = useAuth()
    const navigate = useNavigate()
    const [loggingOut, setLoggingOut] = useState(false)

    const signOut = async () => {
        setLoggingOut(true)
        try { await logout() }
        finally { setLoggingOut(false); navigate('/login', { replace: true }) }
    }

    return (
        <header className="min-h-16 bg-hud-bg-secondary/90 backdrop-blur-md border-b border-hud-border-secondary px-3 sm:px-6 flex items-center justify-between sticky top-0 z-40">
            <button type="button" aria-label="탐색 메뉴 열기" onClick={onMenuToggle}
                className="min-h-11 min-w-11 grid place-items-center rounded-lg text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                <Menu size={20} aria-hidden="true" />
            </button>
            <div className="flex items-center gap-1 sm:gap-3">
                <button type="button" aria-label={isDark ? '라이트 테마로 변경' : '다크 테마로 변경'} onClick={toggleTheme}
                    className="min-h-11 min-w-11 grid place-items-center rounded-lg text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                    {isDark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
                </button>
                <div className="hidden sm:flex items-center gap-2 text-sm text-hud-text-secondary max-w-56">
                    <User size={18} aria-hidden="true" /><span className="truncate">{session?.user.email}</span>
                </div>
                <button type="button" onClick={signOut} disabled={loggingOut}
                    className="min-h-11 inline-flex items-center gap-2 rounded-lg px-3 text-sm text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-accent-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary disabled:opacity-60">
                    <LogOut size={18} aria-hidden="true" /><span className="hidden sm:inline">{loggingOut ? '종료 중…' : '로그아웃'}</span>
                </button>
            </div>
        </header>
    )
}

export default Header
