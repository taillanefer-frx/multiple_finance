import { supabase } from '../../lib/supabase/client'
import { DataRequestError } from '../../lib/supabase/errors'
import { summarizeReactions } from '../reactions/reactionService'
import type { ReactionEmoji } from '../reactions/types'
import type { BalanceControlSummary, BalanceInstallmentSummary, BalanceMovementSummary, ExpenseCategorySummary, ExpenseParticipantSummary, GroupDetails, GroupExpenseSummary, GroupMemberSummary, GroupSummary, GroupType, InvitePreview } from './types'

interface MembershipRow {
  group_id: string
  role: 'admin' | 'member'
  groups: {
    id: string
    name: string
    type: GroupType
    archived_at: string | null
  }
}

interface MemberRow {
  id: string
  user_id: string
  role: 'admin' | 'member'
  profiles: { display_name: string; avatar_url: string | null } | null
}

function client() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

function currentMonth() {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

function nextUnpaidInstallment(total: number, paid: Set<number>) {
  for (let number = 1; number <= total; number += 1) {
    if (!paid.has(number)) return number
  }
  return total
}

function throwIfError(error: { message: string; code?: string } | null) {
  if (error) throw new DataRequestError(error.message, error.code)
}

export class GroupAccessError extends Error {
  constructor() {
    super('Grupo não encontrado ou sem permissão.')
    this.name = 'GroupAccessError'
  }
}

const categoryDefinitions = [
  { key: 'rent', label: 'Aluguel', terms: ['aluguel', 'condominio', 'condomínio'] },
  { key: 'internet', label: 'Internet', terms: ['internet', 'wifi', 'wi-fi'] },
  { key: 'energy', label: 'Luz', terms: ['luz', 'energia', 'eletricidade'] },
  { key: 'market', label: 'Mercado', terms: ['mercado', 'supermercado', 'alimentacao', 'alimentação'] },
  { key: 'gas', label: 'Gás', terms: ['gas', 'gás'] },
  { key: 'home', label: 'Itens de casa', terms: ['casa', 'itens de casa', 'utilidades'] },
  { key: 'cleaning', label: 'Limpeza', terms: ['limpeza', 'faxina'] },
  { key: 'maintenance', label: 'Manutenção', terms: ['manutencao', 'manutenção', 'reparo'] },
  { key: 'other', label: 'Outros', terms: [] },
] as const

function categoryKey(category: string) {
  const normalized = category.trim().toLocaleLowerCase('pt-BR')
  return categoryDefinitions.find((definition) => definition.terms.some((term) => normalized.includes(term)))?.key ?? 'other'
}

const balanceCategoryDefinitions = [
  { key: 'home', label: 'Casa', terms: ['casa', 'aluguel', 'condomínio', 'condominio', 'luz', 'internet', 'gás', 'gas'] },
  { key: 'market', label: 'Mercado', terms: ['mercado', 'supermercado'] },
  { key: 'transport', label: 'Transporte', terms: ['transporte', 'combustível', 'combustivel', 'uber', 'ônibus', 'onibus'] },
  { key: 'food', label: 'Comida', terms: ['comida', 'restaurante', 'alimentação', 'alimentacao', 'delivery'] },
  { key: 'leisure', label: 'Lazer', terms: ['lazer', 'cinema', 'viagem', 'passeio'] },
  { key: 'health', label: 'Saúde', terms: ['saúde', 'saude', 'farmácia', 'farmacia', 'médico', 'medico'] },
  { key: 'subscription', label: 'Assinatura', terms: ['assinatura', 'streaming', 'mensalidade'] },
  { key: 'card', label: 'Cartão', terms: ['cartão', 'cartao', 'fatura'] },
  { key: 'other', label: 'Outros', terms: [] },
] as const

function balanceCategoryKey(category: string) {
  const normalized = category.trim().toLocaleLowerCase('pt-BR')
  return balanceCategoryDefinitions.find((definition) => definition.terms.some((term) => normalized.includes(term)))?.key ?? 'other'
}

function periodDate(year: number, month: number, day: number) {
  const lastDay = new Date(year, month, 0).getDate()
  const safeDay = Math.min(day, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

export async function getGroupsForUser(userId: string): Promise<GroupSummary[]> {
  const db = client()
  const { month, year } = currentMonth()
  const { data: membershipData, error: membershipError } = await db
    .from('group_members')
    .select('group_id, role, groups!inner(id, name, type, archived_at)')
    .eq('user_id', userId)
    .eq('status', 'active')

  throwIfError(membershipError)
  const memberships = (membershipData ?? []) as unknown as MembershipRow[]
  const visibleMemberships = memberships.filter((item) => !item.groups.archived_at)
  const groupIds = visibleMemberships.map((item) => item.group_id)
  if (groupIds.length === 0) return []

  const [{ data: periods, error: periodError }, { data: memberRows, error: memberError }] = await Promise.all([
    db.from('monthly_periods').select('id, group_id').in('group_id', groupIds).eq('month', month).eq('year', year),
    db.from('group_members').select('group_id').in('group_id', groupIds).eq('status', 'active'),
  ])
  throwIfError(periodError)
  throwIfError(memberError)

  const periodIds = (periods ?? []).map((period) => period.id as string)
  const memberCounts = new Map<string, number>()
  for (const row of memberRows ?? []) {
    const groupId = row.group_id as string
    memberCounts.set(groupId, (memberCounts.get(groupId) ?? 0) + 1)
  }

  if (periodIds.length === 0) {
    return visibleMemberships.map((membership) => ({
      id: membership.groups.id,
      name: membership.groups.name,
      type: membership.groups.type,
      role: membership.role,
      memberCount: memberCounts.get(membership.group_id) ?? 1,
      monthTotal: 0,
      myValue: 0,
    }))
  }

  const [expenseResult, balanceResult, movementResult, installmentResult] = await Promise.all([
    db.from('expenses').select('id, group_id, monthly_period_id, amount, paid_by_user_id, installment_id').in('monthly_period_id', periodIds).neq('status', 'cancelled').neq('status', 'review'),
    db.from('balance_accounts').select('group_id, monthly_period_id, starting_balance').in('monthly_period_id', periodIds).eq('user_id', userId),
    db.from('balance_movements').select('group_id, monthly_period_id, user_id, type, amount, related_expense_id').in('monthly_period_id', periodIds),
    db.from('installments').select('id, group_id, installment_amount, total_installments, current_installment, paid_by_user_id, active, first_due_date').in('group_id', groupIds).eq('active', true),
  ])
  throwIfError(expenseResult.error)
  throwIfError(balanceResult.error)
  throwIfError(movementResult.error)
  throwIfError(installmentResult.error)

  const expenses = expenseResult.data ?? []
  const expenseIds = expenses.map((expense) => expense.id as string)
  const participantResult = expenseIds.length
    ? await db.from('expense_participants').select('expense_id, share_amount').in('expense_id', expenseIds).eq('user_id', userId).eq('included', true)
    : { data: [], error: null }
  throwIfError(participantResult.error)

  const expenseGroup = new Map(expenses.map((expense) => [expense.id as string, expense.group_id as string]))
  const totalByGroup = new Map<string, number>()
  for (const expense of expenses) {
    const groupId = expense.group_id as string
    totalByGroup.set(groupId, (totalByGroup.get(groupId) ?? 0) + Number(expense.amount))
  }

  const shareByGroup = new Map<string, number>()
  for (const participant of participantResult.data ?? []) {
    const groupId = expenseGroup.get(participant.expense_id as string)
    if (groupId) shareByGroup.set(groupId, (shareByGroup.get(groupId) ?? 0) + Number(participant.share_amount))
  }

  const groupTypeById = new Map(visibleMemberships.map((membership) => [membership.group_id, membership.groups.type]))
  const startingByGroup = new Map((balanceResult.data ?? []).map((account) => [account.group_id as string, Number(account.starting_balance)]))
  const incomeByGroup = new Map<string, number>()
  const myExpenseByGroup = new Map<string, number>()
  const balanceExpenseByGroup = new Map<string, number>()
  const relatedExpenseIds = new Set<string>()
  for (const movement of movementResult.data ?? []) {
    const groupId = movement.group_id as string
    const amount = Number(movement.amount)
    if (movement.type === 'income') {
      if (movement.user_id === userId) incomeByGroup.set(groupId, (incomeByGroup.get(groupId) ?? 0) + amount)
      continue
    }
    balanceExpenseByGroup.set(groupId, (balanceExpenseByGroup.get(groupId) ?? 0) + amount)
    if (movement.user_id === userId) myExpenseByGroup.set(groupId, (myExpenseByGroup.get(groupId) ?? 0) + amount)
    if (movement.related_expense_id) relatedExpenseIds.add(movement.related_expense_id as string)
  }
  const representedInstallments = new Set<string>()
  for (const expense of expenses) {
    const groupId = expense.group_id as string
    if (groupTypeById.get(groupId) !== 'balance_control') continue
    if (expense.installment_id) representedInstallments.add(`${groupId}:${expense.installment_id as string}`)
    if (relatedExpenseIds.has(expense.id as string)) continue
    const amount = Number(expense.amount)
    balanceExpenseByGroup.set(groupId, (balanceExpenseByGroup.get(groupId) ?? 0) + amount)
    if (expense.paid_by_user_id === userId) myExpenseByGroup.set(groupId, (myExpenseByGroup.get(groupId) ?? 0) + amount)
  }
  for (const installment of installmentResult.data ?? []) {
    const groupId = installment.group_id as string
    const periodEnd = periodDate(year, month, new Date(year, month, 0).getDate())
    const firstDue = installment.first_due_date ? new Date(`${String(installment.first_due_date)}T12:00:00`) : null
    const elapsed = firstDue ? (year - firstDue.getFullYear()) * 12 + (month - (firstDue.getMonth() + 1)) : Number(installment.current_installment) - 1
    if (groupTypeById.get(groupId) !== 'balance_control'
      || representedInstallments.has(`${groupId}:${installment.id as string}`)
      || (installment.first_due_date && String(installment.first_due_date) > periodEnd)
      || elapsed < 0
      || elapsed >= Number(installment.total_installments)) continue
    const amount = Number(installment.installment_amount)
    balanceExpenseByGroup.set(groupId, (balanceExpenseByGroup.get(groupId) ?? 0) + amount)
    if (installment.paid_by_user_id === userId) myExpenseByGroup.set(groupId, (myExpenseByGroup.get(groupId) ?? 0) + amount)
  }
  const balanceByGroup = new Map<string, number>()
  for (const membership of visibleMemberships.filter((item) => item.groups.type === 'balance_control')) {
    const groupId = membership.group_id
    balanceByGroup.set(groupId, (startingByGroup.get(groupId) ?? 0) + (incomeByGroup.get(groupId) ?? 0) - (myExpenseByGroup.get(groupId) ?? 0))
  }

  return visibleMemberships.map((membership) => {
    const group = membership.groups
    return {
      id: group.id,
      name: group.name,
      type: group.type,
      role: membership.role,
      memberCount: memberCounts.get(group.id) ?? 1,
      monthTotal: group.type === 'balance_control' ? balanceExpenseByGroup.get(group.id) ?? 0 : totalByGroup.get(group.id) ?? 0,
      myValue: group.type === 'balance_control' ? balanceByGroup.get(group.id) ?? 0 : shareByGroup.get(group.id) ?? 0,
    }
  })
}

export async function createGroup(name: string, type: GroupType) {
  const { month, year } = currentMonth()
  const { data, error } = await client().rpc('create_group_with_period', {
    p_name: name.trim(),
    p_type: type,
    p_month: month,
    p_year: year,
  })
  throwIfError(error)
  if (!data) throw new Error('O grupo não foi criado.')
  return String(data)
}

export async function getGroupDetails(
  groupId: string,
  userId: string,
  selectedPeriod?: { month: number; year: number },
): Promise<GroupDetails> {
  const db = client()
  const { month, year } = selectedPeriod ?? currentMonth()
  const [{ data: group, error: groupError }, { data: membersData, error: membersError }] = await Promise.all([
    db.from('groups').select('id, name, type, owner_id, archived_at').eq('id', groupId).is('archived_at', null).single(),
    db.from('group_members').select('id, user_id, role, profiles(display_name, avatar_url)').eq('group_id', groupId).eq('status', 'active'),
  ])
  if (groupError && groupError.code !== 'PGRST116') throwIfError(groupError)
  if (!group) throw new GroupAccessError()
  throwIfError(membersError)

  const members = (membersData ?? []) as unknown as MemberRow[]
  const currentMembership = members.find((member) => member.user_id === userId)
  if (!currentMembership) throw new GroupAccessError()

  const { data: period, error: periodError } = await db
    .from('monthly_periods')
    .select('id, status')
    .eq('group_id', groupId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle()
  throwIfError(periodError)

  const emptyMembers: GroupMemberSummary[] = members.map((member) => ({
    membershipId: member.id,
    userId: member.user_id,
    displayName: member.profiles?.display_name || 'Membro',
    avatarUrl: member.profiles?.avatar_url ?? null,
    role: member.role,
    isCurrentUser: member.user_id === userId,
    isOwner: member.user_id === group.owner_id,
    value: 0,
    paidValue: 0,
    pendingValue: 0,
  }))

  if (!period) {
    return {
      id: group.id,
      name: group.name,
      type: group.type as GroupType,
      ownerId: group.owner_id,
      currentUserRole: currentMembership.role,
      monthTotal: 0,
      myValue: 0,
      myPaidValue: 0,
      myPendingValue: 0,
      confirmedExpenseCount: 0,
      paidGroupValue: 0,
      pendingGroupValue: 0,
      reviewValue: 0,
      monthStatus: 'empty',
      selectedMonth: month,
      selectedYear: year,
      nextDue: null,
      upcomingExpenses: [],
      categories: [],
      members: emptyMembers,
      expenses: [],
      balanceControl: group.type === 'balance_control' ? {
        accountId: null,
        configured: false,
        startingBalance: 0,
        incomeTotal: 0,
        expenseTotal: 0,
        currentBalance: 0,
        notes: null,
        movements: [],
        installments: [],
        participants: emptyMembers.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
          isCurrentUser: member.isCurrentUser,
          configured: false,
          startingBalance: 0,
          currentBalance: 0,
        })),
        categories: [],
        upcomingExpenses: [],
      } : null,
    }
  }

  const [expenseResult, balanceResult, movementResult, installmentResult] = await Promise.all([
    db.from('expenses').select('id, title, amount, category, type, purchase_date, due_date, status, paid_by_user_id, installment_id, notes').eq('group_id', groupId).eq('monthly_period_id', period.id).order('purchase_date', { ascending: false }),
    group.type === 'balance_control'
      ? db.from('balance_accounts').select('id, user_id, starting_balance, current_balance, notes').eq('group_id', groupId).eq('monthly_period_id', period.id)
      : Promise.resolve({ data: [], error: null }),
    group.type === 'balance_control'
      ? db.from('balance_movements').select('id, user_id, type, amount, description, movement_date, notes, related_expense_id, created_at').eq('group_id', groupId).eq('monthly_period_id', period.id).order('movement_date', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    db.from('installments').select('id, title, total_amount, installment_amount, total_installments, current_installment, due_day, card_label, paid_by_user_id, active, first_due_date, notes').eq('group_id', groupId).order('created_at', { ascending: false }),
  ])
  throwIfError(expenseResult.error)
  throwIfError(balanceResult.error)
  throwIfError(movementResult.error)
  throwIfError(installmentResult.error)

  const expenses = expenseResult.data ?? []
  const expenseIds = expenses.map((expense) => expense.id as string)
  const installmentIds = (installmentResult.data ?? []).map((installment) => installment.id as string)
  const reactionTargetIds = [...new Set([...expenseIds, ...installmentIds])]
  const [participantResult, receiptResult, paymentResult, reactionResult] = await Promise.all([
    expenseIds.length
      ? db.from('expense_participants').select('expense_id, user_id, share_amount, share_percent, included').in('expense_id', expenseIds)
      : Promise.resolve({ data: [], error: null }),
    expenseIds.length
      ? db.from('receipts').select('id, expense_id, storage_path, original_filename, status').in('expense_id', expenseIds)
      : Promise.resolve({ data: [], error: null }),
    installmentIds.length
      ? db.from('installment_payments').select('installment_id, installment_number').in('installment_id', installmentIds)
      : Promise.resolve({ data: [], error: null }),
    reactionTargetIds.length
      ? db.from('group_transaction_reactions').select('target_kind, target_id, user_id, emoji').in('target_id', reactionTargetIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  throwIfError(participantResult.error)
  throwIfError(receiptResult.error)
  throwIfError(paymentResult.error)
  throwIfError(reactionResult.error)

  const displayNameByUser = new Map(members.map((member) => [member.user_id, member.profiles?.display_name || 'Membro']))
  const reactionsByTarget = summarizeReactions(
    (reactionResult.data ?? []).map((reaction) => ({
      target_kind: reaction.target_kind as 'expense' | 'installment',
      target_id: reaction.target_id as string,
      user_id: reaction.user_id as string,
      emoji: reaction.emoji as ReactionEmoji,
    })),
    userId,
    displayNameByUser,
  )
  const paidNumbersByInstallment = new Map<string, Set<number>>()
  for (const payment of paymentResult.data ?? []) {
    const installmentId = payment.installment_id as string
    const numbers = paidNumbersByInstallment.get(installmentId) ?? new Set<number>()
    numbers.add(Number(payment.installment_number))
    paidNumbersByInstallment.set(installmentId, numbers)
  }
  const installmentById = new Map((installmentResult.data ?? []).map((installment) => [installment.id as string, installment]))
  const participantsByExpense = new Map<string, ExpenseParticipantSummary[]>()
  for (const participant of participantResult.data ?? []) {
    const expenseId = participant.expense_id as string
    const summary: ExpenseParticipantSummary = {
      userId: participant.user_id as string,
      displayName: displayNameByUser.get(participant.user_id as string) || 'Membro',
      shareAmount: Number(participant.share_amount),
      sharePercent: participant.share_percent === null ? null : Number(participant.share_percent),
      included: Boolean(participant.included),
    }
    participantsByExpense.set(expenseId, [...(participantsByExpense.get(expenseId) ?? []), summary])
  }

  const receiptByExpense = new Map((receiptResult.data ?? []).map((receipt) => [receipt.expense_id as string, {
    id: receipt.id as string,
    storagePath: receipt.storage_path as string,
    originalFilename: receipt.original_filename as string,
    status: receipt.status as string,
  }]))

  const expenseSummaries: GroupExpenseSummary[] = expenses.map((expense) => {
    const installmentId = (expense.installment_id as string | null) ?? null
    const installment = installmentId ? installmentById.get(installmentId) : null
    const firstDueDate = installment?.first_due_date ? new Date(`${String(installment.first_due_date)}T12:00:00`) : null
    const periodInstallment = firstDueDate
      ? Math.max(1, Math.min(Number(installment?.total_installments ?? 1), 1 + (year - firstDueDate.getFullYear()) * 12 + (month - (firstDueDate.getMonth() + 1))))
      : Number(installment?.current_installment ?? 1)
    const paidInstallments = installmentId ? (paidNumbersByInstallment.get(installmentId)?.size ?? 0) : 0
    return {
    id: expense.id as string,
    title: expense.title as string,
    amount: Number(expense.amount),
    category: expense.category as string,
    type: expense.type as GroupExpenseSummary['type'],
    purchaseDate: expense.purchase_date as string,
    dueDate: (expense.due_date as string | null) ?? null,
    status: expense.status as GroupExpenseSummary['status'],
    paidByUserId: (expense.paid_by_user_id as string | null) ?? null,
    installmentId,
    paidBy: displayNameByUser.get(expense.paid_by_user_id as string) || 'Não informado',
    notes: (expense.notes as string | null) ?? null,
    participants: participantsByExpense.get(expense.id as string) ?? [],
    receipt: receiptByExpense.get(expense.id as string) ?? null,
    installment: installment ? {
      totalInstallments: Number(installment.total_installments),
      currentInstallment: periodInstallment,
      paidInstallments,
      remainingInstallments: Math.max(Number(installment.total_installments) - paidInstallments, 0),
    } : null,
    reactions: reactionsByTarget.get(`expense:${String(expense.id)}`) ?? [],
  }})

  const confirmedExpenses = expenseSummaries.filter((expense) => expense.status !== 'cancelled' && expense.status !== 'review')
  const reviewExpenses = expenseSummaries.filter((expense) => expense.status === 'review')
  const valueByUser = new Map<string, number>()
  const paidByUser = new Map<string, number>()
  const pendingByUser = new Map<string, number>()
  const displayNameById = new Map(members.map((member) => [member.user_id, member.profiles?.display_name || 'Membro']))
  const movementSummaries: BalanceMovementSummary[] = (movementResult.data ?? []).map((movement) => ({
    id: movement.id as string,
    userId: movement.user_id as string,
    displayName: displayNameById.get(movement.user_id as string) || 'Membro',
    type: movement.type as BalanceMovementSummary['type'],
    amount: Number(movement.amount),
    description: movement.description as string,
    movementDate: movement.movement_date as string,
    notes: (movement.notes as string | null) ?? null,
    createdAt: movement.created_at as string,
    relatedExpenseId: (movement.related_expense_id as string | null) ?? null,
  }))
  const accountByUser = new Map((balanceResult.data ?? []).map((account) => [account.user_id as string, account]))
  const incomeByUser = new Map<string, number>()
  const expenseByUser = new Map<string, number>()

  if (group.type === 'balance_control') {
    const relatedExpenseIds = new Set(movementSummaries.filter((movement) => movement.type === 'expense' && movement.relatedExpenseId).map((movement) => movement.relatedExpenseId as string))
    for (const movement of movementSummaries) {
      const target = movement.type === 'income' ? incomeByUser : expenseByUser
      target.set(movement.userId, (target.get(movement.userId) ?? 0) + movement.amount)
    }
    for (const expense of confirmedExpenses) {
      if (!expense.paidByUserId || relatedExpenseIds.has(expense.id)) continue
      expenseByUser.set(expense.paidByUserId, (expenseByUser.get(expense.paidByUserId) ?? 0) + expense.amount)
    }
    const representedInstallmentIds = new Set(confirmedExpenses.map((expense) => expense.installmentId).filter(Boolean))
    for (const installment of installmentResult.data ?? []) {
      const installmentId = installment.id as string
      const responsibleId = (installment.paid_by_user_id as string | null) ?? null
      const firstDueDate = (installment.first_due_date as string | null) ?? null
      const firstDue = firstDueDate ? new Date(`${firstDueDate}T12:00:00`) : null
      const elapsed = firstDue ? (year - firstDue.getFullYear()) * 12 + (month - (firstDue.getMonth() + 1)) : Number(installment.current_installment) - 1
      if (!responsibleId || representedInstallmentIds.has(installmentId) || elapsed < 0 || elapsed >= Number(installment.total_installments)) continue
      expenseByUser.set(responsibleId, (expenseByUser.get(responsibleId) ?? 0) + Number(installment.installment_amount))
    }
    for (const member of emptyMembers) {
      const account = accountByUser.get(member.userId)
      const startingBalance = account ? Number(account.starting_balance) : 0
      valueByUser.set(member.userId, startingBalance + (incomeByUser.get(member.userId) ?? 0) - (expenseByUser.get(member.userId) ?? 0))
    }
  } else {
    for (const expense of confirmedExpenses) {
      for (const participant of expense.participants.filter((item) => item.included)) {
        valueByUser.set(participant.userId, (valueByUser.get(participant.userId) ?? 0) + participant.shareAmount)
        const target = expense.status === 'paid' ? paidByUser : pendingByUser
        target.set(participant.userId, (target.get(participant.userId) ?? 0) + participant.shareAmount)
      }
    }
  }

  const detailMembers = emptyMembers.map((member) => ({
    ...member,
    value: valueByUser.get(member.userId) ?? 0,
    paidValue: paidByUser.get(member.userId) ?? 0,
    pendingValue: pendingByUser.get(member.userId) ?? 0,
  }))
  const balanceInstallments: BalanceInstallmentSummary[] = (installmentResult.data ?? []).map((installment) => {
    const firstDueDate = (installment.first_due_date as string | null) ?? null
    const paidNumbers = paidNumbersByInstallment.get(installment.id as string) ?? new Set<number>()
    const paidInstallments = paidNumbers.size
    const currentInstallment = nextUnpaidInstallment(Number(installment.total_installments), paidNumbers)
    return {
      id: installment.id as string,
      title: installment.title as string,
      totalAmount: Number(installment.total_amount),
      installmentAmount: Number(installment.installment_amount),
      totalInstallments: Number(installment.total_installments),
      currentInstallment,
      remainingInstallments: Math.max(Number(installment.total_installments) - paidInstallments, 0),
      dueDay: Number(installment.due_day),
      nextDueDate: periodDate(year, month, Number(installment.due_day)),
      firstDueDate,
      cardLabel: (installment.card_label as string | null) ?? null,
      notes: (installment.notes as string | null) ?? null,
      paidByUserId: (installment.paid_by_user_id as string | null) ?? null,
      responsibleName: displayNameById.get(installment.paid_by_user_id as string) || 'Não informado',
      active: Boolean(installment.active),
      paidInstallments,
      reactions: reactionsByTarget.get(`installment:${String(installment.id)}`) ?? [],
    }
  }).filter((installment) => installment.currentInstallment > 0 && installment.currentInstallment <= installment.totalInstallments && installment.active)
  const monthTotal = group.type === 'balance_control'
    ? [...expenseByUser.values()].reduce((total, amount) => total + amount, 0)
    : confirmedExpenses.reduce((total, expense) => total + expense.amount, 0)
  const paidGroupValue = confirmedExpenses.filter((expense) => expense.status === 'paid').reduce((total, expense) => total + expense.amount, 0)
  const pendingGroupValue = confirmedExpenses.filter((expense) => expense.status !== 'paid').reduce((total, expense) => total + expense.amount, 0)
  const pendingDueExpenses = confirmedExpenses
    .filter((expense) => expense.status !== 'paid' && expense.dueDate)
    .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)))
  const categoryMap = new Map<string, ExpenseCategorySummary>()
  for (const expense of confirmedExpenses) {
    const key = categoryKey(expense.category)
    const definition = categoryDefinitions.find((item) => item.key === key) ?? categoryDefinitions[categoryDefinitions.length - 1]
    const current = categoryMap.get(key) ?? { key, label: definition.label, amount: 0, count: 0 }
    categoryMap.set(key, { ...current, amount: current.amount + expense.amount, count: current.count + 1 })
  }
  const hasOverdue = pendingDueExpenses.some((expense) => expense.dueDate && new Date(`${expense.dueDate}T23:59:59`).getTime() < Date.now())
  const monthStatus: GroupDetails['monthStatus'] = confirmedExpenses.length === 0
    ? 'empty'
    : pendingGroupValue === 0
      ? 'paid'
      : hasOverdue
        ? 'attention'
        : 'in_progress'

  let balanceControl: BalanceControlSummary | null = null
  if (group.type === 'balance_control') {
    const myAccount = accountByUser.get(userId)
    const myCategories = new Map<string, ExpenseCategorySummary>()
    const addCategory = (key: string, label: string, amount: number) => {
      const current = myCategories.get(key) ?? { key, label, amount: 0, count: 0 }
      myCategories.set(key, { ...current, amount: current.amount + amount, count: current.count + 1 })
    }
    for (const expense of confirmedExpenses.filter((item) => item.paidByUserId === userId)) {
      const key = balanceCategoryKey(expense.category)
      const definition = balanceCategoryDefinitions.find((item) => item.key === key) ?? balanceCategoryDefinitions[balanceCategoryDefinitions.length - 1]
      addCategory(key, definition.label, expense.amount)
    }
    for (const movement of movementSummaries.filter((item) => item.userId === userId && item.type === 'expense' && !item.relatedExpenseId)) {
      addCategory('other', 'Outros', movement.amount)
    }
    const representedInstallmentIds = new Set(confirmedExpenses.map((expense) => expense.installmentId).filter(Boolean))
    for (const installment of balanceInstallments.filter((item) => item.paidByUserId === userId && !representedInstallmentIds.has(item.id))) {
      addCategory('card', 'Cartão', installment.installmentAmount)
    }
    const myUpcomingExpenses = confirmedExpenses
      .filter((expense) => expense.paidByUserId === userId && expense.status !== 'paid' && expense.dueDate)
      .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)))
      .slice(0, 5)

    balanceControl = {
      accountId: myAccount ? String(myAccount.id) : null,
      configured: Boolean(myAccount),
      startingBalance: myAccount ? Number(myAccount.starting_balance) : 0,
      incomeTotal: incomeByUser.get(userId) ?? 0,
      expenseTotal: expenseByUser.get(userId) ?? 0,
      currentBalance: valueByUser.get(userId) ?? 0,
      notes: myAccount ? ((myAccount.notes as string | null) ?? null) : null,
      movements: movementSummaries.filter((movement) => movement.userId === userId),
      installments: balanceInstallments,
      participants: detailMembers.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        isCurrentUser: member.isCurrentUser,
        configured: accountByUser.has(member.userId),
        startingBalance: accountByUser.has(member.userId) ? Number(accountByUser.get(member.userId)?.starting_balance) : 0,
        currentBalance: member.value,
      })),
      categories: balanceCategoryDefinitions.map((definition) => myCategories.get(definition.key)).filter((item): item is ExpenseCategorySummary => Boolean(item)),
      upcomingExpenses: myUpcomingExpenses,
    }
  }

  return {
    id: group.id,
    name: group.name,
    type: group.type as GroupType,
    ownerId: group.owner_id,
    currentUserRole: currentMembership.role,
    monthTotal,
    myValue: valueByUser.get(userId) ?? 0,
    myPaidValue: paidByUser.get(userId) ?? 0,
    myPendingValue: pendingByUser.get(userId) ?? 0,
    confirmedExpenseCount: confirmedExpenses.length,
    paidGroupValue,
    pendingGroupValue,
    reviewValue: reviewExpenses.reduce((total, expense) => total + expense.amount, 0),
    monthStatus,
    selectedMonth: month,
    selectedYear: year,
    nextDue: pendingDueExpenses[0] ?? null,
    upcomingExpenses: pendingDueExpenses.slice(0, 5),
    categories: categoryDefinitions.map((definition) => categoryMap.get(definition.key)).filter((item): item is ExpenseCategorySummary => Boolean(item)),
    members: detailMembers,
    expenses: expenseSummaries,
    balanceControl,
  }
}

export async function setMyStartingBalance(values: {
  groupId: string
  month: number
  year: number
  startingBalance: number
  notes: string | null
}) {
  const { data, error } = await client().rpc('set_my_starting_balance', {
    p_group_id: values.groupId,
    p_month: values.month,
    p_year: values.year,
    p_starting_balance: values.startingBalance,
    p_notes: values.notes,
  })
  throwIfError(error)
  if (!data) throw new Error('Não foi possível definir o saldo inicial.')
  return String(data)
}

export async function updateExpenseDetails(expenseId: string, values: {
  title: string
  amount: number
  category: string
  type: GroupExpenseSummary['type']
  purchaseDate: string
  dueDate: string | null
}) {
  const { data, error } = await client().rpc('update_group_expense', {
    p_expense_id: expenseId,
    p_title: values.title.trim(),
    p_amount: values.amount,
    p_category: values.category.trim(),
    p_type: values.type,
    p_purchase_date: values.purchaseDate,
    p_due_date: values.dueDate,
  })
  throwIfError(error)
  if (!data) throw new Error('Não foi possível atualizar a despesa.')
}

export async function approveExpense(expenseId: string) {
  const { data, error } = await client().rpc('approve_group_expense', { p_expense_id: expenseId })
  throwIfError(error)
  if (!data) throw new Error('Não foi possível aprovar a despesa.')
}

export async function markExpensePaid(expenseId: string) {
  const { data, error } = await client().rpc('mark_group_expense_paid_v2', { p_expense_id: expenseId })
  throwIfError(error)
  if (!data) throw new Error('Não foi possível marcar a despesa como paga.')
  const result = data as { milestone?: 'one_remaining' | 'completed' | null }
  return { milestone: result.milestone ?? null }
}

export async function markInstallmentPaid(installmentId: string) {
  const { data, error } = await client().rpc('mark_installment_paid', { p_installment_id: installmentId })
  throwIfError(error)
  if (!data) throw new Error('Não foi possível registrar o pagamento da parcela.')
  const result = data as { milestone?: 'one_remaining' | 'completed' | null }
  return { milestone: result.milestone ?? null }
}

export async function cancelExpense(expenseId: string) {
  const { data, error } = await client().rpc('cancel_group_expense', { p_expense_id: expenseId })
  throwIfError(error)
  if (!data) throw new Error('Não foi possível cancelar a despesa.')
}

export async function getReceiptSignedUrl(storagePath: string) {
  const { data, error } = await client().storage.from('receipts').createSignedUrl(storagePath, 60)
  throwIfError(error)
  if (!data) throw new Error('Não foi possível abrir a nota.')
  return data.signedUrl
}

export async function updateGroupName(groupId: string, name: string) {
  const { error } = await client().from('groups').update({ name: name.trim() }).eq('id', groupId)
  throwIfError(error)
}

export async function archiveGroup(groupId: string) {
  const { error } = await client().from('groups').update({ archived_at: new Date().toISOString() }).eq('id', groupId)
  throwIfError(error)
}

export async function removeGroupMember(groupId: string, membershipId: string) {
  const { error } = await client().from('group_members').update({ status: 'removed' }).eq('group_id', groupId).eq('id', membershipId)
  throwIfError(error)
}

export async function generateGroupInvite(groupId: string, userId: string) {
  const { data, error } = await client()
    .from('group_invites')
    .insert({ group_id: groupId, created_by: userId, active: true })
    .select('invite_token')
    .single()
  throwIfError(error)
  if (!data) throw new Error('Não foi possível gerar o convite.')
  return data.invite_token as string
}

export async function getInvitePreview(token: string): Promise<InvitePreview> {
  const { data, error } = await client().rpc('get_group_invite_preview', { p_token: token })
  throwIfError(error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Convite inválido ou expirado.')
  return { groupName: String(row.group_name), groupType: row.group_type as GroupType }
}

export async function acceptInvite(token: string) {
  const { data, error } = await client().rpc('accept_group_invite', { p_token: token })
  throwIfError(error)
  if (!data) throw new Error('Não foi possível entrar no grupo.')
  return String(data)
}
