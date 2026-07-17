import { supabase } from '../../lib/supabase/client'
import type { ExpenseStatus, ExpenseType } from '../groups/types'

function client() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export interface AddIncomeInput {
  groupId: string
  month: number
  year: number
  amount: number
  userId: string
  origin: string
  movementDate: string
  notes: string | null
}

export async function addIncome(input: AddIncomeInput) {
  const { data, error } = await client().rpc('add_balance_income', {
    p_group_id: input.groupId,
    p_month: input.month,
    p_year: input.year,
    p_amount: input.amount,
    p_user_id: input.userId,
    p_origin: input.origin.trim(),
    p_movement_date: input.movementDate,
    p_notes: input.notes,
  })
  throwIfError(error)
  if (!data) throw new Error('A entrada não foi criada.')
  return String(data)
}

export interface AddExpenseInput {
  groupId: string
  month: number
  year: number
  title: string
  amount: number
  category: string
  expenseType: Exclude<ExpenseType, 'installment'>
  purchaseDate: string
  dueDate: string | null
  responsibleUserId: string
  status: Extract<ExpenseStatus, 'open' | 'paid' | 'review'>
  notifyGroup: boolean
  notes: string | null
  participantIds: string[]
  repeatMonthly: boolean
  notifyBeforeDue: boolean
}

export async function addExpense(input: AddExpenseInput) {
  const { data, error } = await client().rpc('add_group_expense', {
    p_group_id: input.groupId,
    p_month: input.month,
    p_year: input.year,
    p_title: input.title.trim(),
    p_amount: input.amount,
    p_category: input.category,
    p_expense_type: input.expenseType,
    p_purchase_date: input.purchaseDate,
    p_due_date: input.dueDate,
    p_responsible_user_id: input.responsibleUserId,
    p_status: input.status,
    p_notify_group: input.notifyGroup,
    p_notes: input.notes,
    p_participant_ids: input.participantIds,
    p_repeat_monthly: input.repeatMonthly,
    p_notify_before_due: input.notifyBeforeDue,
  })
  throwIfError(error)
  if (!data) throw new Error('A despesa não foi criada.')
  return String(data)
}

export interface AddInstallmentInput {
  groupId: string
  month: number
  year: number
  title: string
  totalAmount: number
  totalInstallments: number
  firstDueDate: string
  cardLabel: string | null
  responsibleUserId: string
  shared: boolean
  participantIds: string[]
  notes: string | null
  notifyGroup: boolean
  notifyBeforeDue: boolean
  idempotencyKey: string
}

export async function addInstallment(input: AddInstallmentInput) {
  const { data, error } = await client().rpc('add_group_installment', {
    p_group_id: input.groupId,
    p_month: input.month,
    p_year: input.year,
    p_title: input.title.trim(),
    p_total_amount: input.totalAmount,
    p_total_installments: input.totalInstallments,
    p_first_due_date: input.firstDueDate,
    p_card_label: input.cardLabel,
    p_responsible_user_id: input.responsibleUserId,
    p_shared: input.shared,
    p_participant_ids: input.participantIds,
    p_notes: input.notes,
    p_notify_group: input.notifyGroup,
    p_notify_before_due: input.notifyBeforeDue,
    p_idempotency_key: input.idempotencyKey,
  })
  throwIfError(error)
  if (!data) throw new Error('O parcelamento não foi criado.')
  return data
}
