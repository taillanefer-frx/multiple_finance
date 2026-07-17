import { supabase } from '../../lib/supabase/client'

export function subscribeToGroupList(userId: string, onChange: () => void) {
  if (!supabase) return () => undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(onChange, 140)
  }

  const channel = supabase
    .channel(`group-list:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_periods' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_participants' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'installments' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'balance_accounts' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'balance_movements' }, scheduleRefresh)
    .subscribe()

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    void supabase?.removeChannel(channel)
  }
}

export function subscribeToGroup(groupId: string, onChange: () => void) {
  if (!supabase) return () => undefined
  const filter = `group_id=eq.${groupId}`
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(onChange, 140)
  }

  const channel = supabase
    .channel(`group-detail:${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_periods', filter }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_participants' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'installments', filter }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'balance_accounts', filter }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'balance_movements', filter }, scheduleRefresh)
    .subscribe()

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    void supabase?.removeChannel(channel)
  }
}
