import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateDisplay'
import { dataErrorMessage } from '../../lib/supabase/errors'
import { useAuth } from '../auth/AuthContext'
import { useAddFlow } from '../expenses/AddFlowContext'
import { BalanceControlDashboard } from './BalanceControlDashboard'
import { HouseSplitDashboard } from './HouseSplitDashboard'
import { subscribeToGroup } from './groupRealtime'
import { getGroupDetails, GroupAccessError } from './groupService'
import type { GroupDetails, GroupExpenseSummary } from './types'

function currentPeriod() {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

function demoDetails(groupId: string, period: { month: number; year: number }): GroupDetails {
  const demoUser = 'demo-user'
  if (groupId === 'viagem') {
    return {
      id: groupId,
      name: 'Viagem de inverno',
      type: 'balance_control',
      ownerId: demoUser,
      currentUserRole: 'admin',
      monthTotal: 1580,
      myValue: 320,
      myPaidValue: 0,
      myPendingValue: 0,
      confirmedExpenseCount: 0,
      paidGroupValue: 0,
      pendingGroupValue: 0,
      reviewValue: 0,
      monthStatus: 'in_progress',
      selectedMonth: period.month,
      selectedYear: period.year,
      nextDue: null,
      upcomingExpenses: [],
      categories: [],
      members: [
        { membershipId: 'demo-balance-1', userId: demoUser, displayName: 'Thaiane Zeni', avatarUrl: null, role: 'admin', isCurrentUser: true, isOwner: true, value: 320, paidValue: 0, pendingValue: 0 },
        { membershipId: 'demo-balance-2', userId: 'demo-two', displayName: 'Ana', avatarUrl: null, role: 'member', isCurrentUser: false, isOwner: false, value: 340, paidValue: 0, pendingValue: 0 },
      ],
      expenses: [],
      balanceControl: {
        accountId: 'demo-account',
        configured: true,
        startingBalance: 1200,
        incomeTotal: 700,
        expenseTotal: 1580,
        currentBalance: 320,
        notes: 'Valores demonstrativos para visualizar a interface.',
        movements: [
          { id: 'demo-income', userId: demoUser, displayName: 'Thaiane Zeni', type: 'income', amount: 700, description: 'Dinheiro extra', movementDate: '2026-07-07', notes: null, createdAt: '2026-07-07T12:00:00Z', relatedExpenseId: null },
          { id: 'demo-output', userId: demoUser, displayName: 'Thaiane Zeni', type: 'expense', amount: 1280, description: 'Gastos do período', movementDate: '2026-07-10', notes: null, createdAt: '2026-07-10T12:00:00Z', relatedExpenseId: null },
        ],
        installments: [
          { id: 'demo-installment', title: 'Notebook', totalAmount: 3600, installmentAmount: 300, totalInstallments: 12, currentInstallment: 4, remainingInstallments: 8, dueDay: 20, nextDueDate: '2026-07-20', firstDueDate: '2026-04-20', cardLabel: 'Cartão principal', notes: null, paidByUserId: demoUser, responsibleName: 'Thaiane Zeni', active: true },
        ],
        participants: [
          { userId: demoUser, displayName: 'Thaiane Zeni', avatarUrl: null, isCurrentUser: true, configured: true, startingBalance: 1200, currentBalance: 320 },
          { userId: 'demo-two', displayName: 'Ana', avatarUrl: null, isCurrentUser: false, configured: true, startingBalance: 900, currentBalance: 340 },
        ],
        categories: [{ key: 'card', label: 'Cartão', amount: 300, count: 1 }, { key: 'other', label: 'Outros', amount: 1280, count: 1 }],
        upcomingExpenses: [],
      },
    }
  }
  const isCurrentPeriod = period.month === 7 && period.year === 2026
  const baseExpenses: GroupExpenseSummary[] = isCurrentPeriod ? [
    { id: 'demo-rent', title: 'Aluguel', amount: 2400, category: 'Aluguel', type: 'fixed', purchaseDate: '2026-07-01', dueDate: '2026-07-10', status: 'paid', paidByUserId: demoUser, installmentId: null, paidBy: 'Thaiane Zeni', notes: null, receipt: null, participants: [
      { userId: demoUser, displayName: 'Thaiane Zeni', shareAmount: 800, sharePercent: 33.33, included: true },
      { userId: 'demo-two', displayName: 'Ana', shareAmount: 800, sharePercent: 33.33, included: true },
      { userId: 'demo-three', displayName: 'Irmã', shareAmount: 800, sharePercent: 33.34, included: true },
    ] },
    { id: 'demo-market', title: 'Mercado da semana', amount: 360, category: 'Mercado', type: 'variable', purchaseDate: '2026-07-08', dueDate: '2026-07-18', status: 'open', paidByUserId: 'demo-two', installmentId: null, paidBy: 'Ana', notes: 'Itens compartilhados da casa.', receipt: null, participants: [
      { userId: demoUser, displayName: 'Thaiane Zeni', shareAmount: 120, sharePercent: 33.33, included: true },
      { userId: 'demo-two', displayName: 'Ana', shareAmount: 120, sharePercent: 33.33, included: true },
      { userId: 'demo-three', displayName: 'Irmã', shareAmount: 120, sharePercent: 33.34, included: true },
    ] },
    { id: 'demo-light', title: 'Conta de luz', amount: 210, category: 'Luz', type: 'fixed', purchaseDate: '2026-07-09', dueDate: '2026-07-22', status: 'review', paidByUserId: null, installmentId: null, paidBy: 'Não informado', notes: null, receipt: null, participants: [] },
  ] : []
  const confirmed = baseExpenses.filter((expense) => expense.status !== 'review' && expense.status !== 'cancelled')
  const memberIds = [demoUser, 'demo-two', 'demo-three']
  const names = ['Thaiane Zeni', 'Ana', 'Irmã']
  const values = memberIds.map((memberId) => confirmed.reduce((total, expense) => total + (expense.participants.find((participant) => participant.userId === memberId)?.shareAmount ?? 0), 0))
  const paidValues = memberIds.map((memberId) => confirmed.filter((expense) => expense.status === 'paid').reduce((total, expense) => total + (expense.participants.find((participant) => participant.userId === memberId)?.shareAmount ?? 0), 0))
  const pendingExpenses = confirmed.filter((expense) => expense.status !== 'paid')
  const total = confirmed.reduce((sum, expense) => sum + expense.amount, 0)

  return {
    id: groupId,
    name: 'Casa',
    type: 'house_split',
    ownerId: demoUser,
    currentUserRole: 'admin',
    monthTotal: total,
    myValue: values[0],
    myPaidValue: paidValues[0],
    myPendingValue: values[0] - paidValues[0],
    confirmedExpenseCount: confirmed.length,
    paidGroupValue: confirmed.filter((expense) => expense.status === 'paid').reduce((sum, expense) => sum + expense.amount, 0),
    pendingGroupValue: pendingExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    reviewValue: baseExpenses.filter((expense) => expense.status === 'review').reduce((sum, expense) => sum + expense.amount, 0),
    monthStatus: confirmed.length === 0 ? 'empty' : pendingExpenses.length ? 'in_progress' : 'paid',
    selectedMonth: period.month,
    selectedYear: period.year,
    nextDue: pendingExpenses[0] ?? null,
    upcomingExpenses: pendingExpenses,
    categories: [
      { key: 'rent', label: 'Aluguel', amount: confirmed.filter((expense) => expense.category === 'Aluguel').reduce((sum, expense) => sum + expense.amount, 0), count: 1 },
      { key: 'market', label: 'Mercado', amount: confirmed.filter((expense) => expense.category === 'Mercado').reduce((sum, expense) => sum + expense.amount, 0), count: 1 },
    ].filter((category) => category.amount > 0),
    members: memberIds.map((userId, index) => ({ membershipId: `demo-member-${index}`, userId, displayName: names[index], avatarUrl: null, role: index === 0 ? 'admin' : 'member', isCurrentUser: index === 0, isOwner: index === 0, value: values[index], paidValue: paidValues[index], pendingValue: values[index] - paidValues[index] })),
    expenses: baseExpenses,
    balanceControl: null,
  }
}

export default function GroupDetailPage() {
  const { groupId } = useParams()
  const { configured, loading: authLoading, user } = useAuth()
  const userId = user?.id ?? null
  const requestId = useRef(0)
  const groupRef = useRef<GroupDetails | null>(null)
  const navigate = useNavigate()
  const { setActiveGroup } = useAddFlow()
  const [period, setPeriod] = useState(currentPeriod)
  const [group, setGroup] = useState<GroupDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ kind: 'generic' | 'permission'; message: string } | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)

  const loadGroup = useCallback(async (silent = false) => {
    const currentRequest = ++requestId.current
    if (!groupId) {
      setError({ kind: 'generic', message: 'O endereço deste grupo está incompleto.' })
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    setError(null)
    if (!silent) setRefreshWarning(null)
    if (authLoading) return

    if (!configured) {
      setGroup(demoDetails(groupId, period))
      setLoading(false)
      return
    }
    if (!userId) {
      setGroup(null)
      setLoading(false)
      return
    }

    try {
      const nextGroup = await getGroupDetails(groupId, userId, period)
      if (currentRequest !== requestId.current) return
      setGroup(nextGroup)
      setRefreshWarning(null)
    } catch (caughtError) {
      if (currentRequest !== requestId.current) return
      if (silent && groupRef.current) {
        setRefreshWarning('A atualização em tempo real não foi concluída. Os últimos dados carregados continuam na tela.')
      } else {
        setGroup(null)
        setError(caughtError instanceof GroupAccessError
          ? { kind: 'permission', message: 'Somente membros ativos podem visualizar os dados privados deste grupo.' }
          : { kind: 'generic', message: dataErrorMessage(caughtError, 'Não foi possível consultar os dados deste grupo agora.') })
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [authLoading, configured, groupId, period, userId])

  useEffect(() => {
    groupRef.current = group
  }, [group])

  useEffect(() => {
    void loadGroup()
    return () => { requestId.current += 1 }
  }, [loadGroup])

  useEffect(() => {
    if (!configured || authLoading || !groupId || !userId) return
    return subscribeToGroup(groupId, () => { void loadGroup(true) })
  }, [authLoading, configured, groupId, loadGroup, userId])

  useEffect(() => {
    setActiveGroup(group)
    return () => setActiveGroup(null)
  }, [group, setActiveGroup])

  if (loading) return <LoadingState label="Organizando os dados do mês…" />
  if (error?.kind === 'permission') return <EmptyState icon={ShieldOff} title="Você não tem acesso a este grupo" description={error.message} actionLabel="Voltar aos grupos" onAction={() => navigate('/app/grupos', { replace: true })} />
  if (error || !group) return <ErrorState title="Não foi possível abrir o grupo" description={error?.message ?? 'O grupo não retornou dados.'} onRetry={() => void loadGroup()} />

  if (group.type === 'house_split') {
    return <><RefreshWarning message={refreshWarning} /><HouseSplitDashboard group={group} userId={userId || 'demo-user'} configured={configured} onMonthChange={setPeriod} onRefresh={() => loadGroup(true)} /></>
  }

  return <><RefreshWarning message={refreshWarning} /><BalanceControlDashboard group={group} userId={userId || 'demo-user'} configured={configured} onMonthChange={setPeriod} onRefresh={() => loadGroup(true)} /></>
}

function RefreshWarning({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="mb-4 rounded-2xl bg-amber/10 px-4 py-3 text-xs leading-5 text-amber">{message}</p>
}
