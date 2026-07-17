import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarDays, CheckCircle2, CreditCard, Pencil, ReceiptText, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { currency } from '../../lib/utils/format'
import { approveExpense, cancelExpense, markExpensePaid, updateExpenseDetails } from './groupService'
import type { BalanceInstallmentSummary, BalanceMovementSummary, ExpenseType, GroupExpenseSummary } from './types'

export type BalanceDetailTarget =
  | { kind: 'movement'; item: BalanceMovementSummary }
  | { kind: 'expense'; item: GroupExpenseSummary }
  | { kind: 'installment'; item: BalanceInstallmentSummary }

function dateLabel(value: string | null) {
  if (!value) return 'Não informado'
  return new Date(value.includes('T') ? value : `${value}T12:00:00`).toLocaleDateString('pt-BR')
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  return Number(normalized)
}

const expenseTypeLabel = { fixed: 'Fixa', variable: 'Variável', one_time: 'Avulsa', installment: 'Parcelamento' }
const expenseStatusLabel = { open: 'Em aberto', paid: 'Paga', overdue: 'Vencida', review: 'Em revisão', cancelled: 'Cancelada' }

interface BalanceDetailSheetProps {
  target: BalanceDetailTarget | null
  configured: boolean
  onClose: () => void
}

export function BalanceDetailSheet({ target, configured, onClose }: BalanceDetailSheetProps) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', amount: '', category: '', type: 'variable' as ExpenseType, purchaseDate: '', dueDate: '' })

  useEffect(() => {
    if (!target || target.kind !== 'expense') return
    setEditing(false)
    setError(null)
    setForm({
      title: target.item.title,
      amount: target.item.amount.toFixed(2).replace('.', ','),
      category: target.item.category,
      type: target.item.type,
      purchaseDate: target.item.purchaseDate,
      dueDate: target.item.dueDate ?? '',
    })
  }, [target])

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
      onClose()
    } catch {
      setError('Não foi possível concluir a ação. Verifique o período e suas permissões.')
    } finally {
      setBusy(false)
    }
  }

  if (!target) return null

  if (target.kind === 'movement') {
    const movement = target.item
    const income = movement.type === 'income'
    return (
      <BottomSheet open onClose={onClose} title={movement.description} description={income ? 'Entrada do mês' : 'Saída do mês'}>
        <div className="space-y-5">
          <div className={`rounded-3xl p-5 ${income ? 'bg-sage text-positive' : 'bg-petrol text-white'}`}><span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/60">{income ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</span><p className="mt-5 text-xs opacity-70">Valor</p><p className="mt-1 text-3xl font-semibold tracking-tight">{income ? '+' : '−'} {currency.format(movement.amount)}</p></div>
          <div className="grid grid-cols-2 gap-3"><Info icon={CalendarDays} label="Data" value={dateLabel(movement.movementDate)} /><Info icon={UserRound} label="Pessoa" value={movement.displayName} /></div>
          <div className="rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold text-muted">Observação</p><p className="mt-2 text-sm leading-6 text-ink">{movement.notes || 'Nenhuma observação informada.'}</p></div>
        </div>
      </BottomSheet>
    )
  }

  if (target.kind === 'installment') {
    const installment = target.item
    return (
      <BottomSheet open onClose={onClose} title={installment.title} description="Parcelamento ativo">
        <div className="space-y-5">
          <div className="rounded-3xl bg-petrol p-5 text-white"><p className="text-xs text-white/60">Valor da parcela</p><p className="mt-2 text-3xl font-semibold">{currency.format(installment.installmentAmount)}</p><p className="mt-2 text-xs text-white/65">Total de {currency.format(installment.totalAmount)}</p></div>
          <div className="grid grid-cols-2 gap-3"><Info icon={ReceiptText} label="Parcela atual" value={`${installment.currentInstallment} de ${installment.totalInstallments}`} /><Info icon={ReceiptText} label="Restantes" value={`${installment.remainingInstallments} parcelas`} /><Info icon={CalendarDays} label="Vencimento" value={dateLabel(installment.nextDueDate)} /><Info icon={CreditCard} label="Cartão" value={installment.cardLabel || 'Não informado'} /><Info icon={UserRound} label="Responsável" value={installment.responsibleName} /><Info icon={ReceiptText} label="Status" value={installment.active ? 'Ativo' : 'Encerrado'} /></div>
          {installment.notes && <div className="rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold text-muted">Observação</p><p className="mt-2 text-sm leading-6 text-ink">{installment.notes}</p></div>}
        </div>
      </BottomSheet>
    )
  }

  const expense = target.item
  const parsedAmount = parseMoney(form.amount)

  return (
    <BottomSheet open onClose={() => !busy && onClose()} title={expense.title} description={`${expenseTypeLabel[expense.type]} · ${expenseStatusLabel[expense.status]}`}>
      {editing ? (
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-ink">Título<input className="field mt-2" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="block text-xs font-semibold text-ink">Valor<input className="field mt-2" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-ink">Categoria<input className="field mt-2" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
            <label className="block text-xs font-semibold text-ink">Tipo<select className="field mt-2 bg-white" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ExpenseType })}><option value="fixed">Fixa</option><option value="variable">Variável</option><option value="one_time">Avulsa</option><option value="installment">Parcelamento</option></select></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-ink">Compra<input type="date" className="field mt-2" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} /></label>
            <label className="block text-xs font-semibold text-ink">Vencimento<input type="date" className="field mt-2" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
          </div>
          <div className="rounded-2xl bg-sage p-4 text-xs leading-5 text-petrol">Ao salvar, o movimento relacionado será atualizado na mesma operação e o saldo será recalculado.</div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-3"><Button variant="secondary" fullWidth disabled={busy} onClick={() => setEditing(false)}>Voltar</Button><Button fullWidth disabled={busy || !form.title.trim() || !form.category.trim() || !form.purchaseDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0} onClick={() => run(() => updateExpenseDetails(expense.id, { ...form, amount: parsedAmount, dueDate: form.dueDate || null }))}>{busy ? 'Salvando…' : 'Salvar alterações'}</Button></div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className={`rounded-3xl p-5 ${expense.status === 'review' || expense.status === 'cancelled' ? 'bg-canvas text-ink' : 'bg-petrol text-white'}`}><p className="text-xs opacity-60">{expense.status === 'review' ? 'Valor ainda não descontado' : expense.status === 'cancelled' ? 'Valor cancelado' : 'Valor descontado'}</p><p className="mt-2 text-3xl font-semibold">{currency.format(expense.amount)}</p><p className="mt-2 text-xs opacity-65">{expense.category}</p></div>
          <div className="grid grid-cols-2 gap-3"><Info icon={CalendarDays} label="Data" value={dateLabel(expense.purchaseDate)} /><Info icon={CalendarDays} label="Vencimento" value={dateLabel(expense.dueDate)} /><Info icon={UserRound} label="Responsável" value={expense.paidBy} /><Info icon={ReceiptText} label="Status" value={expenseStatusLabel[expense.status]} /></div>
          {expense.notes && <div className="rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold text-muted">Observação</p><p className="mt-2 text-sm leading-6 text-ink">{expense.notes}</p></div>}
          {error && <p className="text-xs text-danger">{error}</p>}
          {configured && expense.status !== 'cancelled' && <div className="grid gap-2 sm:grid-cols-2"><Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}><Pencil size={16} /> Editar</Button>{expense.status === 'review' ? <Button variant="secondary" disabled={busy} onClick={() => run(() => approveExpense(expense.id))}><ShieldCheck size={16} /> Aprovar</Button> : expense.status !== 'paid' ? <Button variant="secondary" disabled={busy} onClick={() => run(() => markExpensePaid(expense.id))}><CheckCircle2 size={16} /> Marcar paga</Button> : null}<Button variant="danger" disabled={busy} onClick={() => run(() => cancelExpense(expense.id))}><XCircle size={16} /> Cancelar</Button></div>}
        </div>
      )}
    </BottomSheet>
  )
}

function Info({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="rounded-2xl bg-canvas p-4"><Icon size={16} className="text-petrol" /><p className="mt-3 text-xs text-muted">{label}</p><p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p></div>
}
