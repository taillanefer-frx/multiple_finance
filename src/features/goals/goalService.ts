import { supabase } from '../../lib/supabase/client'
import { DataRequestError } from '../../lib/supabase/errors'
import { monthStart } from './goalCalculations'
import type { FinancialGoal, GoalInput } from './types'

function client() {
  if (!supabase) throw new Error('O Supabase não está configurado.')
  return supabase
}

function requestId() {
  return crypto.randomUUID()
}

export async function getGoals(userId: string): Promise<FinancialGoal[]> {
  const db = client()
  const goalResult = await db.from('financial_goals')
    .select('id, name, target_amount, priority, start_date, desired_date, monthly_amount, status, completed_at')
    .eq('user_id', userId)
  if (goalResult.error) throw new DataRequestError(goalResult.error.message, goalResult.error.code)
  const ids = (goalResult.data ?? []).map((goal) => String(goal.id))
  const [contributionResult, historyResult] = await Promise.all([
    ids.length ? db.from('goal_contributions').select('id, goal_id, amount, source, competence_month, contributed_on, created_at').in('goal_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from('goal_monthly_amount_history').select('id, goal_id, previous_amount, new_amount, changed_at').in('goal_id', ids) : Promise.resolve({ data: [], error: null }),
  ])
  if (contributionResult.error) throw new DataRequestError(contributionResult.error.message, contributionResult.error.code)
  if (historyResult.error) throw new DataRequestError(historyResult.error.message, historyResult.error.code)

  return (goalResult.data ?? []).map((goal) => ({
    id: String(goal.id),
    name: String(goal.name),
    targetAmount: Number(goal.target_amount),
    priority: goal.priority as FinancialGoal['priority'],
    startDate: String(goal.start_date),
    desiredDate: String(goal.desired_date),
    monthlyAmount: Number(goal.monthly_amount),
    status: goal.status as FinancialGoal['status'],
    completedAt: goal.completed_at ? String(goal.completed_at) : null,
    contributions: (contributionResult.data ?? []).filter((item) => String(item.goal_id) === String(goal.id)).map((item) => ({
      id: String(item.id), amount: Number(item.amount), source: item.source as 'monthly' | 'extra',
      competenceMonth: item.competence_month ? String(item.competence_month) : null,
      contributedOn: String(item.contributed_on), createdAt: String(item.created_at),
    })),
    monthlyAmountHistory: (historyResult.data ?? []).filter((item) => String(item.goal_id) === String(goal.id)).map((item) => ({
      id: String(item.id), previousAmount: Number(item.previous_amount), newAmount: Number(item.new_amount), changedAt: String(item.changed_at),
    })),
  }))
}

export async function createGoal(input: GoalInput, operationId = requestId()) {
  const { data, error } = await client().rpc('create_financial_goal', {
    p_name: input.name.trim(), p_target_amount: input.targetAmount, p_priority: input.priority,
    p_start_date: input.startDate, p_desired_date: input.desiredDate,
    p_monthly_amount: input.monthlyAmount, p_request_id: operationId,
  })
  if (error) throw new DataRequestError(error.message, error.code)
  return String(data)
}

export async function updateGoal(goalId: string, input: GoalInput) {
  const { data, error } = await client().rpc('update_financial_goal', {
    p_goal_id: goalId, p_name: input.name.trim(), p_target_amount: input.targetAmount,
    p_priority: input.priority, p_start_date: input.startDate, p_desired_date: input.desiredDate,
    p_monthly_amount: input.monthlyAmount,
  })
  if (error) throw new DataRequestError(error.message, error.code)
  const result = data as { just_completed?: boolean } | null
  return { justCompleted: Boolean(result?.just_completed) }
}

export async function recordMonthlyGoalAmount(goal: FinancialGoal, operationId = requestId()) {
  return recordContribution(goal.id, goal.monthlyAmount, 'monthly', monthStart(), operationId)
}

export async function recordExtraGoalAmount(goalId: string, amount: number, operationId = requestId()) {
  return recordContribution(goalId, amount, 'extra', null, operationId)
}

async function recordContribution(goalId: string, amount: number, source: 'monthly' | 'extra', competenceMonth: string | null, operationId: string) {
  const { data, error } = await client().rpc('record_goal_contribution', {
    p_goal_id: goalId, p_amount: amount, p_source: source, p_competence_month: competenceMonth,
    p_contributed_on: new Date().toISOString().slice(0, 10), p_request_id: operationId,
  })
  if (error) throw new DataRequestError(error.message, error.code)
  const result = data as { just_completed?: boolean; replayed?: boolean } | null
  return { justCompleted: Boolean(result?.just_completed), replayed: Boolean(result?.replayed) }
}

export function subscribeToGoals(userId: string, onChange: () => void) {
  if (!supabase) return () => undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 140)
  }
  const channel = supabase.channel(`goals:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_goals', filter: `user_id=eq.${userId}` }, schedule)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'goal_contributions', filter: `user_id=eq.${userId}` }, schedule)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'goal_monthly_amount_history', filter: `user_id=eq.${userId}` }, schedule)
    .subscribe()
  return () => {
    if (timer) clearTimeout(timer)
    void supabase?.removeChannel(channel)
  }
}
