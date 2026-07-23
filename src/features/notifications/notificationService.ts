import { supabase } from '../../lib/supabase/client'
import { DataRequestError } from '../../lib/supabase/errors'

export const notificationEmojis = ['👍', '❤️', '🎉', '👀', '🙌'] as const
export type NotificationEmoji = typeof notificationEmojis[number]

export interface NotificationReactionSummary {
  emoji: NotificationEmoji
  count: number
  reactedByMe: boolean
}

export interface AppNotification {
  id: string
  groupId: string
  groupName: string
  eventId: string | null
  title: string
  message: string
  type: string
  amount: number | null
  relatedExpenseId: string | null
  relatedInstallmentId: string | null
  readAt: string | null
  createdAt: string
  reactions: NotificationReactionSummary[]
}

interface NotificationRow {
  id: string
  group_id: string
  event_id?: string | null
  title: string
  message: string
  type: string
  amount?: number | string | null
  related_expense_id?: string | null
  related_installment_id?: string | null
  read_at: string | null
  created_at: string
  groups: { name: string } | Array<{ name: string }> | null
}

interface ReactionRow {
  event_id: string
  user_id: string
  emoji: NotificationEmoji
}

export interface NotificationSnapshot {
  notifications: AppNotification[]
  interactionsReady: boolean
}

function client() {
  if (!supabase) throw new Error('O Supabase não está configurado.')
  return supabase
}

function isMissingInteractionMigration(error: { code?: string; message: string } | null) {
  return Boolean(error && (
    error.code === '42P01'
    || error.code === '42703'
    || error.code === 'PGRST204'
    || /event_id|notification_reactions|related_expense_id|amount/i.test(error.message)
  ))
}

function groupName(value: NotificationRow['groups']) {
  if (Array.isArray(value)) return value[0]?.name ?? 'Grupo privado'
  return value?.name ?? 'Grupo privado'
}

function mapNotifications(rows: NotificationRow[], reactionRows: ReactionRow[], userId: string): AppNotification[] {
  const reactionsByEvent = new Map<string, NotificationReactionSummary[]>()
  for (const reaction of reactionRows) {
    const summaries = reactionsByEvent.get(reaction.event_id) ?? []
    const current = summaries.find((item) => item.emoji === reaction.emoji)
    if (current) {
      current.count += 1
      if (reaction.user_id === userId) current.reactedByMe = true
    } else {
      summaries.push({ emoji: reaction.emoji, count: 1, reactedByMe: reaction.user_id === userId })
    }
    reactionsByEvent.set(reaction.event_id, summaries)
  }

  return rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: groupName(row.groups),
    eventId: row.event_id ?? null,
    title: row.title,
    message: row.message,
    type: row.type,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    relatedExpenseId: row.related_expense_id ?? null,
    relatedInstallmentId: row.related_installment_id ?? null,
    readAt: row.read_at,
    createdAt: row.created_at,
    reactions: row.event_id ? reactionsByEvent.get(row.event_id) ?? [] : [],
  }))
}

export async function getNotifications(userId: string): Promise<NotificationSnapshot> {
  const db = client()
  const enhancedResult = await db
    .from('app_notifications')
    .select('id, group_id, event_id, title, message, type, amount, related_expense_id, related_installment_id, read_at, created_at, groups(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(40)

  if (!enhancedResult.error) {
    const rows = (enhancedResult.data ?? []) as unknown as NotificationRow[]
    const eventIds = [...new Set(rows.flatMap((row) => row.event_id ? [row.event_id] : []))]
    let reactionRows: ReactionRow[] = []
    if (eventIds.length > 0) {
      const reactionResult = await db
        .from('notification_reactions')
        .select('event_id, user_id, emoji')
        .in('event_id', eventIds)
      if (reactionResult.error) throw new DataRequestError(reactionResult.error.message, reactionResult.error.code)
      reactionRows = (reactionResult.data ?? []) as ReactionRow[]
    }
    return { notifications: mapNotifications(rows, reactionRows, userId), interactionsReady: true }
  }

  if (!isMissingInteractionMigration(enhancedResult.error)) {
    throw new DataRequestError(enhancedResult.error.message, enhancedResult.error.code)
  }

  const fallbackResult = await db
    .from('app_notifications')
    .select('id, group_id, title, message, type, read_at, created_at, groups(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(40)
  if (fallbackResult.error) throw new DataRequestError(fallbackResult.error.message, fallbackResult.error.code)
  return {
    notifications: mapNotifications((fallbackResult.data ?? []) as unknown as NotificationRow[], [], userId),
    interactionsReady: false,
  }
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const { error } = await client()
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
  if (error) throw new DataRequestError(error.message, error.code)
}

export async function toggleNotificationReaction(
  notification: AppNotification,
  userId: string,
  emoji: NotificationEmoji,
  active: boolean,
) {
  if (!notification.eventId) throw new Error('As reações precisam da migration 011 aplicada no Supabase.')
  const db = client()
  const result = active
    ? await db.from('notification_reactions').delete()
      .eq('event_id', notification.eventId).eq('group_id', notification.groupId).eq('user_id', userId).eq('emoji', emoji)
    : await db.from('notification_reactions').insert({
      event_id: notification.eventId,
      group_id: notification.groupId,
      user_id: userId,
      emoji,
    })
  if (result.error) throw new DataRequestError(result.error.message, result.error.code)
}

export function subscribeToNotifications(userId: string, includeReactions: boolean, onChange: () => void) {
  if (!supabase) return () => undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(onChange, 140)
  }
  let channel = supabase
    .channel(`notifications:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` }, scheduleRefresh)
  if (includeReactions) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reactions' }, scheduleRefresh)
  }
  channel.subscribe()
  return () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    void supabase?.removeChannel(channel)
  }
}
