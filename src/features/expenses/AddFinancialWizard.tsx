import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowLeft, Check, CheckCircle2, ChevronRight, CreditCard, FilePlus2, Landmark, ReceiptText, ShoppingBasket, Sparkles, X } from 'lucide-react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { currency } from '../../lib/utils/format'
import { useAuth } from '../auth/AuthContext'
import type { ExpenseStatus, ExpenseType, GroupDetails } from '../groups/types'
import { addExpense, addIncome, addInstallment } from './addService'

type AddKind = 'income' | 'manual' | 'fixed' | 'variable' | 'one_time' | 'installment'
type Stage = 'type' | 'details' | 'responsible' | 'participants' | 'settings' | 'review' | 'success'
type ParticipantMode = 'all' | 'except' | 'manual'

const categories = ['Aluguel', 'Internet', 'Luz', 'Mercado', 'Gás', 'Itens de casa', 'Limpeza', 'Manutenção', 'Comida', 'Transporte', 'Assinatura', 'Saúde', 'Lazer', 'Cartão', 'Outros']
const kindLabels: Record<AddKind, string> = { income: 'Entrada de dinheiro', manual: 'Despesa manual', fixed: 'Despesa fixa', variable: 'Despesa variável', one_time: 'Gasto avulso', installment: 'Parcelamento' }
const kindOptions = [
  { kind: 'income' as const, icon: ArrowDownLeft, note: 'Salário, Pix ou reembolso', tone: 'bg-emerald-50 text-positive' },
  { kind: 'manual' as const, icon: FilePlus2, note: 'Registre um gasto comum', tone: 'bg-sage text-petrol' },
  { kind: 'fixed' as const, icon: Landmark, note: 'Conta que pode se repetir', tone: 'bg-blue-50 text-blue-700' },
  { kind: 'variable' as const, icon: ShoppingBasket, note: 'Valor que muda no mês', tone: 'bg-amber-50 text-amber' },
  { kind: 'one_time' as const, icon: ReceiptText, note: 'Compra ou gasto pontual', tone: 'bg-orange-50 text-orange-700' },
  { kind: 'installment' as const, icon: CreditCard, note: 'Compra dividida em parcelas', tone: 'bg-violet-50 text-violet-700' },
]

function periodDate(year: number, month: number) {
  const today = new Date()
  const day = Math.min(today.getDate(), new Date(year, month, 0).getDate())
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  return Number(normalized)
}

function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()

  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('already exists')) return 'Já existe um lançamento igual neste período. Revise antes de tentar novamente.'
  if (message.includes('closed period')) return 'Este mês está fechado e não aceita novos lançamentos.'
  if (message.includes('participant')) return 'Escolha pelo menos um participante ativo.'
  if (message.includes('admin') || message.includes('permission') || message.includes('membership')) return 'Você não tem permissão para lançar neste saldo.'
  return 'Não foi possível salvar. Seus dados foram mantidos para você tentar novamente.'
}

export function AddFinancialWizard({ group, configured, onClose }: { group: GroupDetails; configured: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const currentMember = group.members.find((member) => member.isCurrentUser)
  const initialDate = periodDate(group.selectedYear, group.selectedMonth)
  const [kind, setKind] = useState<AddKind | null>(null)
  const [stage, setStage] = useState<Stage>('type')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Outros')
  const [purchaseDate, setPurchaseDate] = useState(initialDate)
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [responsibleId, setResponsibleId] = useState(currentMember?.userId || user?.id || '')
  const [participantMode, setParticipantMode] = useState<ParticipantMode>('all')
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [manualIds, setManualIds] = useState<string[]>(group.members.map((member) => member.userId))
  const [status, setStatus] = useState<Extract<ExpenseStatus, 'open' | 'paid' | 'review'>>('open')
  const [notifyGroup, setNotifyGroup] = useState(false)
  const [repeatMonthly, setRepeatMonthly] = useState(true)
  const [notifyBeforeDue, setNotifyBeforeDue] = useState(false)
  const [markFixed, setMarkFixed] = useState(false)
  const [installmentCount, setInstallmentCount] = useState('2')
  const [firstDueDate, setFirstDueDate] = useState(initialDate)
  const [cardLabel, setCardLabel] = useState('')
  const [shared, setShared] = useState(group.type === 'house_split')
  const [busy, setBusy] = useState(false)
  const savingRef = useRef(false)
  const [installmentRequestId] = useState(createIdempotencyKey)
  const [error, setError] = useState<string | null>(null)
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null)

  const needsParticipants = group.type === 'house_split' || (kind === 'installment' && shared)
  const stages = useMemo<Stage[]>(() => {
    if (!kind) return ['type']
    if (kind === 'income') return ['type', 'details', 'responsible', 'review']
    return ['type', 'details', 'responsible', ...(needsParticipants ? ['participants' as const] : []), 'settings', 'review']
  }, [kind, needsParticipants])
  const currentStageIndex = Math.max(stages.indexOf(stage), 0)
  const participantIds = useMemo(() => {
    if (!needsParticipants) return []
    if (participantMode === 'all') return group.members.map((member) => member.userId)
    if (participantMode === 'except') return group.members.filter((member) => !excludedIds.includes(member.userId)).map((member) => member.userId)
    return manualIds
  }, [excludedIds, group.members, manualIds, needsParticipants, participantMode])
  const installmentAmount = Number.isFinite(parseMoney(amount)) && Number(installmentCount) > 0 ? parseMoney(amount) / Number(installmentCount) : 0
  const responsible = group.members.find((member) => member.userId === responsibleId)

  useEffect(() => {
    if (stage !== 'success') return
    const timer = setTimeout(onClose, 1100)
    return () => clearTimeout(timer)
  }, [onClose, stage])

  function chooseKind(nextKind: AddKind) {
    setKind(nextKind)
    setStage('details')
    setInvalidMessage(null)
    if (nextKind === 'fixed') setDueDate(initialDate)
  }

  function validateCurrentStage() {
    const value = parseMoney(amount)
    if (stage === 'details') {
      if (!Number.isFinite(value) || value <= 0) return 'Informe um valor maior que zero.'
      if (!title.trim()) return kind === 'income' ? 'Informe a origem da entrada.' : 'Informe o título do lançamento.'
      if (kind === 'installment' && (!Number.isInteger(Number(installmentCount)) || Number(installmentCount) < 2)) return 'Informe pelo menos duas parcelas.'
      if (kind === 'installment' && !firstDueDate) return 'Informe a primeira data de vencimento.'
      if (kind === 'fixed' && !dueDate) return 'Informe o vencimento desta despesa fixa.'
      if (kind !== 'income' && kind !== 'installment' && !purchaseDate) return 'Informe a data da compra.'
    }
    if (stage === 'responsible' && !responsibleId) return 'Escolha uma pessoa responsável.'
    if (stage === 'participants' && participantIds.length === 0) return 'Escolha pelo menos um participante.'
    return null
  }

  function next() {
    const message = validateCurrentStage()
    setInvalidMessage(message)
    if (message) return
    const index = stages.indexOf(stage)
    if (index >= 0 && index < stages.length - 1) setStage(stages[index + 1])
  }

  function back() {
    setInvalidMessage(null)
    setError(null)
    const index = stages.indexOf(stage)
    if (index > 0) setStage(stages[index - 1])
  }

  function toggleId(list: string[], id: string, setter: (value: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  }

  async function save() {
    if (!kind || savingRef.current || !configured) return
    savingRef.current = true
    setBusy(true)
    setError(null)
    try {
      if (kind === 'income') {
        await addIncome({ groupId: group.id, month: group.selectedMonth, year: group.selectedYear, amount: parseMoney(amount), userId: responsibleId, origin: title, movementDate: purchaseDate, notes: notes.trim() || null })
      } else if (kind === 'installment') {
        await addInstallment({ groupId: group.id, month: group.selectedMonth, year: group.selectedYear, title, totalAmount: parseMoney(amount), totalInstallments: Number(installmentCount), firstDueDate, cardLabel: cardLabel.trim() || null, responsibleUserId: responsibleId, shared, participantIds, notes: notes.trim() || null, notifyGroup, notifyBeforeDue, idempotencyKey: installmentRequestId })
      } else {
        const expenseType: Exclude<ExpenseType, 'installment'> = kind === 'fixed' || markFixed ? 'fixed' : kind === 'variable' ? 'variable' : 'one_time'
        await addExpense({ groupId: group.id, month: group.selectedMonth, year: group.selectedYear, title, amount: parseMoney(amount), category, expenseType, purchaseDate, dueDate: dueDate || null, responsibleUserId: responsibleId, status, notifyGroup, notes: notes.trim() || null, participantIds, repeatMonthly: expenseType === 'fixed' && repeatMonthly, notifyBeforeDue })
      }
      setStage('success')
    } catch (caughtError) {
      setError(friendlyError(caughtError))
    } finally {
      savingRef.current = false
      setBusy(false)
    }
  }

  const sheetTitle = stage === 'type' ? 'Adicionar' : stage === 'success' ? 'Tudo certo' : kind ? kindLabels[kind] : 'Adicionar'
  return (
    <BottomSheet open onClose={() => !busy && onClose()} title={sheetTitle} description={stage === 'type' ? `${group.name} · ${group.type === 'house_split' ? 'Divisão de casa' : 'Controle de saldo'}` : stage !== 'success' ? `Etapa ${currentStageIndex} de ${stages.length - 1}` : undefined}>
      {stage !== 'type' && stage !== 'success' && <div className="mb-5 flex gap-1.5">{stages.slice(1).map((item, index) => <span key={item} className={`h-1.5 flex-1 rounded-full ${index <= currentStageIndex - 1 ? 'bg-petrol' : 'bg-line'}`} />)}</div>}
      {stage === 'type' && <div className="grid gap-2 sm:grid-cols-2">{kindOptions.filter((option) => option.kind !== 'income' || group.type === 'balance_control').map((option) => <button key={option.kind} onClick={() => chooseKind(option.kind)} className="flex items-center gap-3 rounded-2xl border border-line p-3 text-left transition hover:border-petrol/20 hover:bg-canvas"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${option.tone}`}><option.icon size={20} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{kindLabels[option.kind]}</span><span className="mt-0.5 block text-xs text-muted">{option.note}</span></span><ChevronRight size={16} className="text-muted" /></button>)}</div>}

      {stage === 'details' && kind && <div className="space-y-4">
        <Field label={kind === 'income' ? 'Origem' : kind === 'installment' ? 'Nome da compra' : 'Título'}><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} className="field" placeholder={kind === 'income' ? 'Ex.: salário, Pix recebido' : 'Ex.: mercado da semana'} /></Field>
        <Field label={kind === 'installment' ? 'Valor total' : 'Valor'}><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="field" placeholder="0,00" /></Field>
        {kind === 'installment' ? <><div className="grid grid-cols-2 gap-3"><Field label="Quantidade de parcelas"><input value={installmentCount} onChange={(event) => setInstallmentCount(event.target.value)} inputMode="numeric" className="field" /></Field><div className="rounded-2xl bg-canvas p-4"><p className="text-xs text-muted">Valor da parcela</p><p className="mt-2 text-sm font-semibold text-ink">{currency.format(installmentAmount || 0)}</p></div></div><Field label="Primeiro vencimento"><input type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} className="field" /></Field><Field label="Cartão ou apelido"><input value={cardLabel} onChange={(event) => setCardLabel(event.target.value)} maxLength={80} className="field" placeholder="Ex.: cartão principal" /></Field>{group.type === 'balance_control' ? <Toggle checked={shared} onChange={setShared} title="Parcelamento compartilhado" note="A divisão fica como informação secundária" /> : <div className="rounded-2xl bg-sage p-4 text-sm text-petrol"><p className="font-semibold">Parcelamento compartilhado</p><p className="mt-1 text-xs leading-5">Escolha os participantes na próxima etapa.</p></div>}</> : kind !== 'income' ? <><Field label="Categoria"><select value={category} onChange={(event) => setCategory(event.target.value)} className="field bg-white">{categories.map((item) => <option key={item}>{item}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Data da compra"><input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} className="field" /></Field><Field label={kind === 'fixed' ? 'Vencimento' : 'Vencimento opcional'}><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="field" /></Field></div></> : <Field label="Data da entrada"><input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} className="field" /></Field>}
        <Field label="Observação opcional"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={kind === 'income' || kind === 'installment' ? 2000 : 4000} rows={3} className="w-full resize-none rounded-2xl border border-line p-4 text-sm" placeholder="Adicione um contexto, se desejar" /></Field>
      </div>}

      {stage === 'responsible' && <div className="space-y-2"><p className="mb-4 text-sm leading-6 text-muted">{group.type === 'house_split' ? 'Quem pagou este lançamento?' : kind === 'income' ? 'Em qual saldo esta entrada será adicionada?' : 'De qual saldo este valor será descontado?'}</p>{group.members.map((member) => { const allowed = group.type === 'house_split' || group.currentUserRole === 'admin' || member.isCurrentUser; return <button key={member.userId} disabled={!allowed} onClick={() => setResponsibleId(member.userId)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${responsibleId === member.userId ? 'border-petrol bg-sage/60' : 'border-line'} disabled:opacity-45`}><span className="grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-semibold text-petrol">{member.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{member.isCurrentUser ? 'Eu' : member.displayName}</span><span className="mt-0.5 block text-xs text-muted">{allowed ? member.role === 'admin' ? 'Administrador' : 'Membro' : 'A própria pessoa precisa lançar'}</span></span>{responsibleId === member.userId && <Check size={18} className="text-petrol" />}</button>})}</div>}

      {stage === 'participants' && <div><div className="grid grid-cols-3 gap-2">{(['all', 'except', 'manual'] as ParticipantMode[]).map((mode) => <button key={mode} onClick={() => setParticipantMode(mode)} className={`rounded-2xl border px-2 py-3 text-xs font-semibold ${participantMode === mode ? 'border-petrol bg-sage text-petrol' : 'border-line text-muted'}`}>{mode === 'all' ? 'Todos' : mode === 'except' ? 'Todos, exceto' : 'Escolher'}</button>)}</div><div className="mt-4 divide-y divide-line rounded-2xl border border-line">{group.members.map((member) => { const checked = participantMode === 'all' || (participantMode === 'except' ? !excludedIds.includes(member.userId) : manualIds.includes(member.userId)); return <button key={member.userId} disabled={participantMode === 'all'} onClick={() => participantMode === 'except' ? toggleId(excludedIds, member.userId, setExcludedIds) : toggleId(manualIds, member.userId, setManualIds)} className="flex w-full items-center gap-3 p-4 text-left disabled:cursor-default"><span className={`grid h-6 w-6 place-items-center rounded-lg border ${checked ? 'border-petrol bg-petrol text-white' : 'border-line'}`}>{checked && <Check size={14} />}</span><span className="text-sm font-medium text-ink">{member.isCurrentUser ? 'Eu' : member.displayName}</span></button>})}</div><div className="mt-4 rounded-2xl bg-canvas p-4 text-sm"><div className="flex justify-between text-muted"><span>{participantIds.length} participantes</span><span>Por pessoa</span></div><p className="mt-2 text-right font-semibold text-ink">{participantIds.length ? currency.format((kind === 'installment' ? installmentAmount : parseMoney(amount)) / participantIds.length) : '—'}</p><p className="mt-2 text-xs leading-5 text-muted">O servidor distribui os centavos restantes para manter a soma exatamente igual ao total.</p></div></div>}

      {stage === 'settings' && kind && <div className="space-y-3">{kind !== 'installment' && <div><p className="mb-2 text-xs font-semibold text-ink">Status inicial</p><div className="grid grid-cols-3 gap-2">{([['open', 'Aberta'], ['paid', 'Paga'], ['review', 'Em revisão']] as const).map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-2xl border px-2 py-3 text-xs font-semibold ${status === value ? 'border-petrol bg-sage text-petrol' : 'border-line text-muted'}`}>{label}</button>)}</div></div>}{kind === 'manual' && <Toggle checked={markFixed} onChange={setMarkFixed} title="Marcar como fixa" note="Trata este lançamento como compromisso fixo" />}{(kind === 'fixed' || markFixed) && <Toggle checked={repeatMonthly} onChange={setRepeatMonthly} title="Repetir todo mês" note="Cria uma regra recorrente para os próximos períodos" />}{(kind === 'fixed' || kind === 'installment' || markFixed) && <Toggle checked={notifyBeforeDue} onChange={setNotifyBeforeDue} title="Notificar antes do vencimento" note="Deixa o lembrete preparado na regra" />}<Toggle checked={notifyGroup} onChange={setNotifyGroup} title="Notificar o grupo" note="Cria um aviso interno para os membros ativos" /></div>}

      {stage === 'review' && kind && <div className="space-y-4"><div className="rounded-3xl bg-petrol p-5 text-white"><p className="text-xs text-white/60">{kindLabels[kind]}</p><p className="mt-2 text-2xl font-semibold">{kind === 'income' ? '+' : '−'} {currency.format(kind === 'installment' ? installmentAmount : parseMoney(amount))}</p>{kind === 'installment' && <p className="mt-2 text-xs text-white/65">{installmentCount} parcelas · total {currency.format(parseMoney(amount))}</p>}</div><div className="divide-y divide-line rounded-2xl border border-line"><ReviewRow label={kind === 'income' ? 'Origem' : 'Título'} value={title} />{kind !== 'income' && kind !== 'installment' && <ReviewRow label="Categoria" value={category} />}<ReviewRow label="Data" value={kind === 'installment' ? firstDueDate : purchaseDate} />{dueDate && <ReviewRow label="Vencimento" value={dueDate} />}<ReviewRow label={group.type === 'house_split' ? 'Quem pagou' : kind === 'income' ? 'Saldo de destino' : 'Saldo responsável'} value={responsible?.isCurrentUser ? 'Eu' : responsible?.displayName || 'Não informado'} />{needsParticipants && <ReviewRow label="Participantes" value={`${participantIds.length} pessoas · aprox. ${currency.format((kind === 'installment' ? installmentAmount : parseMoney(amount)) / Math.max(participantIds.length, 1))} por pessoa`} />}{group.type === 'balance_control' && kind !== 'income' && <ReviewRow label="Impacto no saldo" value={`− ${currency.format(kind === 'installment' ? installmentAmount : parseMoney(amount))}`} />}<ReviewRow label="Notificar grupo" value={notifyGroup ? 'Sim' : 'Não'} /></div>{error && <div className="rounded-2xl bg-red-50 p-4 text-sm text-danger">{error}</div>}<div className="flex gap-3"><Button variant="secondary" onClick={back} disabled={busy}><ArrowLeft size={16} /> Voltar</Button><Button fullWidth disabled={busy || !configured} onClick={save}>{busy ? <><Sparkles className="animate-pulse" size={17} /> Salvando…</> : 'Confirmar e salvar'}</Button></div>{!configured && <p className="text-center text-xs text-muted">A gravação fica desativada no modo de demonstração.</p>}</div>}

      {stage === 'success' && <div className="py-10 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-sage text-positive"><CheckCircle2 size={30} /></span><h3 className="mt-5 text-xl font-semibold text-ink">Salvo com sucesso</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted">O grupo será atualizado em tempo real para os membros.</p></div>}

      {invalidMessage && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber">{invalidMessage}</p>}
      {stage !== 'type' && stage !== 'review' && stage !== 'success' && <div className="mt-6 flex gap-3"><Button variant="secondary" fullWidth onClick={back} disabled={busy}><ArrowLeft size={16} /> Voltar</Button><Button fullWidth onClick={next} disabled={busy}>Continuar <ChevronRight size={16} /></Button></div>}
      {stage !== 'success' && <button onClick={() => !busy && onClose()} disabled={busy} className="mx-auto mt-4 flex items-center gap-1.5 text-xs font-semibold text-muted"><X size={14} /> Cancelar</button>}
    </BottomSheet>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-semibold text-ink">{label}<span className="mt-2 block">{children}</span></label> }
function Toggle({ checked, onChange, title, note }: { checked: boolean; onChange: (value: boolean) => void; title: string; note: string }) { return <button onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 rounded-2xl border border-line p-4 text-left"><span className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-petrol' : 'bg-line'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{title}</span><span className="mt-0.5 block text-xs leading-5 text-muted">{note}</span></span></button> }
function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 p-4 text-sm"><span className="text-muted">{label}</span><span className="max-w-[62%] text-right font-semibold text-ink">{value}</span></div> }
