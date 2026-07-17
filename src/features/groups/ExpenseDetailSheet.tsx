import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, FileImage, Pencil, ReceiptText, UserRound, XCircle } from 'lucide-react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { currency } from '../../lib/utils/format'
import { cancelExpense, getReceiptSignedUrl, markExpensePaid, updateExpenseDetails } from './groupService'
import type { ExpenseType, GroupExpenseSummary } from './types'

const typeLabels: Record<ExpenseType, string> = {
  fixed: 'Fixa',
  variable: 'Variável',
  one_time: 'Avulsa',
  installment: 'Parcelamento',
}

const statusLabels: Record<GroupExpenseSummary['status'], string> = {
  open: 'Em aberto',
  paid: 'Paga',
  overdue: 'Vencida',
  review: 'Em revisão',
  cancelled: 'Cancelada',
}

function dateLabel(value: string | null) {
  if (!value) return 'Não informada'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}

interface ExpenseDetailSheetProps {
  expense: GroupExpenseSummary | null
  configured: boolean
  onClose: () => void
}

export function ExpenseDetailSheet({ expense, configured, onClose }: ExpenseDetailSheetProps) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', category: '', type: 'variable' as ExpenseType, purchaseDate: '', dueDate: '' })

  useEffect(() => {
    if (!expense) return
    setEditing(false)
    setError(null)
    setReceiptUrl(null)
    setForm({
      title: expense.title,
      category: expense.category,
      type: expense.type,
      purchaseDate: expense.purchaseDate,
      dueDate: expense.dueDate ?? '',
    })
    if (configured && expense.receipt) {
      void getReceiptSignedUrl(expense.receipt.storagePath).then(setReceiptUrl).catch(() => setReceiptUrl(null))
    }
  }, [configured, expense])

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
      onClose()
    } catch {
      setError('Não foi possível concluir a ação. Confira os dados e tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (!expense) return null

  return (
    <BottomSheet open onClose={onClose} title={expense.title} description={`${typeLabels[expense.type]} · ${statusLabels[expense.status]}`}>
      {editing ? (
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-ink">Título<input className="mt-2 h-12 w-full rounded-2xl border border-line px-4 text-sm" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-ink">Categoria<input className="mt-2 h-12 w-full rounded-2xl border border-line px-4 text-sm" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
            <label className="block text-xs font-semibold text-ink">Tipo<select className="mt-2 h-12 w-full rounded-2xl border border-line bg-white px-3 text-sm" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ExpenseType })}><option value="fixed">Fixa</option><option value="variable">Variável</option><option value="one_time">Avulsa</option><option value="installment">Parcelamento</option></select></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-ink">Compra<input type="date" className="mt-2 h-12 w-full rounded-2xl border border-line px-3 text-sm" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} /></label>
            <label className="block text-xs font-semibold text-ink">Vencimento<input type="date" className="mt-2 h-12 w-full rounded-2xl border border-line px-3 text-sm" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
          </div>
          <div className="rounded-2xl bg-canvas p-4"><p className="text-xs text-muted">Valor total</p><p className="mt-1 font-semibold text-ink">{currency.format(expense.amount)}</p><p className="mt-2 text-xs leading-5 text-muted">O valor permanece protegido para não desalinhar a divisão entre participantes.</p></div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-3"><Button variant="secondary" fullWidth disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button><Button fullWidth disabled={busy || !form.title.trim() || !form.category.trim() || !form.purchaseDate} onClick={() => run(() => updateExpenseDetails(expense.id, { ...form, amount: expense.amount, dueDate: form.dueDate || null }))}>{busy ? 'Salvando…' : 'Salvar'}</Button></div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-3xl bg-petrol p-5 text-white"><p className="text-xs text-white/60">Valor total</p><p className="mt-2 text-3xl font-semibold tracking-tight">{currency.format(expense.amount)}</p><p className="mt-2 text-xs text-white/65">{expense.category}</p></div>
          <div className="grid grid-cols-2 gap-3">
            <Info icon={CalendarDays} label="Compra" value={dateLabel(expense.purchaseDate)} />
            <Info icon={CalendarDays} label="Vencimento" value={dateLabel(expense.dueDate)} />
            <Info icon={UserRound} label="Quem pagou" value={expense.paidBy} />
            <Info icon={ReceiptText} label="Status" value={statusLabels[expense.status]} />
          </div>
          <section><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Participantes</p><div className="mt-2 divide-y divide-line rounded-2xl border border-line">{expense.participants.filter((item) => item.included).length === 0 ? <p className="p-4 text-sm text-muted">Nenhuma divisão registrada.</p> : expense.participants.filter((item) => item.included).map((participant) => <div key={participant.userId} className="flex items-center justify-between gap-3 p-4 text-sm"><span className="font-medium text-ink">{participant.displayName}</span><span className="font-semibold text-ink">{currency.format(participant.shareAmount)}</span></div>)}</div></section>
          {expense.notes && <section className="rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold text-muted">Observações</p><p className="mt-2 text-sm leading-6 text-ink">{expense.notes}</p></section>}
          <section><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Nota salva</p>{expense.receipt ? receiptUrl ? <img src={receiptUrl} alt={`Nota de ${expense.title}`} className="mt-2 max-h-64 w-full rounded-2xl border border-line object-contain" /> : <div className="mt-2 flex items-center gap-3 rounded-2xl border border-line p-4 text-sm text-muted"><FileImage size={18} /> Imagem protegida indisponível no momento.</div> : <div className="mt-2 flex items-center gap-3 rounded-2xl border border-line p-4 text-sm text-muted"><FileImage size={18} /> Nenhuma foto vinculada.</div>}</section>
          {error && <p className="text-xs text-danger">{error}</p>}
          {configured && expense.status !== 'cancelled' && <div className="grid gap-2 sm:grid-cols-3"><Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} /> Editar</Button>{expense.status !== 'paid' && expense.status !== 'review' && <Button variant="secondary" disabled={busy} onClick={() => run(() => markExpensePaid(expense.id))}><CheckCircle2 size={16} /> Marcar paga</Button>}<Button variant="danger" disabled={busy} onClick={() => run(() => cancelExpense(expense.id))}><XCircle size={16} /> Cancelar</Button></div>}
        </div>
      )}
    </BottomSheet>
  )
}

function Info({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="rounded-2xl bg-canvas p-4"><Icon size={16} className="text-petrol" /><p className="mt-3 text-xs text-muted">{label}</p><p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p></div>
}
