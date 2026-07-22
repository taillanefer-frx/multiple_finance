import { supabase } from '../../lib/supabase/client'
import { isThemeKey } from './theme'
import type { ThemeKey, UserProfile } from './types'

interface ProfileRow {
  id: string
  display_name: string
  avatar_url: string | null
  theme_key: string | null
  created_at: string
  updated_at: string
}

function client() {
  if (!supabase) throw new Error('O Supabase não está configurado.')
  return supabase
}

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarPath: row.avatar_url,
    themeKey: isThemeKey(row.theme_key) ? row.theme_key : 'sage',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getMyProfile(userId: string) {
  const { data, error } = await client()
    .from('profiles')
    .select('id, display_name, avatar_url, theme_key, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? mapProfile(data as ProfileRow) : null
}

export async function updateMyDisplayName(userId: string, displayName: string) {
  const normalized = displayName.trim()
  if (normalized.length < 1 || normalized.length > 120) throw new Error('Informe um nome entre 1 e 120 caracteres.')

  const { data, error } = await client()
    .from('profiles')
    .update({ display_name: normalized })
    .eq('id', userId)
    .select('id, display_name, avatar_url, theme_key, created_at, updated_at')
    .single()

  if (error) throw error
  return mapProfile(data as ProfileRow)
}

export async function updateMyTheme(userId: string, themeKey: ThemeKey) {
  const { data, error } = await client()
    .from('profiles')
    .update({ theme_key: themeKey })
    .eq('id', userId)
    .select('id, display_name, avatar_url, theme_key, created_at, updated_at')
    .single()

  if (error) throw error
  return mapProfile(data as ProfileRow)
}

function avatarExtension(file: File) {
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  throw new Error('Escolha uma imagem JPG, PNG ou WebP.')
}

export function validateAvatarFile(file: File) {
  avatarExtension(file)
  if (file.size > 3 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 3 MB.')
}

export async function uploadMyAvatar(userId: string, file: File, previousPath: string | null) {
  validateAvatarFile(file)
  const db = client()
  const path = `${userId}/avatar-${crypto.randomUUID()}.${avatarExtension(file)}`
  const { error: uploadError } = await db.storage.from('avatars').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data, error: profileError } = await db
    .from('profiles')
    .update({ avatar_url: path })
    .eq('id', userId)
    .select('id, display_name, avatar_url, theme_key, created_at, updated_at')
    .single()

  if (profileError) {
    await db.storage.from('avatars').remove([path])
    throw profileError
  }

  if (previousPath && !previousPath.startsWith('http')) {
    await db.storage.from('avatars').remove([previousPath])
  }

  return mapProfile(data as ProfileRow)
}

export async function removeMyAvatar(userId: string, previousPath: string | null) {
  const db = client()
  const { data, error } = await db
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId)
    .select('id, display_name, avatar_url, theme_key, created_at, updated_at')
    .single()

  if (error) throw error
  if (previousPath && !previousPath.startsWith('http')) {
    await db.storage.from('avatars').remove([previousPath])
  }
  return mapProfile(data as ProfileRow)
}

export async function createAvatarSignedUrl(storagePath: string) {
  if (/^https?:\/\//i.test(storagePath)) return storagePath
  const { data, error } = await client().storage.from('avatars').createSignedUrl(storagePath, 600)
  if (error) throw error
  return data.signedUrl
}
