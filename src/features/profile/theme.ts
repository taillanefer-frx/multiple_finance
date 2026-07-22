import type { ThemeKey } from './types'

export interface ThemeOption {
  key: ThemeKey
  label: string
  note: string
  primary: string
  primaryStrong: string
  primarySoft: string
  contrast: string
  accent: string
}

export const themeOptions: ThemeOption[] = [
  { key: 'sage', label: 'Verde sálvia', note: 'Natural e equilibrado', primary: '73 111 96', primaryStrong: '52 83 70', primarySoft: '228 237 231', contrast: '255 255 255', accent: '74 124 91' },
  { key: 'petrol', label: 'Azul petróleo claro', note: 'Sóbrio e financeiro', primary: '52 103 111', primaryStrong: '38 78 84', primarySoft: '225 237 239', contrast: '255 255 255', accent: '64 119 128' },
  { key: 'lilac', label: 'Lilás pastel', note: 'Suave e contemporâneo', primary: '117 96 143', primaryStrong: '86 68 108', primarySoft: '238 233 244', contrast: '255 255 255', accent: '132 105 154' },
  { key: 'rose', label: 'Rosa queimado', note: 'Acolhedor e discreto', primary: '145 92 96', primaryStrong: '111 67 71', primarySoft: '246 232 232', contrast: '255 255 255', accent: '157 101 104' },
  { key: 'peach', label: 'Pêssego', note: 'Leve e caloroso', primary: '153 104 75', primaryStrong: '116 76 54', primarySoft: '249 235 225', contrast: '255 255 255', accent: '170 114 80' },
  { key: 'sand', label: 'Areia suave', note: 'Neutro com toque dourado', primary: '132 108 64', primaryStrong: '99 80 46', primarySoft: '244 237 221', contrast: '255 255 255', accent: '151 121 67' },
]

export const defaultTheme = themeOptions[0]

export function isThemeKey(value: unknown): value is ThemeKey {
  return themeOptions.some((theme) => theme.key === value)
}

export function applyTheme(themeKey: ThemeKey) {
  const theme = themeOptions.find((option) => option.key === themeKey) ?? defaultTheme
  const root = document.documentElement
  root.dataset.theme = theme.key
  root.style.setProperty('--color-primary', theme.primary)
  root.style.setProperty('--color-primary-strong', theme.primaryStrong)
  root.style.setProperty('--color-primary-soft', theme.primarySoft)
  root.style.setProperty('--color-primary-contrast', theme.contrast)
  root.style.setProperty('--color-accent', theme.accent)
}
