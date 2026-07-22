import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Clock3, FileImage, History, ListChecks, PackageOpen, ReceiptText, Settings2, ShoppingBasket, UsersRound, WalletCards } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { CollapsibleSection } from '../../components/ui/CollapsibleSection'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { EmptyState } from '../../components/ui/StateDisplay'
import { Modal } from '../../components/ui/Modal'
import { Surface } from '../../components/ui/Surface'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { currency } from '../../lib/utils/format'
import { ExpenseDetailSheet } from './ExpenseDetailSheet'
import { GroupAdminPanel } from './GroupAdminPanel'
import { useAddFlow } from '../expenses/AddFlowContext'
import type { GroupDetails, GroupExpenseSummary } from './types'

const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const statusLabels: Record<GroupDetails['monthStatus'], string> = { empty: 'Sem despesas', in_progress: 'Em andamento', attention: 'Requer atenção', paid: 'Tudo pago' }
const categoryChartColors = ['bg-petrol', 'bg-positive', 'bg-amber', 'bg-danger', 'bg-muted']

function formatDate(value: string | null) {
  if (!value) return 'Sem data'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function expenseStatus(expense: GroupExpenseSummary) {
  if (expense.status === 'paid') return 'Pago'
  if (expense.status === 'cancelled') return 'Cancelada'
  if (expense.status === 'review') return 'Em revisão'
  if (expense.status === 'overdue' || (expense.dueDate && new Date(`${expense.dueDate}T23:59:59`).getTime() < Date.now())) return 'Vencida'
  return 'Pendente'
}

interface HouseSplitDashboardProps {
  group: GroupDetails
  userId: string
  configured: boolean
  onMonthChange: (period: { month: number; year: number }) => void
  onRefresh: () => Promise<void>
}

export function HouseSplitDashboard({ group, userId, configured, onMonthChange, onRefresh }: HouseSplitDashboardProps) {
  const navigate = useNavigate()
  const { openAddFlow } = useAddFlow()
  const [selectedExpense, setSelectedExpense] = useState<GroupExpenseSummary | null>(null)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const confirmed = useMemo(() => group.expenses.filter((expense) => expense.status !== 'cancelled' && expense.status !== 'review'), [group.expenses])
  const reviews = useMemo(() => group.expenses.filter((expense) => expense.status === 'review'), [group.expenses])
  const history = useMemo(() => [...group.expenses].sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate)), [group.expenses])
  const monthChoices = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const date = new Date(group.selectedYear, group.selectedMonth - 1 - index, 1)
    return { month: date.getMonth() + 1, year: date.getFullYear() }
  }), [group.selectedMonth, group.selectedYear])
  const isEmpty = group.expenses.length === 0

  function openAdd() {
    openAddFlow()
  }

  return (
    <div className="space-y-5 pb-4">
      <header className="flex items-center justify-between gap-3">
        <Link to="/app/grupos" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-petrol shadow-card" aria-label="Voltar aos grupos"><ArrowLeft size={18} /></Link>
        <div className="min-w-0 flex-1"><p className="truncate text-lg font-semibold tracking-tight text-ink">{group.name}</p><button className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium capitalize text-muted" onClick={() => setMonthPickerOpen(true)}>{monthNames[group.selectedMonth - 1]} de {group.selectedYear}<CalendarDays size={14} /></button></div>
        {!configured && <DemoBadge />}
        {group.currentUserRole === 'admin' && <button type="button" onClick={() => setAdminOpen((value) => !value)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-muted shadow-card" aria-label="Configurações do grupo"><Settings2 size={18} /></button>}
      </header>

      <section className="rounded-3xl bg-petrol p-5 text-white shadow-lift sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-white/70">Minha parte este mês</p><p className="mt-1.5 text-3xl font-semibold tracking-tight">{currency.format(group.myValue)}</p></div><span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10"><WalletCards size={19} /></span></div>
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <div><p className="text-[11px] text-white/55">Já pago</p><p className="mt-1 text-sm font-semibold">{currency.format(group.myPaidValue)}</p></div>
          <div><p className="text-[11px] text-white/55">Pendente</p><p className="mt-1 text-sm font-semibold">{currency.format(group.myPendingValue)}</p></div>
          <div><p className="text-[11px] text-white/55">Próximo</p><p className="mt-1 text-sm font-semibold">{group.nextDue ? formatDate(group.nextDue.dueDate) : 'Nenhum'}</p></div>
        </div>
      </section>

      {adminOpen && <GroupAdminPanel group={group} userId={userId} showMembers={false} onRefresh={onRefresh} onArchived={() => navigate('/app/grupos', { replace: true })} />}

      {isEmpty ? <EmptyState icon={PackageOpen} title="Nenhuma despesa adicionada neste mês." description="As despesas confirmadas e a divisão entre participantes aparecerão aqui." actionLabel="Adicionar primeira despesa" onAction={openAdd} /> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Surface className="flex items-center gap-3 p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-sage text-petrol"><ReceiptText size={17} /></span><div className="min-w-0"><p className="text-[11px] text-muted">Total do grupo</p><p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-ink">{currency.format(group.monthTotal)}</p><p className="text-[10px] text-muted">{group.confirmedExpenseCount} {group.confirmedExpenseCount === 1 ? 'despesa' : 'despesas'}</p></div></Surface>
            <Surface className="flex items-center gap-3 p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-amber/10 text-amber"><ListChecks size={17} /></span><div className="min-w-0"><p className="text-[11px] text-muted">Status do mês</p><p className="mt-0.5 truncate text-sm font-semibold text-ink">{statusLabels[group.monthStatus]}</p><p className="text-[10px] text-muted">{currency.format(group.pendingGroupValue)} pendente</p></div></Surface>
          </div>

          <Surface className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Participantes</p><h3 className="mt-0.5 text-sm font-semibold text-ink">Partes do mês</h3></div><UsersRound size={18} className="text-muted" /></div>
            <div className="divide-y divide-line">{group.members.map((member) => <div key={member.membershipId} className="flex items-center gap-3 px-4 py-3 sm:px-5"><UserAvatar displayName={member.displayName} avatarPath={member.avatarUrl} className="h-9 w-9 text-[11px]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{member.isCurrentUser ? 'Eu' : member.displayName}</p><p className="mt-0.5 text-[11px] text-muted">{member.pendingValue > 0 ? `${currency.format(member.pendingValue)} pendente` : member.value > 0 ? 'Pago' : 'Sem participação'}</p></div><p className="text-sm font-semibold text-ink">{currency.format(member.value)}</p></div>)}</div>
          </Surface>

          <Surface className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Próximos vencimentos</p><h3 className="mt-0.5 text-sm font-semibold text-ink">O que vem pela frente</h3></div><Clock3 size={18} className="text-muted" /></div>
            {group.upcomingExpenses.length === 0 ? <p className="px-4 py-3 text-xs text-muted sm:px-5">Nenhuma despesa pendente com vencimento informado.</p> : <ExpenseList expenses={group.upcomingExpenses} onSelect={setSelectedExpense} dueDate />}
          </Surface>

          <Surface className="p-4 sm:p-5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Resumo por categoria</p><h3 className="mt-1 font-semibold text-ink">Onde o grupo gastou</h3></div><ShoppingBasket size={19} className="text-muted" /></div>
            <div className="mt-4 divide-y divide-line">{group.categories.map((category) => { const percentage = group.monthTotal ? category.amount / group.monthTotal * 100 : 0; return <div key={category.key} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span className="font-medium text-ink">{category.label}</span><span className="text-right"><span className="block font-semibold text-ink">{currency.format(category.amount)}</span><span className="text-[10px] text-muted">{percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total</span></span></div> })}</div>
            <div className="mt-4 border-t border-line pt-4"><div className="flex h-2 overflow-hidden rounded-full bg-canvas">{group.categories.map((category, index) => <span key={category.key} className={categoryChartColors[index % categoryChartColors.length]} style={{ width: `${group.monthTotal ? category.amount / group.monthTotal * 100 : 0}%` }} title={`${category.label}: ${currency.format(category.amount)}`} />)}</div><p className="mt-2 text-[10px] text-muted">Distribuição compacta das categorias confirmadas</p></div>
          </Surface>

          {reviews.length > 0 && <section className="rounded-3xl border border-amber/20 bg-amber/5 p-5"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white text-amber"><Clock3 size={17} /></span><div><p className="text-sm font-semibold text-ink">{reviews.length} {reviews.length === 1 ? 'despesa em revisão' : 'despesas em revisão'}</p><p className="mt-1 text-xs leading-5 text-muted">{currency.format(group.reviewValue)} ainda não entra no total confirmado.</p></div></div><div className="mt-3"><ExpenseList expenses={reviews} onSelect={setSelectedExpense} /></div></section>}

          <div className="space-y-3">
            <CollapsibleSection title="Despesas fixas" description="Compromissos recorrentes do mês" icon={CheckCircle2} badge={String(confirmed.filter((item) => item.type === 'fixed').length)}><ExpenseList expenses={confirmed.filter((item) => item.type === 'fixed')} onSelect={setSelectedExpense} /></CollapsibleSection>
            <CollapsibleSection title="Despesas variáveis" description="Compras e gastos do dia a dia" icon={ShoppingBasket} badge={String(confirmed.filter((item) => item.type === 'variable' || item.type === 'one_time').length)}><ExpenseList expenses={confirmed.filter((item) => item.type === 'variable' || item.type === 'one_time')} onSelect={setSelectedExpense} /></CollapsibleSection>
            <CollapsibleSection title="Parcelamentos" description="Compras divididas em parcelas" icon={WalletCards} badge={String(confirmed.filter((item) => item.type === 'installment').length)}><ExpenseList expenses={confirmed.filter((item) => item.type === 'installment')} onSelect={setSelectedExpense} /></CollapsibleSection>
            <CollapsibleSection title="Notas salvas" description="Comprovantes vinculados às despesas" icon={FileImage} badge={String(group.expenses.filter((item) => item.receipt).length)}><ExpenseList expenses={group.expenses.filter((item) => item.receipt)} onSelect={setSelectedExpense} /></CollapsibleSection>
            <CollapsibleSection title="Histórico do mês" description="Confirmadas, em revisão e canceladas" icon={History} badge={String(history.length)}><ExpenseList expenses={history} onSelect={setSelectedExpense} /></CollapsibleSection>
          </div>
        </>
      )}

      <Modal open={monthPickerOpen} onClose={() => setMonthPickerOpen(false)} title="Trocar mês" description="Consulte um período anterior sem alterar os dados."><div className="grid grid-cols-2 gap-2">{monthChoices.map((period) => <Button key={`${period.year}-${period.month}`} variant={period.month === group.selectedMonth && period.year === group.selectedYear ? 'primary' : 'secondary'} onClick={() => { onMonthChange(period); setMonthPickerOpen(false) }}><span className="capitalize">{monthNames[period.month - 1].slice(0, 3)}</span> {period.year}</Button>)}</div></Modal>
      <ExpenseDetailSheet expense={selectedExpense} configured={configured} onClose={() => setSelectedExpense(null)} />
    </div>
  )
}

function ExpenseList({ expenses, onSelect, dueDate = false }: { expenses: GroupExpenseSummary[]; onSelect: (expense: GroupExpenseSummary) => void; dueDate?: boolean }) {
  if (expenses.length === 0) return <p className="p-5 text-sm text-muted">Nenhuma despesa nesta seção.</p>
  return <div className="divide-y divide-line">{expenses.slice(0, 8).map((expense) => <button key={expense.id} type="button" onClick={() => onSelect(expense)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-canvas"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{expense.title}</p><p className="mt-1 truncate text-xs text-muted">{dueDate ? `Vence ${formatDate(expense.dueDate)}` : formatDate(expense.purchaseDate)} · {expense.category} · {expenseStatus(expense)}</p></div><div className="text-right"><p className="text-sm font-semibold text-ink">{currency.format(expense.amount)}</p></div><ChevronRight size={16} className="shrink-0 text-muted" /></button>)}</div>
}
