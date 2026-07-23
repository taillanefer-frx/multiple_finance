export const reactionEmojis = ['👍', '❤️', '🎉', '👀', '🙌'] as const

export type ReactionEmoji = typeof reactionEmojis[number]
export type ReactionTargetKind = 'expense' | 'installment'

export interface ReactionPerson {
  userId: string
  displayName: string
}

export interface ReactionSummary {
  emoji: ReactionEmoji
  count: number
  reactedByMe: boolean
  people: ReactionPerson[]
}

export interface ReactionTarget {
  kind: ReactionTargetKind
  id: string
}
