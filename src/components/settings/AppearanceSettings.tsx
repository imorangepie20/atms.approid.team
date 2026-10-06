import { Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import HudCard from '../common/HudCard'
import Button from '../common/Button'
import { useTheme } from '../../context/ThemeContext'
import { accentColors, fontSizes } from '../../context/appearance'

const themeOptions = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
] as const

const AppearanceSettings = () => {
  const { theme, accentColor, fontSize, isDark, persistenceError, setTheme, setAccentColor, setFontSize, resetAppearance } = useTheme()

  return (
    <HudCard title="Appearance" headingLevel={2}>
      <div className="space-y-8 appearance-settings">
        <p role="status" className="text-sm text-hud-text-secondary">
          {persistenceError
            ? 'Changes apply now, but could not be saved. Allow browser storage to keep them after a refresh.'
            : 'Changes apply immediately and are saved automatically in this browser.'}
        </p>

        <fieldset>
          <legend className="text-sm font-medium text-hud-text-primary mb-3">Theme</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themeOptions.map(({ id, label, icon: Icon }) => (
              <label key={id} className="cursor-pointer">
                <input type="radio" name="appearance-theme" value={id} checked={theme === id}
                  onChange={() => setTheme(id)} className="sr-only peer" />
                <span className="appearance-option flex items-center gap-3 p-4 rounded-lg border border-hud-border-secondary bg-hud-bg-primary text-hud-text-secondary">
                  <Icon size={20} aria-hidden="true" />
                  <span>{label}</span>
                  {theme === id && <Check size={18} className="ml-auto text-hud-accent-primary" aria-hidden="true" />}
                </span>
              </label>
            ))}
          </div>
          <p className="text-sm text-hud-text-secondary mt-3">System follows your device’s light or dark preference.</p>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-hud-text-primary mb-3">Accent Color</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {accentColors.map(color => (
              <label key={color.id} className="cursor-pointer">
                <input type="radio" name="appearance-accent" value={color.id} checked={accentColor === color.id}
                  onChange={() => setAccentColor(color.id)} className="sr-only peer" />
                <span className="appearance-option flex flex-col items-center gap-2 px-3 py-4 rounded-lg border border-hud-border-secondary bg-hud-bg-primary text-hud-text-secondary">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: isDark ? color.dark : color.light, color: isDark ? '#0e1726' : '#ffffff' }}>
                    {accentColor === color.id && <Check size={18} aria-hidden="true" />}
                  </span>
                  <span className="text-sm">{color.label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-hud-text-primary mb-3">Font Size</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {fontSizes.map(size => (
              <label key={size} className="cursor-pointer">
                <input type="radio" name="appearance-font-size" value={size} checked={fontSize === size}
                  onChange={() => setFontSize(size)} className="sr-only peer" />
                <span className="appearance-option flex items-center justify-between gap-2 p-4 rounded-lg border border-hud-border-secondary bg-hud-bg-primary text-hud-text-secondary">
                  <span className="capitalize">{size}</span>
                  {fontSize === size && <Check size={18} className="text-hud-accent-primary" aria-hidden="true" />}
                </span>
              </label>
            ))}
          </div>
          <p className="text-sm text-hud-text-secondary mt-3">Pretendard · Small 87.5% / Medium 100% / Large 112.5%</p>
        </fieldset>

        <section aria-labelledby="appearance-preview-heading" className="p-5 rounded-lg bg-hud-bg-primary border border-hud-border-secondary">
          <h3 id="appearance-preview-heading" className="font-medium text-hud-text-primary">Preview · 미리보기</h3>
          <p className="text-sm text-hud-text-secondary mt-2">재무 상태와 세무 정보를 편안하게 확인하세요.</p>
          <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
            <div>
              <p className="text-sm text-hud-text-secondary">예시 매출액</p>
              <p className="text-2xl font-semibold tabular-nums text-hud-text-primary">₩12,345,678</p>
            </div>
            <span className="rounded-lg px-4 py-2 bg-hud-accent-primary text-hud-text-on-accent text-sm font-medium">확정 완료</span>
          </div>
        </section>

        <div className="border-t border-hud-border-secondary pt-5">
          <Button type="button" variant="outline" onClick={resetAppearance}
            className="min-h-11" leftIcon={<RotateCcw size={16} aria-hidden="true" />}>
            Reset to defaults
          </Button>
          <p className="text-sm text-hud-text-secondary mt-2">Dark theme, Cyan accent, Medium font size.</p>
        </div>
      </div>
    </HudCard>
  )
}

export default AppearanceSettings
