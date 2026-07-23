import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, Landmark, Pencil, ReceiptText, Scale, UsersRound, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { Modal } from '../../components/ui/Modal'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateDisplay'
import { Surface } from '../../components/ui/Surface'
import { dataErrorMessage } from '../../lib/supabase/errors'
import { cn } from '../../lib/utils/cn'
import { currency, shortDate } from '../../lib/utils/format'
import { useAuth } from '../auth/AuthContext'
import { demoGroups } from '../groups/demoGroups'
import { groupTypeLabel, groupValueLabel } from '../groups/groupLabels'
import { subscribeToGroupList } from '../groups/groupRealtime'
import { getGroupsForUser } from '../groups/groupService'
import type { GroupSummary } from '../groups/types'
import { PersonalCategoryChart } from './PersonalCategoryChart'
import { PersonalFinanceDetailSheet } from './PersonalFinanceDetailSheet'
import { PersonalTransactionModal } from './PersonalTransactionModal'
import { createPersonalTransaction, getPersonalFinanceSnapshot, subscribeToPersonalTransactions, updatePersonalTransaction } from './personalFinanceService'
import type { PersonalFinanceSnapshot, PersonalLedgerItem, PersonalTransaction, PersonalTransactionInput, PersonalTransactionType } from './types'

const demoSummaries: GroupSummary[] = demoGroups.map((group, index) => ({
  id: group.id,
  name: group.name,
  type: index === 0 ? 'house_split' : 'balance_control',
  role: 'admin',
  memberCount: group.members,
  monthTotal: group.monthTotal,
  myValue: index === 0 ? 1428.9 : 620,
}))

const emptySnapshot: PersonalFinanceSnapshot = {
  personalReady: true,
  transactions: [],
  items: [],
  categories: [],
  summary: { income: 0, personalExpenses: 0, groupExpenses: 0, totalExpenses: 0, balance: 0 },
}

const demoSnapshot: PersonalFinanceSnapshot = {
  personalReady: true,
  transactions: [
    { id: 'demo-income', userId: 'demo', type: 'income', description: 'Renda principal', amount: 4200, category: 'Salário', occurredOn: '2026-07-05', competenceMonth: '2026-07', notes: null, createdAt: '', updatedAt: '' },
    { id: 'demo-market', userId: 'demo', type: 'expense', description: 'Compras pessoais', amount: 320, category: 'Mercado', occurredOn: '2026-07-12', competenceMonth: '2026-07', notes: null, createdAt: '', updatedAt: '' },
  ],
  items: [
    { id: 'personal:demo-income', source: 'personal', sourceId: 'demo-income', type: 'income', description: 'Renda principal', amount: 4200, category: 'Salário', occurredOn: '2026-07-05', competenceMonth: '2026-07', notes: null, editable: true, groupId: null, groupName: null, expenseType: null, installment: null },
    { id: 'personal:demo-market', source: 'personal', sourceId: 'demo-market', type: 'expense', description: 'Compras pessoais', amount: 320, category: 'Mercado', occurredOn: '2026-07-12', competenceMonth: '2026-07', notes: null, editable: true, groupId: null, groupName: null, expenseType: null, installment: null },
    { id: 'group:demo-home', source: 'group', sourceId: 'demo-home', type: 'expense', description: 'Minha parte da casa', amount: 1428.9, category: 'Moradia', occurredOn: '2026-07-10', competenceMonth: '2026-07', notes: null, editable: false, groupId: demoGroups[0].id, groupName: demoGroups[0].name, expenseType: 'fixed', installment: null },
  ],
  categories: [
    { key: 'housing', label: 'Moradia', color: '#6F7F72', amount: 1428.9, count: 1 },
    { key: 'market', label: 'Mercado', color: '#E46D78', amount: 320, count: 1 },
  ],
  summary: { income: 4200, personalExpenses: 320, groupExpenses: 1428.9, totalExpenses: 1748.9, balance: 2451.1 },
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function periodFromKey(value: string) {
  const [year, month] = value.split('-').map(Number)
  return { month, year }
}

function periodLabel(value: string) {
  const { month, year } = periodFromKey(value)
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function expenseTypeLabel(type: string | null) {
  if (type === 'fixed') return 'Despesa fixa'
  if (type === 'variable') return 'Despesa variável'
  if (type === 'installment') return 'Parcelamento'
  return 'Despesa compartilhada'
}

export default function DashboardPage() {
  const { configured, loading: authLoading, user } = useAuth()
  const userId = user?.id ?? null
  const requestId = useRef(0)
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [snapshot, setSnapshot] = useState<PersonalFinanceSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [transactionType, setTransactionType] = useState<PersonalTransactionType>('expense')
  const [editingTransaction, setEditingTransaction] = useState<PersonalTransaction | null>(null)
  const [selectedGroupItem, setSelectedGroupItem] = useState<PersonalLedgerItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadDashboard = useCallback(async (silent = false) => {
    const currentRequest = ++requestId.current
    if (!silent) setLoading(true)
    setError(null)
    if (!silent) setRefreshWarning(null)
    if (authLoading) return
    if (!configured) {
      setGroups(demoSummaries)
      setSnapshot(demoSnapshot)
      setLoading(false)
      return
    }
    if (!userId) {
      setGroups([])
      setSnapshot(emptySnapshot)
      setLoading(false)
      return
    }
    try {
      const { month, year } = periodFromKey(monthKey)
      const [nextGroups, nextSnapshot] = await Promise.all([getGroupsForUser(userId), getPersonalFinanceSnapshot(userId, month, year)])
      if (currentRequest === requestId.current) {
        setGroups(nextGroups)
        setSnapshot(nextSnapshot)
        setRefreshWarning(null)
      }
    } catch (caughtError) {
      if (currentRequest === requestId.current) {
        const message = dataErrorMessage(caughtError, 'Não foi possível sincronizar sua visão financeira pessoal.')
        if (silent) setRefreshWarning('A atualização automática não foi concluída. Os últimos valores carregados continuam visíveis.')
        else setError(message)
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [authLoading, configured, monthKey, userId])

  useEffect(() => {
    void loadDashboard()
    return () => { requestId.current += 1 }
  }, [loadDashboard])

  useEffect(() => {
    if (!configured || authLoading || !userId) return
    const unsubscribeGroups = subscribeToGroupList(userId, () => { void loadDashboard(true) })
    const unsubscribePersonal = snapshot.personalReady ? subscribeToPersonalTransactions(userId, () => { void loadDashboard(true) }) : () => undefined
    return () => { unsubscribeGroups(); unsubscribePersonal() }
  }, [authLoading, configured, loadDashboard, snapshot.personalReady, userId])

  const monthLabel = useMemo(() => periodLabel(monthKey), [monthKey])
  const recentItems = snapshot.items.slice(0, 3)

  function openNew(type: PersonalTransactionType) {
    if (!snapshot.personalReady) return
    setTransactionType(type)
    setEditingTransaction(null)
    setSaveError(null)
    setTransactionOpen(true)
  }

  function selectItem(item: PersonalLedgerItem) {
    if (item.editable) {
      const transaction = snapshot.transactions.find((entry) => entry.id === item.sourceId) ?? null
      if (!transaction) return
      setTransactionType(transaction.type)
      setEditingTransaction(transaction)
      setSaveError(null)
      setTransactionOpen(true)
      return
    }
    setSelectedGroupItem(item)
  }

  async function saveTransaction(input: PersonalTransactionInput) {
    if (!userId || !configured) return
    setSaving(true)
    setSaveError(null)
    try {
      if (editingTransaction) await updatePersonalTransaction(userId, editingTransaction.id, input)
      else await createPersonalTransaction(userId, input)
      setTransactionOpen(false)
      setEditingTransaction(null)
      if (input.competenceMonth !== monthKey) setMonthKey(input.competenceMonth)
      else await loadDashboard(true)
    } catch (caughtError) {
      setSaveError(dataErrorMessage(caughtError, 'Não foi possível salvar esta movimentação.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState label="Montando sua visão pessoal…" />
  if (error) return <ErrorState title="Não foi possível montar sua visão" description={error} onRetry={() => void loadDashboard()} />

  const balancePositive = snapshot.summary.balance >= 0

  return (
    <div className="space-y-6 pb-2">
      {refreshWarning && <p className="rounded-2xl bg-amber/10 px-4 py-3 text-xs leading-5 text-amber">{refreshWarning}</p>}
      {!snapshot.personalReady && <div className="rounded-2xl border border-amber/20 bg-amber/10 px-4 py-3 text-xs leading-5 text-amber"><strong>Área pessoal preparada.</strong> A migration 010 precisa ser aplicada no Supabase para salvar entradas e saídas próprias. As participações dos grupos continuam privadas.</div>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-ink">Minha vida financeira</p><p className="mt-1 max-w-lg text-xs leading-5 text-muted">Visão pessoal: seus lançamentos e apenas a sua parte nos grupos privados.</p></div>
        <div className="flex items-center gap-2">{!configured && <DemoBadge />}<label className="relative flex h-10 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-xs font-semibold text-ink shadow-card"><CalendarDays size={15} className="text-petrol" /><span className="sr-only">Mês de vigência</span><input type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value)} className="max-w-[8.8rem] bg-transparent outline-none" /></label></div>
      </div>

      <section className="rounded-3xl bg-petrol p-5 text-white shadow-lift sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-medium text-white/65">Resultado em {monthLabel.toLocaleLowerCase('pt-BR')}</p><p className="mt-1.5 text-3xl font-semibold tracking-[-0.04em]">{currency.format(snapshot.summary.balance)}</p><p className="mt-1 text-[11px] text-white/55">Entradas menos despesas pessoais e compartilhadas</p></div>
          <span className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', balancePositive ? 'bg-white/10 text-white' : 'bg-red-100 text-danger')}>{balancePositive ? 'Saldo positivo' : 'Atenção ao saldo'}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
          <div><span className="flex items-center gap-1.5 text-xs text-white/60"><ArrowDownLeft size={15} className="text-emerald-200" /> Entradas</span><p className="mt-1 text-base font-semibold">{currency.format(snapshot.summary.income)}</p><p className="mt-0.5 text-[10px] text-white/50">Rendas lançadas por você</p></div>
          <div><span className="flex items-center gap-1.5 text-xs text-white/60"><ArrowUpRight size={15} className="text-red-200" /> Saídas</span><p className="mt-1 text-base font-semibold">{currency.format(snapshot.summary.totalExpenses)}</p><p className="mt-0.5 text-[10px] text-white/50">Pessoais + sua parte nos grupos</p></div>
        </div>
        <Button fullWidth className="mt-5 bg-[#7C927B] text-white hover:bg-[#6E856D] active:bg-[#617860] disabled:bg-[#B6C3B4]" disabled={!snapshot.personalReady} onClick={() => openNew('income')}><ArrowDownLeft size={16} /> Entrada</Button>
      </section>

      <Surface className="overflow-hidden">
        <div className="border-b border-line px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Visão total</p><h2 className="mt-1 text-lg font-semibold text-ink">Resumo do mês</h2></div>
        <dl className="divide-y divide-line px-5">
          <div className="flex items-center justify-between gap-4 py-3.5"><dt className="flex items-center gap-2 text-sm text-muted"><Scale size={16} className="text-petrol" /> Resultado do mês</dt><dd className={cn('text-sm font-semibold', balancePositive ? 'text-positive' : 'text-danger')}>{currency.format(snapshot.summary.balance)}</dd></div>
          <div className="flex items-center justify-between gap-4 py-3.5"><dt className="flex items-center gap-2 text-sm text-muted"><ArrowDownLeft size={16} className="text-positive" /> Receitas</dt><dd className="text-sm font-semibold text-ink">{currency.format(snapshot.summary.income)}</dd></div>
          <div className="flex items-center justify-between gap-4 py-3.5"><dt className="flex items-center gap-2 text-sm text-muted"><WalletCards size={16} className="text-danger" /> Despesas pessoais</dt><dd className="text-sm font-semibold text-ink">{currency.format(snapshot.summary.personalExpenses)}</dd></div>
          <div className="flex items-center justify-between gap-4 py-3.5"><dt className="flex items-center gap-2 text-sm text-muted"><UsersRound size={16} className="text-amber" /> Minha parte nos grupos</dt><dd className="text-sm font-semibold text-ink">{currency.format(snapshot.summary.groupExpenses)}</dd></div>
        </dl>
      </Surface>

      <Surface className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Categorias</p><h2 className="mt-1 text-lg font-semibold text-ink">Para onde foi meu dinheiro</h2><p className="mt-1 text-xs leading-5 text-muted">Inclui lançamentos pessoais e sua parte nas despesas fixas e variáveis dos grupos.</p></div><button type="button" onClick={() => setDetailsOpen(true)} className="shrink-0 text-xs font-semibold text-petrol">Ver detalhes completos</button></div>
        <div className="mt-5"><PersonalCategoryChart categories={snapshot.categories} total={snapshot.summary.totalExpenses} /></div>
      </Surface>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Movimentações</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Últimos lançamentos</h2></div><button type="button" onClick={() => setDetailsOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-petrol">Ver todos <ChevronRight size={15} /></button></div>
        {recentItems.length === 0 ? <EmptyState icon={ReceiptText} title="Nenhum lançamento neste mês" description="Adicione uma entrada ou saída pessoal. Suas participações nos grupos também aparecerão aqui." actionLabel={snapshot.personalReady ? 'Adicionar movimentação' : undefined} onAction={snapshot.personalReady ? () => openNew('expense') : undefined} /> : <Surface className="divide-y divide-line overflow-hidden">{recentItems.map((item) => <button key={item.id} type="button" onClick={() => selectItem(item)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-canvas sm:px-5"><span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', item.type === 'income' ? 'bg-emerald-50 text-positive' : 'bg-red-50 text-danger')}>{item.type === 'income' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{item.description}</span><span className="mt-1 block truncate text-xs text-muted">{item.category} · {shortDate.format(new Date(`${item.occurredOn}T12:00:00`))}{item.groupName ? ` · ${item.groupName}` : ''}</span></span><span className={cn('text-sm font-semibold', item.type === 'income' ? 'text-positive' : 'text-danger')}>{item.type === 'income' ? '+' : '−'} {currency.format(item.amount)}</span><ChevronRight size={16} className="text-muted" /></button>)}</Surface>}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Acesso privado</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Meus grupos</h2></div><Link to="/app/grupos" className="flex items-center gap-1 text-xs font-semibold text-petrol">Ver todos <ChevronRight size={15} /></Link></div>
        {groups.length === 0 ? <EmptyState icon={UsersRound} title="Nenhum grupo por enquanto" description="Crie um grupo ou aceite um convite para começar." /> : <Surface className="divide-y divide-line overflow-hidden">{groups.slice(0, 3).map((group) => {
          const Icon = group.type === 'house_split' ? UsersRound : Landmark
          return <Link key={group.id} to={`/app/grupos/${group.id}`} className="flex items-center gap-3 p-4 transition hover:bg-canvas sm:px-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sage text-petrol"><Icon size={19} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{group.name}</span><span className="mt-1 block text-xs text-muted">{groupTypeLabel[group.type]} · {groupValueLabel(group.type)} {currency.format(group.myValue)}</span></span><ChevronRight size={17} className="text-muted" /></Link>
        })}</Surface>}
      </section>

      <PersonalFinanceDetailSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} monthLabel={monthLabel} items={snapshot.items} summary={snapshot.summary} onNew={openNew} onSelect={selectItem} />
      <PersonalTransactionModal open={transactionOpen} onClose={() => setTransactionOpen(false)} defaultMonth={monthKey} defaultType={transactionType} transaction={editingTransaction} busy={saving} error={saveError} onSave={saveTransaction} />

      <Modal open={Boolean(selectedGroupItem)} onClose={() => setSelectedGroupItem(null)} title="Despesa compartilhada" description="Este valor vem de um grupo privado e representa somente a sua participação.">
        {selectedGroupItem && <div className="space-y-4"><div className="rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{expenseTypeLabel(selectedGroupItem.expenseType)}</p><p className="mt-2 text-lg font-semibold text-ink">{selectedGroupItem.description}</p><p className="mt-1 text-sm text-muted">{selectedGroupItem.groupName}</p>{selectedGroupItem.installment && <p className="mt-3 text-xs font-semibold text-petrol">Parcela {selectedGroupItem.installment.currentInstallment} de {selectedGroupItem.installment.totalInstallments} · {selectedGroupItem.installment.paidInstallments} pagas · {selectedGroupItem.installment.remainingInstallments} restantes</p>}</div><dl className="divide-y divide-line text-sm"><div className="flex justify-between gap-4 py-3"><dt className="text-muted">Minha parte</dt><dd className="font-semibold text-ink">{currency.format(selectedGroupItem.amount)}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted">Categoria</dt><dd className="font-semibold text-ink">{selectedGroupItem.category}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted">Vigência</dt><dd className="font-semibold text-ink">{periodLabel(selectedGroupItem.competenceMonth)}</dd></div></dl>{selectedGroupItem.groupId && <Link to={`/app/grupos/${selectedGroupItem.groupId}`} onClick={() => setSelectedGroupItem(null)} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-petrol px-4 text-sm font-semibold text-white">Abrir despesa no grupo <ChevronRight size={16} /></Link>}<p className="text-center text-[11px] leading-5 text-muted">Para editar uma despesa compartilhada, abra o grupo responsável.</p></div>}
      </Modal>
    </div>
  )
}
