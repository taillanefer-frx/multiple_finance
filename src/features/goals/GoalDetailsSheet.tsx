import { useEffect, useState } from 'react'
import { CalendarCheck2, Check, Coins, Pencil, Plus } from 'lucide-react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { currency } from '../../lib/utils/format'
import { calculateGoalProgress } from './goalCalculations'
import type { FinancialGoal } from './types'

const priorityLabel = { high: 'Alta', medium: 'Média', low: 'Baixa' }
const monthYear = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

interface GoalDetailsSheetProps {
  goal: FinancialGoal | null
  busy: boolean
  error: string | null
  onClose: () => void
  onEdit: (goal: FinancialGoal) => void
  onMonthly: (goal: FinancialGoal) => Promise<void>
  onExtra: (goal: FinancialGoal, amount: number) => Promise<void>
}

function dateAtNoon(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`)
}

function parseMoney(value: string) {
  return Number(value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
}

export function GoalDetailsSheet({ goal, busy, error, onClose, onEdit, onMonthly, onExtra }: GoalDetailsSheetProps) {
  const [extra, setExtra] = useState('')
  useEffect(() => setExtra(''), [goal?.id])
  if (!goal) return null
  const progress = calculateGoalProgress(goal)
  const extraAmount = parseMoney(extra)
  const prediction = progress.predictedDate ? monthYear.format(progress.predictedDate) : 'Ainda não existe previsão calculada'

  return (
    <BottomSheet open onClose={() => !busy && onClose()} title={goal.name} description={`Prioridade ${priorityLabel[goal.priority]}`}>
      <div className="space-y-5">
        <section className="rounded-3xl bg-petrol p-5 text-white">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs text-white/65">Dinheiro acumulado</p><p className="mt-1 text-3xl font-semibold">{currency.format(progress.savedAmount)}</p></div><p className="text-xl font-semibold">{progress.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</p></div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#8DD0AF] transition-all" style={{ width: `${progress.percentage}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><span className="text-white/55">Meta</span><p className="mt-1 font-semibold">{currency.format(goal.targetAmount)}</p></div><div><span className="text-white/55">Falta</span><p className="mt-1 font-semibold">{currency.format(progress.remainingAmount)}</p></div></div>
          {progress.exceeded && <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold">Meta superada em {currency.format(progress.savedAmount - goal.targetAmount)} 🎉</p>}
        </section>

        <div className="grid grid-cols-2 gap-3"><Info label="Data de início" value={monthYear.format(dateAtNoon(goal.startDate))} /><Info label="Data desejada" value={monthYear.format(dateAtNoon(goal.desiredDate))} /><Info label="Valor mensal atual" value={currency.format(goal.monthlyAmount)} /><Info label="Previsão atual" value={prediction} /></div>
        {progress.predictionMonths !== null && progress.remainingAmount > 0 && <p className="rounded-2xl bg-sage p-4 text-xs leading-5 text-petrol">Mantendo {currency.format(goal.monthlyAmount)} por mês, a previsão é alcançar em {progress.predictionMonths} {progress.predictionMonths === 1 ? 'mês' : 'meses'}.</p>}

        <Button fullWidth disabled={busy || progress.currentMonthSaved} onClick={() => void onMonthly(goal)}>{progress.currentMonthSaved ? <><Check size={17} /> Valor deste mês guardado</> : busy ? <><CalendarCheck2 size={17} /> Registrando valor…</> : <><CalendarCheck2 size={17} /> Marcar valor do mês como guardado</>}</Button>
        {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs leading-5 text-danger">{error}</p>}

        <section className="rounded-2xl border border-line p-4"><p className="text-sm font-semibold text-ink">Registrar aporte extra</p><div className="mt-3 flex gap-2"><input className="field min-w-0 flex-1" inputMode="decimal" value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="0,00" /><Button disabled={busy || !Number.isFinite(extraAmount) || extraAmount <= 0} onClick={() => void onExtra(goal, extraAmount).then(() => setExtra(''))}><Plus size={16} /> Aportar</Button></div></section>

        <section><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Valores guardados</p>{goal.contributions.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhum valor registrado.</p> : <div className="mt-2 divide-y divide-line rounded-2xl border border-line">{[...goal.contributions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-3.5 text-sm"><span className="text-muted">{new Date(`${item.contributedOn}T12:00:00`).toLocaleDateString('pt-BR')} · {item.source === 'monthly' ? 'Valor mensal' : 'Aporte extra'}</span><span className="font-semibold text-positive">+ {currency.format(item.amount)}</span></div>)}</div>}</section>

        <section><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Histórico do valor mensal</p>{goal.monthlyAmountHistory.length === 0 ? <p className="mt-2 text-sm text-muted">O valor mensal ainda não foi alterado.</p> : <div className="mt-2 divide-y divide-line rounded-2xl border border-line">{[...goal.monthlyAmountHistory].sort((a, b) => b.changedAt.localeCompare(a.changedAt)).map((item) => <p key={item.id} className="p-3.5 text-sm text-ink">{new Date(item.changedAt).toLocaleDateString('pt-BR')} · {currency.format(item.previousAmount)} → {currency.format(item.newAmount)}</p>)}</div>}</section>

        <Button variant="secondary" fullWidth disabled={busy} onClick={() => onEdit(goal)}><Pencil size={16} /> Editar meta</Button>
      </div>
    </BottomSheet>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-canvas p-4"><Coins size={16} className="text-petrol" /><p className="mt-3 text-[11px] text-muted">{label}</p><p className="mt-1 text-sm font-semibold capitalize text-ink">{value}</p></div>
}
