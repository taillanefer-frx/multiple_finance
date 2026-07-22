import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarDays, ChevronRight, CircleDollarSign, CreditCard, History, Landmark, ListChecks, PackageOpen, ReceiptText, Settings2, SlidersHorizontal, UsersRound, WalletCards } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { CollapsibleSection } from '../../components/ui/CollapsibleSection'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { EmptyState } from '../../components/ui/StateDisplay'
import { Modal } from '../../components/ui/Modal'
import { Surface } from '../../components/ui/Surface'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { currency } from '../../lib/utils/format'
import { BalanceDetailSheet, type BalanceDetailTarget } from './BalanceDetailSheet'
import { GroupAdminPanel } from './GroupAdminPanel'
import { setMyStartingBalance } from './groupService'
import type { BalanceMovementSummary, GroupDetails, GroupExpenseSummary } from './types'

const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function dateLabel(value: string | null) {
  if (!value) return 'Sem data'
  return new Date(value.includes('T') ? value : `${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

interface BalanceControlDashboardProps {
  group: GroupDetails
  userId: string
  configured: boolean
  onMonthChange: (period: { month: number; year: number }) => void
  onRefresh: () => Promise<void>
}

export function BalanceControlDashboard({ group, userId, configured, onMonthChange, onRefresh }: BalanceControlDashboardProps) {
  const navigate = useNavigate()
  const balance = group.balanceControl
  const [detail, setDetail] = useState<BalanceDetailTarget | null>(null)
  const [balanceModalOpen, setBalanceModalOpen] = useState(false)
  const [monthModalOpen, setMonthModalOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [amount, setAmount] = useState(balance?.startingBalance ? String(balance.startingBalance) : '')
  const [notes, setNotes] = useState(balance?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const incomes = useMemo(() => balance?.movements.filter((movement) => movement.type === 'income') ?? [], [balance])
  const movementExpenses = useMemo(() => balance?.movements.filter((movement) => movement.type === 'expense') ?? [], [balance])
  const confirmedExpenses = useMemo(() => group.expenses.filter((expense) => expense.status !== 'review' && expense.status !== 'cancelled'), [group.expenses])
  const reviewExpenses = useMemo(() => group.expenses.filter((expense) => expense.status === 'review' && expense.paidByUserId === userId), [group.expenses, userId])
  const relatedExpenseIds = useMemo(() => new Set(movementExpenses.map((movement) => movement.relatedExpenseId).filter(Boolean)), [movementExpenses])
  const directExpenses = useMemo(() => confirmedExpenses.filter((expense) => expense.paidByUserId === userId && !relatedExpenseIds.has(expense.id)), [confirmedExpenses, relatedExpenseIds, userId])
  const representedInstallmentIds = useMemo(() => new Set(confirmedExpenses.map((expense) => expense.installmentId).filter(Boolean)), [confirmedExpenses])
  const scheduledInstallments = useMemo(() => balance?.installments.filter((installment) => installment.paidByUserId === userId && !representedInstallmentIds.has(installment.id)) ?? [], [balance, representedInstallmentIds, userId])
  const outputTargets = useMemo<BalanceDetailTarget[]>(() => [
    ...movementExpenses.map((movement) => {
      const related = movement.relatedExpenseId ? confirmedExpenses.find((expense) => expense.id === movement.relatedExpenseId) : null
      return related ? { kind: 'expense' as const, item: related } : { kind: 'movement' as const, item: movement }
    }),
    ...directExpenses.map((expense) => ({ kind: 'expense' as const, item: expense })),
    ...scheduledInstallments.map((installment) => ({ kind: 'installment' as const, item: installment })),
  ].sort((left, right) => targetDate(right).localeCompare(targetDate(left))), [confirmedExpenses, directExpenses, movementExpenses, scheduledInstallments])
  const historyTargets = useMemo<BalanceDetailTarget[]>(() => [
    ...incomes.map((item) => ({ kind: 'movement' as const, item })),
    ...outputTargets,
  ].sort((left, right) => targetDate(right).localeCompare(targetDate(left))), [incomes, outputTargets])
  const monthChoices = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const date = new Date(group.selectedYear, group.selectedMonth - 1 - index, 1)
    return { month: date.getMonth() + 1, year: date.getFullYear() }
  }), [group.selectedMonth, group.selectedYear])
  const noMovements = incomes.length === 0 && outputTargets.length === 0
  const lowBalance = balance?.configured && balance.currentBalance >= 0 && balance.startingBalance > 0 && balance.currentBalance <= balance.startingBalance * 0.15
  const negativeBalance = balance?.configured && balance.currentBalance < 0

  useEffect(() => {
    if (balanceModalOpen) return
    setAmount(balance?.startingBalance ? String(balance.startingBalance) : '')
    setNotes(balance?.notes ?? '')
    setSaveError(null)
  }, [balance?.accountId, balance?.notes, balance?.startingBalance, balanceModalOpen, group.selectedMonth, group.selectedYear])

  function showAllSections() {
    document.getElementById('balance-sections')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function saveBalance() {
    const parsed = Number(amount.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < 0 || !configured) return
    setSaving(true)
    setSaveError(null)
    try {
      await setMyStartingBalance({ groupId: group.id, month: group.selectedMonth, year: group.selectedYear, startingBalance: parsed, notes: notes.trim() || null })
      setBalanceModalOpen(false)
    } catch {
      setSaveError('Não foi possível definir o saldo. Confira o valor e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (!balance) return <EmptyState icon={Landmark} title="Controle de saldo indisponível" description="Os dados deste período não puderam ser organizados." />

  return (
    <div className="space-y-5 pb-4">
      <header className="flex items-center justify-between gap-3">
        <Link to="/app/grupos" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-petrol shadow-card" aria-label="Voltar aos grupos"><ArrowLeft size={18} /></Link>
        <div className="min-w-0 flex-1"><p className="truncate text-lg font-semibold tracking-tight text-ink">{group.name}</p><button className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium capitalize text-muted" onClick={() => setMonthModalOpen(true)}>{months[group.selectedMonth - 1]} de {group.selectedYear}<CalendarDays size={14} /></button></div>
        {!configured && <DemoBadge />}
        {group.currentUserRole === 'admin' && <button type="button" onClick={() => setAdminOpen((value) => !value)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-muted shadow-card" aria-label="Configurações do grupo"><Settings2 size={18} /></button>}
      </header>

      {adminOpen && <GroupAdminPanel group={group} userId={userId} showMembers={false} onRefresh={onRefresh} onArchived={() => navigate('/app/grupos', { replace: true })} />}

      {!balance.configured ? (
        <section className="rounded-3xl bg-petrol p-6 text-white shadow-lift sm:p-7"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><WalletCards size={21} /></span><h2 className="mt-6 text-2xl font-semibold tracking-tight">Defina seu saldo inicial deste mês.</h2><p className="mt-2 max-w-md text-sm leading-6 text-white/65">Você ainda não configurou seu saldo deste mês. Somente você pode definir este valor.</p><Button className="mt-6 bg-white text-petrol hover:bg-sage" onClick={() => setBalanceModalOpen(true)} disabled={!configured}>Definir saldo</Button></section>
      ) : (
        <section className="rounded-3xl bg-petrol p-6 text-white shadow-lift sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-white/70">Meu saldo disponível</p><p className="mt-2 text-4xl font-semibold tracking-tight">{currency.format(balance.currentBalance)}</p></div><button onClick={() => setBalanceModalOpen(true)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10" aria-label="Ajustar saldo inicial"><SlidersHorizontal size={19} /></button></div>
          <div className="mt-7 grid grid-cols-3 gap-3 border-t border-white/10 pt-5"><Metric label="Saldo inicial" value={balance.startingBalance} /><Metric label="Entradas" value={balance.incomeTotal} positive /><Metric label="Saídas" value={balance.expenseTotal} /></div>
          {(lowBalance || negativeBalance) && <div className={`mt-5 flex items-start gap-3 rounded-2xl p-4 text-sm ${negativeBalance ? 'bg-red-50 text-danger' : 'bg-amber-50 text-amber'}`}><AlertTriangle className="mt-0.5 shrink-0" size={17} /><p>{negativeBalance ? 'Seu saldo está negativo. Revise as próximas saídas.' : 'Seu saldo disponível está baixo para este mês.'}</p></div>}
        </section>
      )}

      <Surface className="overflow-hidden"><div className="flex items-center justify-between border-b border-line p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Saldo dos participantes</p><h3 className="mt-1 font-semibold text-ink">Visão do grupo</h3></div><UsersRound size={19} className="text-muted" /></div><div className="divide-y divide-line">{balance.participants.map((participant) => <div key={participant.userId} className="flex items-center gap-3 p-4 sm:px-5"><UserAvatar displayName={participant.displayName} avatarPath={participant.avatarUrl} className="h-10 w-10 text-xs" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{participant.isCurrentUser ? 'Eu' : participant.displayName}</p><p className="mt-0.5 text-xs text-muted">{participant.configured ? 'Saldo atualizado' : 'Ainda não definiu o saldo'}</p></div><p className="text-sm font-semibold text-ink">{participant.configured ? currency.format(participant.currentBalance) : '—'}</p></div>)}</div></Surface>

      {balance.configured && noMovements && <EmptyState icon={PackageOpen} title="Nenhuma entrada ou despesa registrada neste mês." description="Seu saldo inicial já está definido. Novas movimentações aparecerão aqui em tempo real." />}

      {balance.configured && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryCard title="Entradas do mês" total={balance.incomeTotal} icon={ArrowDownLeft} tone="positive" onViewAll={showAllSections}><MovementList movements={incomes.slice(0, 3)} onSelect={(item) => setDetail({ kind: 'movement', item })} /></SummaryCard>
          <SummaryCard title="Saídas do mês" total={balance.expenseTotal} icon={ArrowUpRight} tone="petrol" onViewAll={showAllSections}><TargetList targets={outputTargets.slice(0, 3)} onSelect={setDetail} /></SummaryCard>
        </div>

        <Surface className="overflow-hidden"><SectionHeader eyebrow="Parcelamentos ativos" title="Compromissos em andamento" icon={CreditCard} />{balance.installments.length ? <div className="divide-y divide-line">{balance.installments.slice(0, 4).map((installment) => <button key={installment.id} onClick={() => setDetail({ kind: 'installment', item: installment })} className="flex w-full items-center gap-3 px-5 py-4 text-left"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{installment.title}</p><p className="mt-1 text-xs text-muted">{installment.remainingInstallments} restantes · vence {dateLabel(installment.nextDueDate)} · {installment.responsibleName}</p></div><p className="text-sm font-semibold text-ink">{currency.format(installment.installmentAmount)}</p><ChevronRight size={16} className="text-muted" /></button>)}</div> : <p className="p-5 text-sm text-muted">Nenhum parcelamento ativo.</p>}</Surface>

        <Surface className="overflow-hidden"><SectionHeader eyebrow="Próximos vencimentos" title="O que precisa de atenção" icon={CalendarDays} />{balance.upcomingExpenses.length ? <ExpenseList expenses={balance.upcomingExpenses} onSelect={(item) => setDetail({ kind: 'expense', item })} due /> : <p className="p-5 text-sm text-muted">Nenhum vencimento pendente informado.</p>}</Surface>

        <Surface className="p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Resumo por categoria</p><h3 className="mt-1 font-semibold text-ink">Para onde foi meu dinheiro</h3></div><CircleDollarSign size={19} className="text-muted" /></div><div className="mt-5 space-y-4">{balance.categories.length ? balance.categories.map((category) => <div key={category.key}><div className="flex items-center justify-between text-sm"><span className="font-medium text-ink">{category.label}</span><span className="font-semibold text-ink">{currency.format(category.amount)}</span></div><div className="mt-2 h-1.5 rounded-full bg-sage"><div className="h-full rounded-full bg-petrol" style={{ width: `${balance.expenseTotal ? Math.max(5, category.amount / balance.expenseTotal * 100) : 0}%` }} /></div></div>) : <p className="text-sm text-muted">Categorias aparecerão após as primeiras saídas.</p>}</div></Surface>

        <div id="balance-sections" className="scroll-mt-24 space-y-3">
          <CollapsibleSection title="Entradas" description="Valores recebidos no período" icon={ArrowDownLeft} badge={String(incomes.length)}><MovementList movements={incomes} onSelect={(item) => setDetail({ kind: 'movement', item })} /></CollapsibleSection>
          <CollapsibleSection title="Despesas fixas" description="Compromissos recorrentes" icon={Landmark} badge={String(confirmedExpenses.filter((item) => item.type === 'fixed' && item.paidByUserId === userId).length)}><ExpenseList expenses={confirmedExpenses.filter((item) => item.type === 'fixed' && item.paidByUserId === userId)} onSelect={(item) => setDetail({ kind: 'expense', item })} /></CollapsibleSection>
          <CollapsibleSection title="Despesas variáveis" description="Gastos que mudam no mês" icon={ListChecks} badge={String(confirmedExpenses.filter((item) => item.type === 'variable' && item.paidByUserId === userId).length)}><ExpenseList expenses={confirmedExpenses.filter((item) => item.type === 'variable' && item.paidByUserId === userId)} onSelect={(item) => setDetail({ kind: 'expense', item })} /></CollapsibleSection>
          <CollapsibleSection title="Gastos avulsos" description="Compras pontuais" icon={ReceiptText} badge={String(confirmedExpenses.filter((item) => item.type === 'one_time' && item.paidByUserId === userId).length)}><ExpenseList expenses={confirmedExpenses.filter((item) => item.type === 'one_time' && item.paidByUserId === userId)} onSelect={(item) => setDetail({ kind: 'expense', item })} /></CollapsibleSection>
          {reviewExpenses.length > 0 && <CollapsibleSection title="Em revisão" description="Ainda não descontadas do saldo" icon={AlertTriangle} badge={String(reviewExpenses.length)}><ExpenseList expenses={reviewExpenses} onSelect={(item) => setDetail({ kind: 'expense', item })} /></CollapsibleSection>}
          <CollapsibleSection title="Parcelamentos" description="Parcelas ativas do grupo" icon={CreditCard} badge={String(balance.installments.length)}>{balance.installments.length ? <div className="divide-y divide-line">{balance.installments.map((item) => <button key={item.id} onClick={() => setDetail({ kind: 'installment', item })} className="flex w-full items-center justify-between gap-3 p-4 text-left"><span className="text-sm font-semibold text-ink">{item.title}</span><span className="text-sm text-muted">{item.currentInstallment}/{item.totalInstallments}</span></button>)}</div> : <p className="p-5 text-sm text-muted">Nenhum parcelamento ativo.</p>}</CollapsibleSection>
          <CollapsibleSection title="Histórico do mês" description="Entradas e saídas mais recentes" icon={History} badge={String(historyTargets.length)}><TargetList targets={historyTargets} onSelect={setDetail} /></CollapsibleSection>
        </div>
      </>}

      <Modal open={balanceModalOpen} onClose={() => !saving && setBalanceModalOpen(false)} title={balance.configured ? 'Ajustar saldo inicial' : 'Definir saldo'} description={`Referência: ${months[group.selectedMonth - 1]} de ${group.selectedYear}. Somente o seu saldo será alterado.`}><div className="space-y-4"><label className="block text-xs font-semibold text-ink">Valor inicial<input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" className="mt-2 h-12 w-full rounded-2xl border border-line px-4 text-sm" /></label><label className="block text-xs font-semibold text-ink">Observação opcional<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-line p-4 text-sm" placeholder="Ex.: valor disponível após contas pessoais" /></label><div className="rounded-2xl bg-canvas p-4 text-xs text-muted"><span className="font-semibold text-ink">Mês de referência</span><p className="mt-1 capitalize">{months[group.selectedMonth - 1]} de {group.selectedYear}</p></div>{saveError && <p className="text-xs text-danger">{saveError}</p>}<Button fullWidth disabled={saving || !amount.trim() || !configured} onClick={saveBalance}>{saving ? 'Salvando…' : 'Salvar saldo inicial'}</Button></div></Modal>
      <Modal open={monthModalOpen} onClose={() => setMonthModalOpen(false)} title="Trocar mês" description="Consulte outro período sem alterar os demais dados."><div className="grid grid-cols-2 gap-2">{monthChoices.map((period) => <Button key={`${period.year}-${period.month}`} variant={period.month === group.selectedMonth && period.year === group.selectedYear ? 'primary' : 'secondary'} onClick={() => { onMonthChange(period); setMonthModalOpen(false) }}><span className="capitalize">{months[period.month - 1].slice(0, 3)}</span> {period.year}</Button>)}</div></Modal>
      <BalanceDetailSheet target={detail} configured={configured} onClose={() => setDetail(null)} />
    </div>
  )
}

function Metric({ label, value, positive }: { label: string; value: number; positive?: boolean }) { return <div><p className="text-[11px] text-white/55">{label}</p><p className={`mt-1 text-sm font-semibold ${positive ? 'text-emerald-200' : ''}`}>{currency.format(value)}</p></div> }

function SectionHeader({ eyebrow, title, icon: Icon }: { eyebrow: string; title: string; icon: typeof CalendarDays }) { return <div className="flex items-center justify-between border-b border-line p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">{eyebrow}</p><h3 className="mt-1 font-semibold text-ink">{title}</h3></div><Icon size={19} className="text-muted" /></div> }

function SummaryCard({ title, total, icon: Icon, tone, onViewAll, children }: { title: string; total: number; icon: typeof ArrowDownLeft; tone: 'positive' | 'petrol'; onViewAll: () => void; children: React.ReactNode }) { return <Surface className="overflow-hidden"><div className="p-5"><div className="flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-2xl ${tone === 'positive' ? 'bg-sage text-positive' : 'bg-petrol text-white'}`}><Icon size={18} /></span><button onClick={onViewAll} className="text-xs font-semibold text-petrol">Ver todas</button></div><p className="mt-4 text-xs text-muted">{title}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{currency.format(total)}</p></div><div className="border-t border-line">{children}</div></Surface> }

function MovementList({ movements, onSelect }: { movements: BalanceMovementSummary[]; onSelect: (item: BalanceMovementSummary) => void }) { if (!movements.length) return <p className="p-5 text-sm text-muted">Nenhum registro nesta seção.</p>; return <div className="divide-y divide-line">{movements.slice(0, 8).map((movement) => <button key={movement.id} onClick={() => onSelect(movement)} className="flex w-full items-center gap-3 px-5 py-4 text-left"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{movement.description}</p><p className="mt-1 text-xs text-muted">{dateLabel(movement.movementDate)} · {movement.displayName}</p></div><p className={`text-sm font-semibold ${movement.type === 'income' ? 'text-positive' : 'text-ink'}`}>{movement.type === 'income' ? '+' : '−'} {currency.format(movement.amount)}</p><ChevronRight size={16} className="text-muted" /></button>)}</div> }

function ExpenseList({ expenses, onSelect, due = false }: { expenses: GroupExpenseSummary[]; onSelect: (item: GroupExpenseSummary) => void; due?: boolean }) { if (!expenses.length) return <p className="p-5 text-sm text-muted">Nenhuma despesa nesta seção.</p>; return <div className="divide-y divide-line">{expenses.slice(0, 8).map((expense) => <button key={expense.id} onClick={() => onSelect(expense)} className="flex w-full items-center gap-3 px-5 py-4 text-left"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{expense.title}</p><p className="mt-1 text-xs text-muted">{due ? `Vence ${dateLabel(expense.dueDate)}` : dateLabel(expense.purchaseDate)} · {expense.category} · {expense.paidBy} · {statusLabel(expense)}</p></div><p className="text-sm font-semibold text-ink">{currency.format(expense.amount)}</p><ChevronRight size={16} className="text-muted" /></button>)}</div> }

function TargetList({ targets, onSelect }: { targets: BalanceDetailTarget[]; onSelect: (target: BalanceDetailTarget) => void }) { if (!targets.length) return <p className="p-5 text-sm text-muted">Nenhum registro nesta seção.</p>; return <div className="divide-y divide-line">{targets.slice(0, 8).map((target) => { const income = target.kind === 'movement' && target.item.type === 'income'; return <button key={`${target.kind}-${target.item.id}`} onClick={() => onSelect(target)} className="flex w-full items-center gap-3 px-5 py-4 text-left"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{target.kind === 'movement' ? target.item.description : target.item.title}</p><p className="mt-1 text-xs text-muted">{dateLabel(targetDate(target))}</p></div><p className={`text-sm font-semibold ${income ? 'text-positive' : 'text-ink'}`}>{income ? '+' : '−'} {currency.format(targetAmount(target))}</p><ChevronRight size={16} className="text-muted" /></button> })}</div> }

function targetDate(target: BalanceDetailTarget) { if (target.kind === 'movement') return target.item.movementDate; if (target.kind === 'expense') return target.item.purchaseDate; return target.item.nextDueDate }
function targetAmount(target: BalanceDetailTarget) { if (target.kind === 'installment') return target.item.installmentAmount; return target.item.amount }
function statusLabel(expense: GroupExpenseSummary) { if (expense.status === 'paid') return 'Paga'; if (expense.status === 'overdue') return 'Vencida'; if (expense.status === 'review') return 'Em revisão'; return 'Em aberto' }
