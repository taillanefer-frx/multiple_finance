import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, ChevronRight, Plus, Target } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateDisplay'
import { Modal } from '../../components/ui/Modal'
import { Surface } from '../../components/ui/Surface'
import { dataErrorMessage } from '../../lib/supabase/errors'
import { currency } from '../../lib/utils/format'
import { useAuth } from '../auth/AuthContext'
import { calculateGoalProgress, monthStart, sortGoals } from './goalCalculations'
import { GoalDetailsSheet } from './GoalDetailsSheet'
import { GoalFormModal } from './GoalFormModal'
import { createGoal, getGoals, recordExtraGoalAmount, recordMonthlyGoalAmount, subscribeToGoals, updateGoal } from './goalService'
import type { FinancialGoal, GoalInput } from './types'

const priorityLabel = { high: 'Alta', medium: 'Média', low: 'Baixa' }
const priorityTone = { high: 'bg-red-50 text-danger', medium: 'bg-amber/10 text-amber', low: 'bg-sage text-petrol' }
const monthYear = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })

export default function GoalsPage() {
  const { configured, loading: authLoading, user } = useAuth()
  const userId = user?.id ?? null
  const request = useRef(0)
  const createRequestId = useRef(crypto.randomUUID())
  const monthlyRequestIds = useRef(new Map<string, string>())
  const [goals, setGoals] = useState<FinancialGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FinancialGoal | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [celebration, setCelebration] = useState(false)
  const selected = goals.find((goal) => goal.id === selectedId) ?? null

  const load = useCallback(async (silent = false) => {
    const current = ++request.current
    if (!silent) setLoading(true)
    setError(null)
    if (authLoading) return
    if (!configured || !userId) {
      setGoals([])
      setLoading(false)
      return
    }
    try {
      const data = sortGoals(await getGoals(userId))
      if (current === request.current) setGoals(data)
    } catch (caughtError) {
      if (current === request.current) setError(dataErrorMessage(caughtError, 'Não foi possível carregar suas metas. A migration 012 pode estar pendente.'))
    } finally {
      if (current === request.current) setLoading(false)
    }
  }, [authLoading, configured, userId])

  useEffect(() => {
    void load()
    return () => { request.current += 1 }
  }, [load])

  useEffect(() => {
    if (!configured || !userId || authLoading) return
    return subscribeToGoals(userId, () => void load(true))
  }, [authLoading, configured, load, userId])

  function openCreate() {
    createRequestId.current = crypto.randomUUID()
    setEditing(null)
    setActionError(null)
    setFormOpen(true)
  }

  function openEdit(goal: FinancialGoal) {
    setEditing(goal)
    setActionError(null)
    setFormOpen(true)
  }

  function monthlyRequestId(goalId: string) {
    const key = `${goalId}:${monthStart()}`
    const current = monthlyRequestIds.current.get(key)
    if (current) return current
    const next = crypto.randomUUID()
    monthlyRequestIds.current.set(key, next)
    return next
  }

  async function save(input: GoalInput) {
    setBusy(true)
    setActionError(null)
    try {
      const result = editing
        ? await updateGoal(editing.id, input)
        : { justCompleted: false, id: await createGoal(input, createRequestId.current) }
      await load(true)
      setFormOpen(false)
      if (result.justCompleted) setCelebration(true)
    } catch (caughtError) {
      setActionError(dataErrorMessage(caughtError, 'Não foi possível salvar a meta.'))
    } finally {
      setBusy(false)
    }
  }

  async function contribute(task: () => Promise<{ justCompleted: boolean }>) {
    setBusy(true)
    setActionError(null)
    try {
      const result = await task()
      await load(true)
      if (result.justCompleted) setCelebration(true)
    } catch (caughtError) {
      setActionError(dataErrorMessage(caughtError, 'Não foi possível registrar esse valor.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Organizando suas metas…" />
  if (error) return <ErrorState title="Não foi possível abrir Metas" description={error} onRetry={() => void load()} />

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight text-ink">Metas</h2><p className="mt-1 text-sm text-muted">Objetivos pessoais organizados por prioridade e prazo.</p></div><Button onClick={openCreate}><Plus size={17} /> Meta</Button></div>
      {goals.length === 0 ? <EmptyState icon={Target} title="Nenhuma meta criada" description="Crie sua primeira meta e acompanhe cada valor guardado." actionLabel="Criar primeira meta" onAction={openCreate} /> : <div className="space-y-3">{goals.map((goal) => <GoalCard key={goal.id} goal={goal} onDetails={() => setSelectedId(goal.id)} />)}</div>}
      <GoalFormModal open={formOpen} goal={editing} busy={busy} error={actionError} onClose={() => setFormOpen(false)} onSubmit={save} />
      <GoalDetailsSheet goal={selected} busy={busy} error={actionError} onClose={() => setSelectedId(null)} onEdit={(goal) => { setSelectedId(null); openEdit(goal) }} onMonthly={(goal) => contribute(() => recordMonthlyGoalAmount(goal, monthlyRequestId(goal.id)))} onExtra={(goal, amount) => contribute(() => recordExtraGoalAmount(goal.id, amount))} />
      <Modal open={celebration} onClose={() => setCelebration(false)} title="VOCÊ CONSEGUIU! 😭🎉" description="Sua meta foi alcançada. Todo o histórico continua guardado."><Button fullWidth onClick={() => setCelebration(false)}><CheckCircle2 size={17} /> Comemorar</Button></Modal>
    </div>
  )
}

function GoalCard({ goal, onDetails }: { goal: FinancialGoal; onDetails: () => void }) {
  const progress = calculateGoalProgress(goal)
  return <Surface className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-base font-semibold text-ink">{goal.name}</h3><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${priorityTone[goal.priority]}`}>Prioridade {priorityLabel[goal.priority]}</span></div><button type="button" onClick={onDetails} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-petrol">Detalhes <ChevronRight size={14} /></button></div><div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-xs text-muted">Guardado</p><p className="mt-1 text-xl font-semibold text-ink">{currency.format(progress.savedAmount)}</p></div><p className="text-sm font-semibold text-petrol">{progress.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-[#6FAF91]" style={{ width: `${progress.percentage}%` }} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted">Meta</p><p className="mt-1 font-semibold text-ink">{currency.format(goal.targetAmount)}</p></div><div><p className="text-muted">Restante</p><p className="mt-1 font-semibold text-ink">{currency.format(progress.remainingAmount)}</p></div><div><p className="flex items-center gap-1 text-muted"><CalendarDays size={13} /> Data desejada</p><p className="mt-1 font-semibold capitalize text-ink">{monthYear.format(new Date(`${goal.desiredDate}T12:00:00`))}</p></div><div><p className="text-muted">Previsão atual</p><p className="mt-1 font-semibold capitalize text-ink">{progress.predictedDate ? monthYear.format(progress.predictedDate) : 'Sem previsão'}</p></div></div></Surface>
}
