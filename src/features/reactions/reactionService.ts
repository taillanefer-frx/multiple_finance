import { supabase } from '../../lib/supabase/client'
import { DataRequestError } from '../../lib/supabase/errors'
import type { ReactionEmoji, ReactionSummary, ReactionTarget, ReactionTargetKind } from './types'

interface ReactionRow {
  target_kind: ReactionTargetKind
  target_id: string
  user_id: string
  emoji: ReactionEmoji
}

function client() {
  if (!supabase) throw new Error('O Supabase não está configurado.')
  return supabase
}

export function summarizeReactions(
  rows: ReactionRow[],
  userId: string,
  namesByUser: Map<string, string>,
) {
  const summariesByTarget = new Map<string, ReactionSummary[]>()
  for (const row of rows) {
    const key = `${row.target_kind}:${row.target_id}`
    const summaries = summariesByTarget.get(key) ?? []
    let summary = summaries.find((item) => item.emoji === row.emoji)
    if (!summary) {
      summary = { emoji: row.emoji, count: 0, reactedByMe: false, people: [] }
      summaries.push(summary)
    }
    summary.count += 1
    summary.reactedByMe ||= row.user_id === userId
    summary.people.push({ userId: row.user_id, displayName: namesByUser.get(row.user_id) || 'Membro' })
    summariesByTarget.set(key, summaries)
  }
  return summariesByTarget
}

export async function getReactionsForTargets(targets: ReactionTarget[], userId: string) {
  if (!targets.length) return new Map<string, ReactionSummary[]>()
  const db = client()
  const ids = [...new Set(targets.map((target) => target.id))]
  const result = await db
    .from('group_transaction_reactions')
    .select('target_kind, target_id, user_id, emoji')
    .in('target_id', ids)
  if (result.error) throw new DataRequestError(result.error.message, result.error.code)
  const rows = (result.data ?? []) as ReactionRow[]
  const userIds = [...new Set(rows.map((row) => row.user_id))]
  const profileResult = userIds.length
    ? await db.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [], error: null }
  if (profileResult.error) throw new DataRequestError(profileResult.error.message, profileResult.error.code)
  const names = new Map((profileResult.data ?? []).map((row) => [String(row.id), String(row.display_name || 'Membro')]))
  return summarizeReactions(rows, userId, names)
}

export async function setTransactionReaction(target: ReactionTarget, emoji: ReactionEmoji | null) {
  const { error } = await client().rpc('set_group_transaction_reaction', {
    p_target_kind: target.kind,
    p_target_id: target.id,
    p_emoji: emoji,
  })
  if (error) throw new DataRequestError(error.message, error.code)
}
