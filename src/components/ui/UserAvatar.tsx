import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils/cn'
import { createAvatarSignedUrl } from '../../features/profile/profileService'

interface UserAvatarProps {
  displayName: string
  avatarPath?: string | null
  previewUrl?: string | null
  className?: string
  imageClassName?: string
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

function initials(displayName: string) {
  return displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'MF'
}

export function UserAvatar({ displayName, avatarPath, previewUrl, className, imageClassName }: UserAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(previewUrl ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setFailed(false)
    if (previewUrl) {
      setImageUrl(previewUrl)
      return () => { active = false }
    }
    if (!avatarPath) {
      setImageUrl(null)
      return () => { active = false }
    }

    const cached = signedUrlCache.get(avatarPath)
    if (cached && cached.expiresAt > Date.now()) {
      setImageUrl(cached.url)
      return () => { active = false }
    }

    setImageUrl(null)
    void createAvatarSignedUrl(avatarPath)
      .then((url) => {
        if (!active) return
        signedUrlCache.set(avatarPath, { url, expiresAt: Date.now() + 8 * 60 * 1000 })
        setImageUrl(url)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => { active = false }
  }, [avatarPath, previewUrl])

  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-sage font-semibold text-petrol', className)} aria-label={`Avatar de ${displayName}`}>
      {imageUrl && !failed
        ? <img src={imageUrl} alt="" className={cn('h-full w-full object-cover', imageClassName)} onError={() => setFailed(true)} />
        : initials(displayName)}
    </span>
  )
}
