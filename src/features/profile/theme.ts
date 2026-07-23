import type { ColorMode, ThemeKey } from './types'

interface ThemeColors {
  primary: string
  primaryStrong: string
  primarySoft: string
  contrast: string
  accent: string
}

export interface ThemeOption extends ThemeColors {
  key: ThemeKey
  label: string
  note: string
  dark: ThemeColors
}

export const themeOptions: ThemeOption[] = [
  { key: 'sage', label: 'Verde sálvia', note: 'Natural e equilibrado', primary: '73 111 96', primaryStrong: '52 83 70', primarySoft: '228 237 231', contrast: '255 255 255', accent: '74 124 91', dark: { primary: '123 174 151', primaryStrong: '151 197 176', primarySoft: '35 55 47', contrast: '13 20 17', accent: '135 187 160' } },
  { key: 'petrol', label: 'Azul petróleo claro', note: 'Sóbrio e financeiro', primary: '52 103 111', primaryStrong: '38 78 84', primarySoft: '225 237 239', contrast: '255 255 255', accent: '64 119 128', dark: { primary: '103 169 179', primaryStrong: '137 195 203', primarySoft: '28 51 55', contrast: '11 20 22', accent: '118 184 194' } },
  { key: 'lilac', label: 'Lilás pastel', note: 'Suave e contemporâneo', primary: '117 96 143', primaryStrong: '86 68 108', primarySoft: '238 233 244', contrast: '255 255 255', accent: '132 105 154', dark: { primary: '177 151 206', primaryStrong: '202 178 226', primarySoft: '49 40 60', contrast: '20 16 24', accent: '188 162 215' } },
  { key: 'rose', label: 'Rosa queimado', note: 'Acolhedor e discreto', primary: '145 92 96', primaryStrong: '111 67 71', primarySoft: '246 232 232', contrast: '255 255 255', accent: '157 101 104', dark: { primary: '207 142 147', primaryStrong: '228 171 175', primarySoft: '63 39 42', contrast: '24 14 16', accent: '216 151 155' } },
  { key: 'peach', label: 'Pêssego', note: 'Leve e caloroso', primary: '153 104 75', primaryStrong: '116 76 54', primarySoft: '249 235 225', contrast: '255 255 255', accent: '170 114 80', dark: { primary: '211 153 117', primaryStrong: '231 181 149', primarySoft: '65 44 34', contrast: '25 16 12', accent: '221 163 127' } },
  { key: 'sand', label: 'Areia suave', note: 'Neutro com toque dourado', primary: '132 108 64', primaryStrong: '99 80 46', primarySoft: '244 237 221', contrast: '255 255 255', accent: '151 121 67', dark: { primary: '201 172 111', primaryStrong: '223 198 143', primarySoft: '58 49 31', contrast: '22 18 10', accent: '211 181 120' } },
]

export const defaultTheme = themeOptions[0]

export function isThemeKey(value: unknown): value is ThemeKey {
  return themeOptions.some((theme) => theme.key === value)
}

export function isColorMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'dark'
}

function storageKey(userId?: string | null) {
  return userId ? `multiple-finance:color-mode:${userId}` : 'multiple-finance:color-mode'
}

export function readColorMode(userId?: string | null): ColorMode {
  try {
    const stored = localStorage.getItem(storageKey(userId)) ?? localStorage.getItem(storageKey())
    if (isColorMode(stored)) return stored
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function storeColorMode(mode: ColorMode, userId?: string | null) {
  try {
    localStorage.setItem(storageKey(), mode)
    if (userId) localStorage.setItem(storageKey(userId), mode)
  } catch {
    // The selected mode still works for the current session.
  }
}

export function applyTheme(themeKey: ThemeKey, colorMode?: ColorMode) {
  const theme = themeOptions.find((option) => option.key === themeKey) ?? defaultTheme
  const root = document.documentElement
  const mode = colorMode ?? (isColorMode(root.dataset.colorMode) ? root.dataset.colorMode : readColorMode())
  const colors = mode === 'dark' ? theme.dark : theme
  root.dataset.theme = theme.key
  root.style.setProperty('--color-primary', colors.primary)
  root.style.setProperty('--color-primary-strong', colors.primaryStrong)
  root.style.setProperty('--color-primary-soft', colors.primarySoft)
  root.style.setProperty('--color-primary-contrast', colors.contrast)
  root.style.setProperty('--color-accent', colors.accent)
}

export function applyColorMode(mode: ColorMode, themeKey?: ThemeKey) {
  const root = document.documentElement
  root.dataset.colorMode = mode
  root.style.colorScheme = mode
  applyTheme(themeKey ?? (isThemeKey(root.dataset.theme) ? root.dataset.theme : defaultTheme.key), mode)
}

export function initializeColorMode() {
  applyColorMode(readColorMode())
}
