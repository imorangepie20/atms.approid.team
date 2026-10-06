import { createContext, useContext, useEffect, useLayoutEffect, useState, ReactNode } from 'react'
import {
  APPEARANCE_STORAGE_KEY, accentColors, AppearanceSettings, defaultAppearance, readAppearance,
} from './appearance'

interface ThemeContextProps extends AppearanceSettings {
  isDark: boolean
  persistenceError: boolean
  toggleTheme: () => void
  setTheme: (theme: AppearanceSettings['theme']) => void
  setAccentColor: (accentColor: AppearanceSettings['accentColor']) => void
  setFontSize: (fontSize: AppearanceSettings['fontSize']) => void
  resetAppearance: () => void
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [appearance, setAppearance] = useState(readAppearance)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [persistenceError, setPersistenceError] = useState(false)
  const isDark = appearance.theme === 'system' ? systemDark : appearance.theme === 'dark'

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useLayoutEffect(() => {
    const root = document.documentElement
    const accent = accentColors.find(color => color.id === appearance.accentColor)!
    const hex = isDark ? accent.dark : accent.light
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
    root.classList.toggle('dark', isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
    root.style.setProperty('--hud-accent-rgb', rgb.join(' '))
    root.style.setProperty('--hud-glow-primary-rgb', rgb.join(', '))
    root.dataset.accent = appearance.accentColor
    root.dataset.fontSize = appearance.fontSize
  }, [isDark, appearance.accentColor, appearance.fontSize])

  useEffect(() => {
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
      setPersistenceError(false)
    } catch {
      setPersistenceError(true)
    }
  }, [appearance])

  return (
    <ThemeContext.Provider value={{
      ...appearance, isDark, persistenceError,
      toggleTheme: () => setAppearance(current => ({ ...current, theme: isDark ? 'light' : 'dark' })),
      setTheme: theme => setAppearance(current => ({ ...current, theme })),
      setAccentColor: accentColor => setAppearance(current => ({ ...current, accentColor })),
      setFontSize: fontSize => setAppearance(current => ({ ...current, fontSize })),
      resetAppearance: () => setAppearance({ ...defaultAppearance }),
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
