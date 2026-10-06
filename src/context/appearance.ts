export const APPEARANCE_STORAGE_KEY = 'atms.appearance.v1'

export const accentColors = [
  { id: 'cyan', label: 'Cyan', dark: '#00ffcc', light: '#0e7490' },
  { id: 'indigo', label: 'Indigo', dark: '#a5b4fc', light: '#4338ca' },
  { id: 'pink', label: 'Pink', dark: '#f9a8d4', light: '#be185d' },
  { id: 'orange', label: 'Orange', dark: '#fdba74', light: '#c2410c' },
  { id: 'emerald', label: 'Emerald', dark: '#6ee7b7', light: '#047857' },
  { id: 'red', label: 'Red', dark: '#fca5a5', light: '#b91c1c' },
] as const

export const fontSizes = ['small', 'medium', 'large'] as const
export const themes = ['dark', 'light', 'system'] as const

export interface AppearanceSettings {
  theme: typeof themes[number]
  accentColor: typeof accentColors[number]['id']
  fontSize: typeof fontSizes[number]
}

export const defaultAppearance: AppearanceSettings = {
  theme: 'dark', accentColor: 'cyan', fontSize: 'medium',
}

// Stored preferences are untrusted: recover each invalid field independently.
export function readAppearance(): AppearanceSettings {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (stored) {
      const value: unknown = JSON.parse(stored)
      if (value && typeof value === 'object') {
        const settings = value as Record<string, unknown>
        return {
          theme: themes.find(theme => theme === settings.theme) ?? defaultAppearance.theme,
          accentColor: accentColors.find(color => color.id === settings.accentColor)?.id ?? defaultAppearance.accentColor,
          fontSize: fontSizes.find(size => size === settings.fontSize) ?? defaultAppearance.fontSize,
        }
      }
    }
  } catch {
    // A malformed value or disabled storage must not prevent the app from loading.
  }
  try {
    const legacyTheme = localStorage.getItem('theme')
    return { ...defaultAppearance, theme: legacyTheme === 'light' ? 'light' : 'dark' }
  } catch {
    return { ...defaultAppearance }
  }
}
