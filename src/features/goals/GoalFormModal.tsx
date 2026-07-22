import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import type { FinancialGoal, GoalInput, GoalPriority } from './types'

interface GoalFormModalProps {
  open: boolean
  goal: FinancialGoal | null
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: GoalInput) => Promise<void>
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function parseMoney(value: string) {
  return Number(value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
}

export function GoalFormModal({ open, goal, busy, error, onClose, onSubmit }: GoalFormModalProps) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [priority, setPriority] = useState<GoalPriority>('medium')
  const [startDate, setStartDate] = useState(today())
  const [desiredDate, setDesiredDate] = useState('')
  const [monthly, setMonthly] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(goal?.name ?? '')
    setTarget(goal ? goal.targetAmount.toFixed(2).replace('.', ',') : '')
    setPriority(goal?.priority ?? 'medium')
    setStartDate(goal?.startDate ?? today())
    setDesiredDate(goal?.desiredDate ?? '')
    setMonthly(goal ? goal.monthlyAmount.toFixed(2).replace('.', ',') : '')
    setTouched(false)
  }, [goal, open])

  const targetAmount = parseMoney(target)
  const monthlyAmount = parseMoney(monthly)
  const errors = {
    name: !name.trim() ? 'Informe o nome da meta.' : '',
    target: !Number.isFinite(targetAmount) || targetAmount <= 0 ? 'Informe um valor total maior que zero.' : '',
    startDate: !startDate ? 'Informe uma data de início válida.' : '',
    desiredDate: !desiredDate ? 'Informe a data desejada.' : desiredDate < startDate ? 'A data desejada não pode ser anterior ao início.' : '',
    monthly: !Number.isFinite(monthlyAmount) || monthlyAmount <= 0 ? 'Informe um valor mensal maior que zero.' : '',
  }
  const valid = !Object.values(errors).some(Boolean)

  async function submit() {
    setTouched(true)
    if (!valid || busy) return
    await onSubmit({ name: name.trim(), targetAmount, priority, startDate, desiredDate, monthlyAmount })
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={goal ? 'Editar meta' : 'Criar nova meta'} description="Defina o objetivo e um ritmo mensal realista. Você poderá ajustar depois sem perder o histórico.">
      <div className="space-y-4">
        <Field label="Nome da meta" error={touched ? errors.name : ''}><input autoFocus className="field" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Ex.: Celular novo" /></Field>
        <Field label="Valor total" error={touched ? errors.target : ''}><input className="field" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="0,00" /></Field>
        <Field label="Prioridade"><div className="grid grid-cols-3 gap-2">{([['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setPriority(value)} className={`min-h-11 rounded-2xl border px-3 text-sm font-semibold ${priority === value ? 'border-petrol bg-sage text-petrol' : 'border-line text-muted'}`}>{label}</button>)}</div></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Data de início" error={touched ? errors.startDate : ''}><input type="date" className="field" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field><Field label="Data desejada" error={touched ? errors.desiredDate : ''}><input type="date" className="field" value={desiredDate} min={startDate} onChange={(event) => setDesiredDate(event.target.value)} /></Field></div>
        <Field label="Quanto pretende guardar por mês" error={touched ? errors.monthly : ''}><input className="field" inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} placeholder="0,00" /></Field>
        {error && <p className="rounded-2xl bg-red-50 p-3 text-xs leading-5 text-danger">{error}</p>}
        <div className="flex gap-3"><Button variant="secondary" fullWidth disabled={busy} onClick={onClose}>Cancelar</Button><Button fullWidth disabled={busy} onClick={() => void submit()}>{busy ? 'Salvando…' : goal ? 'Salvar alterações' : 'Criar meta'}</Button></div>
      </div>
    </Modal>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-ink">{label}<div className="mt-2">{children}</div>{error && <span className="mt-1 block text-[11px] font-normal text-danger">{error}</span>}</label>
}
