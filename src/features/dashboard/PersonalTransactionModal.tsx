import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { expenseCategories, incomeCategories } from './personalFinanceCategories'
import type { PersonalTransaction, PersonalTransactionInput, PersonalTransactionType } from './types'

interface PersonalTransactionModalProps {
  open: boolean
  onClose: () => void
  defaultMonth: string
  defaultType: PersonalTransactionType
  transaction: PersonalTransaction | null
  busy: boolean
  error: string | null
  onSave: (input: PersonalTransactionInput) => Promise<void>
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function PersonalTransactionModal({ open, onClose, defaultMonth, defaultType, transaction, busy, error, onSave }: PersonalTransactionModalProps) {
  const [type, setType] = useState<PersonalTransactionType>(defaultType)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [occurredOn, setOccurredOn] = useState(today())
  const [competenceMonth, setCompetenceMonth] = useState(defaultMonth)
  const [notes, setNotes] = useState('')
  const definitions = useMemo(() => type === 'income' ? incomeCategories : expenseCategories, [type])

  useEffect(() => {
    if (!open) return
    const nextType = transaction?.type ?? defaultType
    const nextDefinitions = nextType === 'income' ? incomeCategories : expenseCategories
    setType(nextType)
    setDescription(transaction?.description ?? '')
    setAmount(transaction ? String(transaction.amount) : '')
    setCategory(transaction?.category ?? nextDefinitions[0].label)
    setOccurredOn(transaction?.occurredOn ?? today())
    setCompetenceMonth(transaction?.competenceMonth ?? defaultMonth)
    setNotes(transaction?.notes ?? '')
  }, [defaultMonth, defaultType, open, transaction])

  function changeType(nextType: PersonalTransactionType) {
    setType(nextType)
    setCategory((nextType === 'income' ? incomeCategories : expenseCategories)[0].label)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsedAmount = Number(amount.replace(',', '.'))
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    await onSave({ type, description: description.trim(), amount: parsedAmount, category, occurredOn, competenceMonth, notes: notes.trim() || null })
  }

  return (
    <Modal open={open} onClose={onClose} title={transaction ? 'Editar movimentação' : 'Nova movimentação'} description="O lançamento fica privado e visível somente na sua conta.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-1">
          <button type="button" onClick={() => changeType('income')} className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${type === 'income' ? 'bg-[#6FAF91] text-white shadow-card' : 'text-muted'}`}>Entrada</button>
          <button type="button" onClick={() => changeType('expense')} className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${type === 'expense' ? 'bg-[#D66F74] text-white shadow-card' : 'text-muted'}`}>Saída</button>
        </div>
        <label className="block text-xs font-semibold text-muted">Descrição<input className="field mt-2" value={description} maxLength={180} onChange={(event) => setDescription(event.target.value)} placeholder={type === 'income' ? 'Ex.: Salário' : 'Ex.: Farmácia'} required /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-muted">Valor<input className="field mt-2" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" required /></label>
          <label className="block text-xs font-semibold text-muted">Categoria<select className="field mt-2" value={category} onChange={(event) => setCategory(event.target.value)}>{definitions.map((item) => <option key={item.key} value={item.label}>{item.label}</option>)}</select></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-muted">Data<input type="date" className="field mt-2" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} required /></label>
          <label className="block text-xs font-semibold text-muted">Mês de vigência<input type="month" className="field mt-2" value={competenceMonth} onChange={(event) => setCompetenceMonth(event.target.value)} required /></label>
        </div>
        <label className="block text-xs font-semibold text-muted">Observação<textarea className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-petrol focus:ring-2 focus:ring-sage" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" /></label>
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs leading-5 text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !description.trim() || Number(amount.replace(',', '.')) <= 0}>{busy ? 'Salvando…' : 'Salvar'}</Button></div>
      </form>
    </Modal>
  )
}
