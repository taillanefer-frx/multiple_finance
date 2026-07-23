import { useEffect, useState } from 'react'
import { LoaderCircle, SmilePlus } from 'lucide-react'
import { cn } from '../../lib/utils/cn'
import { reactionEmojis, type ReactionEmoji, type ReactionSummary, type ReactionTarget } from './types'

interface ReactionBarProps {
  target: ReactionTarget
  reactions: ReactionSummary[]
  disabled?: boolean
  compact?: boolean
  onReact: (target: ReactionTarget, emoji: ReactionEmoji | null) => Promise<void>
}

export function ReactionBar({ target, reactions, disabled, compact, onReact }: ReactionBarProps) {
  const [busy, setBusy] = useState<ReactionEmoji | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visibleReactions, setVisibleReactions] = useState(reactions)

  useEffect(() => setVisibleReactions(reactions), [reactions])

  async function choose(emoji: ReactionEmoji) {
    if (busy || disabled) return
    const active = visibleReactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe)
    setBusy(emoji)
    setError(null)
    try {
      await onReact(target, active ? null : emoji)
      setVisibleReactions((current) => {
        const withoutMine = current
          .map((reaction) => reaction.reactedByMe
            ? { ...reaction, count: reaction.count - 1, reactedByMe: false, people: reaction.people.filter((person) => person.displayName !== 'Você') }
            : reaction)
          .filter((reaction) => reaction.count > 0)
        if (active) return withoutMine
        const existing = withoutMine.find((reaction) => reaction.emoji === emoji)
        if (existing) return withoutMine.map((reaction) => reaction.emoji === emoji
          ? { ...reaction, count: reaction.count + 1, reactedByMe: true, people: [...reaction.people, { userId: 'me', displayName: 'Você' }] }
          : reaction)
        return [...withoutMine, { emoji, count: 1, reactedByMe: true, people: [{ userId: 'me', displayName: 'Você' }] }]
      })
    } catch {
      setError('Não foi possível salvar sua reação.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      {!compact && <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted"><SmilePlus size={14} /> Reações</p>}
      <div className="flex flex-wrap gap-1.5">
        {reactionEmojis.map((emoji) => {
          const summary = visibleReactions.find((reaction) => reaction.emoji === emoji)
          const names = summary?.people.map((person) => person.displayName).join(', ')
          return (
            <button
              key={emoji}
              type="button"
              disabled={disabled || busy !== null}
              onClick={() => void choose(emoji)}
              title={names || `Reagir com ${emoji}`}
              aria-label={names ? `${emoji}: ${names}` : `Reagir com ${emoji}`}
              className={cn(
                'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition active:scale-95 disabled:opacity-60',
                summary?.reactedByMe ? 'border-petrol/30 bg-sage text-petrol' : 'border-line bg-surface text-muted',
              )}
            >
              {busy === emoji ? <LoaderCircle size={13} className="animate-spin" /> : emoji}
              {summary ? <span>{summary.count}</span> : null}
            </button>
          )
        })}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
