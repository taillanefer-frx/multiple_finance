export type ThemeKey = 'sage' | 'petrol' | 'lilac' | 'rose' | 'peach' | 'sand'

export interface UserProfile {
  id: string
  displayName: string
  avatarPath: string | null
  themeKey: ThemeKey
  createdAt: string
  updatedAt: string
}
