import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { applyColorMode, applyTheme, readColorMode, storeColorMode } from './theme'
import { getMyProfile, removeMyAvatar, updateMyDisplayName, updateMyTheme, uploadMyAvatar } from './profileService'
import type { ColorMode, ThemeKey, UserProfile } from './types'

interface ProfileContextValue {
  profile: UserProfile | null
  loading: boolean
  error: string | null
  colorMode: ColorMode
  refresh: () => Promise<void>
  saveDisplayName: (displayName: string) => Promise<void>
  saveTheme: (themeKey: ThemeKey) => Promise<void>
  saveColorMode: (mode: ColorMode) => void
  saveAvatar: (file: File) => Promise<void>
  clearAvatar: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function profileMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('theme_key') || message.includes('schema cache')) return 'A atualização de perfil ainda não foi aplicada no Supabase. Execute a migration 009.'
  if (message.includes('fetch') || message.includes('network')) return 'Não foi possível conectar ao perfil agora.'
  if (message.includes('row-level security') || message.includes('permission')) return 'Sua sessão não tem permissão para alterar este perfil.'
  return error instanceof Error && error.message ? error.message : 'Não foi possível atualizar o perfil.'
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { configured, loading: authLoading, user } = useAuth()
  const userId = user?.id ?? null
  const requestId = useRef(0)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(configured)
  const [error, setError] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>(() => readColorMode())

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (authLoading) {
      setLoading(true)
      return
    }
    if (!configured || !userId) {
      setProfile(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const nextProfile = await getMyProfile(userId)
      if (currentRequest !== requestId.current) return
      setProfile(nextProfile)
      if (!nextProfile) setError('Seu perfil ainda está sendo preparado. Tente novamente em instantes.')
    } catch (caughtError) {
      if (currentRequest !== requestId.current) return
      setProfile(null)
      setError(profileMessage(caughtError))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [authLoading, configured, userId])

  useEffect(() => {
    void refresh()
    return () => { requestId.current += 1 }
  }, [refresh])

  useEffect(() => {
    const nextMode = readColorMode(userId)
    setColorMode(nextMode)
    applyColorMode(nextMode, profile?.themeKey ?? 'sage')
  }, [profile?.themeKey, userId])

  const requireProfile = useCallback(() => {
    if (!userId || !profile) throw new Error('Aguarde o perfil terminar de carregar.')
    return { userId, profile }
  }, [profile, userId])

  const value = useMemo<ProfileContextValue>(() => ({
    profile,
    loading,
    error,
    colorMode,
    refresh,
    async saveDisplayName(displayName) {
      const current = requireProfile()
      setProfile(await updateMyDisplayName(current.userId, displayName))
    },
    async saveTheme(themeKey) {
      const current = requireProfile()
      const previous = current.profile
      setProfile({ ...previous, themeKey })
      applyTheme(themeKey, colorMode)
      try {
        setProfile(await updateMyTheme(current.userId, themeKey))
      } catch (caughtError) {
        setProfile(previous)
        applyTheme(previous.themeKey, colorMode)
        throw new Error(profileMessage(caughtError))
      }
    },
    saveColorMode(mode) {
      setColorMode(mode)
      storeColorMode(mode, userId)
      applyColorMode(mode, profile?.themeKey ?? 'sage')
    },
    async saveAvatar(file) {
      const current = requireProfile()
      setProfile(await uploadMyAvatar(current.userId, file, current.profile.avatarPath))
    },
    async clearAvatar() {
      const current = requireProfile()
      setProfile(await removeMyAvatar(current.userId, current.profile.avatarPath))
    },
  }), [colorMode, error, loading, profile, refresh, requireProfile, userId])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used within ProfileProvider')
  return context
}
