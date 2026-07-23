import { supabase } from '../../lib/supabase/client'
import { DataRequestError } from '../../lib/supabase/errors'
import { categoryDefinition } from './personalFinanceCategories'
import type { PersonalCategoryTotal, PersonalFinanceSnapshot, PersonalLedgerItem, PersonalTransaction, PersonalTransactionInput } from './types'

interface MembershipRow {
  group_id: string
  groups: {
    id: string
    name: string
    type: 'house_split' | 'balance_control'
    archived_at: string | null
  }
}

interface PersonalTransactionRow {
  id: string
  user_id: string
  type: 'income' | 'expense'
  description: string
  amount: number | string
  category: string
  occurred_on: string
  competence_month: string
  notes: string | null
  created_at: string
  updated_at: string
}

function client() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

function throwIfError(error: { message: string; code?: string } | null) {
  if (error) throw new DataRequestError(error.message, error.code)
}

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function transactionFromRow(row: PersonalTransactionRow): PersonalTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    occurredOn: row.occurred_on,
    competenceMonth: row.competence_month.slice(0, 7),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function categoryTotals(items: PersonalLedgerItem[]): PersonalCategoryTotal[] {
  const totals = new Map<string, PersonalCategoryTotal>()
  for (const item of items.filter((entry) => entry.type === 'expense')) {
    const definition = categoryDefinition(item.category, 'expense')
    const current = totals.get(definition.key)
    if (current) {
      current.amount += item.amount
      current.count += 1
    } else {
      totals.set(definition.key, { key: definition.key, label: definition.label, color: definition.color, amount: item.amount, count: 1 })
    }
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount)
}

export class PersonalFinanceSetupError extends Error {
  constructor() {
    super('A área pessoal precisa da migration 010 aplicada no Supabase.')
    this.name = 'PersonalFinanceSetupError'
  }
}

function isMissingPersonalTable(error: { message: string; code?: string } | null) {
  return Boolean(error && (error.code === '42P01' || /personal_transactions/i.test(error.message)))
}

function normalizePersonalError(error: { message: string; code?: string } | null) {
  if (!error) return
  if (isMissingPersonalTable(error)) throw new PersonalFinanceSetupError()
  throwIfError(error)
}

export async function getPersonalFinanceSnapshot(userId: string, month: number, year: number): Promise<PersonalFinanceSnapshot> {
  const db = client()
  const competenceMonth = monthStart(year, month)
  const personalResult = await db
    .from('personal_transactions')
    .select('id, user_id, type, description, amount, category, occurred_on, competence_month, notes, created_at, updated_at')
    .eq('user_id', userId)
    .eq('competence_month', competenceMonth)
    .order('occurred_on', { ascending: false })

  const personalReady = !isMissingPersonalTable(personalResult.error)
  if (personalReady) throwIfError(personalResult.error)
  const transactions = ((personalResult.data ?? []) as PersonalTransactionRow[]).map(transactionFromRow)
  const personalItems: PersonalLedgerItem[] = transactions.map((transaction) => ({
    id: `personal:${transaction.id}`,
    source: 'personal',
    sourceId: transaction.id,
    type: transaction.type,
    description: transaction.description,
    amount: transaction.amount,
    category: transaction.category,
    occurredOn: transaction.occurredOn,
    competenceMonth: transaction.competenceMonth,
    notes: transaction.notes,
    editable: true,
    groupId: null,
    groupName: null,
    expenseType: null,
  }))

  const membershipResult = await db
    .from('group_members')
    .select('group_id, groups!inner(id, name, type, archived_at)')
    .eq('user_id', userId)
    .eq('status', 'active')
  throwIfError(membershipResult.error)

  const memberships = ((membershipResult.data ?? []) as unknown as MembershipRow[])
    .filter((item) => item.groups.type === 'house_split' && !item.groups.archived_at)
  const groupIds = memberships.map((item) => item.group_id)
  let groupItems: PersonalLedgerItem[] = []

  if (groupIds.length > 0) {
    const periodResult = await db
      .from('monthly_periods')
      .select('id, group_id')
      .in('group_id', groupIds)
      .eq('month', month)
      .eq('year', year)
    throwIfError(periodResult.error)
    const periods = periodResult.data ?? []
    const periodIds = periods.map((period) => period.id as string)

    if (periodIds.length > 0) {
      const expenseResult = await db
        .from('expenses')
        .select('id, group_id, monthly_period_id, title, category, type, purchase_date, status')
        .in('monthly_period_id', periodIds)
        .neq('status', 'cancelled')
        .neq('status', 'review')
      throwIfError(expenseResult.error)
      const expenses = expenseResult.data ?? []
      const expenseIds = expenses.map((expense) => expense.id as string)

      if (expenseIds.length > 0) {
        const participantResult = await db
          .from('expense_participants')
          .select('expense_id, share_amount')
          .in('expense_id', expenseIds)
          .eq('user_id', userId)
          .eq('included', true)
        throwIfError(participantResult.error)
        const shareByExpense = new Map((participantResult.data ?? []).map((row) => [row.expense_id as string, Number(row.share_amount)]))
        const groupNameById = new Map(memberships.map((item) => [item.group_id, item.groups.name]))

        groupItems = expenses.flatMap((expense) => {
          const share = shareByExpense.get(expense.id as string)
          if (share === undefined || share <= 0) return []
          return [{
            id: `group:${expense.id as string}`,
            source: 'group' as const,
            sourceId: expense.id as string,
            type: 'expense' as const,
            description: expense.title as string,
            amount: share,
            category: expense.category as string,
            occurredOn: expense.purchase_date as string,
            competenceMonth: competenceMonth.slice(0, 7),
            notes: null,
            editable: false,
            groupId: expense.group_id as string,
            groupName: groupNameById.get(expense.group_id as string) ?? 'Grupo privado',
            expenseType: expense.type as string,
          }]
        })
      }
    }
  }

  const items = [...personalItems, ...groupItems].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
  const income = personalItems.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
  const personalExpenses = personalItems.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
  const groupExpenses = groupItems.reduce((sum, item) => sum + item.amount, 0)
  const totalExpenses = personalExpenses + groupExpenses

  return {
    personalReady,
    transactions,
    items,
    categories: categoryTotals(items),
    summary: { income, personalExpenses, groupExpenses, totalExpenses, balance: income - totalExpenses },
  }
}

export async function createPersonalTransaction(userId: string, input: PersonalTransactionInput) {
  const db = client()
  const result = await db.from('personal_transactions').insert({
    user_id: userId,
    type: input.type,
    description: input.description.trim(),
    amount: input.amount,
    category: input.category,
    occurred_on: input.occurredOn,
    competence_month: `${input.competenceMonth}-01`,
    notes: input.notes?.trim() || null,
  })
  normalizePersonalError(result.error)
}

export async function updatePersonalTransaction(userId: string, transactionId: string, input: PersonalTransactionInput) {
  const db = client()
  const result = await db.from('personal_transactions').update({
    type: input.type,
    description: input.description.trim(),
    amount: input.amount,
    category: input.category,
    occurred_on: input.occurredOn,
    competence_month: `${input.competenceMonth}-01`,
    notes: input.notes?.trim() || null,
  }).eq('id', transactionId).eq('user_id', userId)
  normalizePersonalError(result.error)
}

export function subscribeToPersonalTransactions(userId: string, onChange: () => void) {
  if (!supabase) return () => undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(onChange, 140)
  }
  const channel = supabase
    .channel(`personal-dashboard:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_transactions', filter: `user_id=eq.${userId}` }, scheduleRefresh)
    .subscribe()
  return () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    void supabase?.removeChannel(channel)
  }
}
