import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Home, Landmark } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { cn } from '../../lib/utils/cn'
import { createGroup } from './groupService'
import { groupTypeLabel } from './groupLabels'
import type { GroupType } from './types'

interface CreateGroupModalProps {
  open: boolean
  onClose: () => void
  onCreated: (groupId: string) => void
  enabled: boolean
}

export function CreateGroupModal({ open, onClose, onCreated, enabled }: CreateGroupModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState('')
  const [type, setType] = useState<GroupType>('house_split')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (busy) return
    setStep(1)
    setName('')
    setType('house_split')
    setError(null)
    onClose()
  }

  async function confirm() {
    if (!enabled || busy) return
    setBusy(true)
    setError(null)
    try {
      const groupId = await createGroup(name, type)
      setBusy(false)
      onCreated(groupId)
      close()
    } catch {
      setBusy(false)
      setError('Não foi possível criar o grupo. Verifique sua conexão e tente novamente.')
    }
  }

  return (
    <Modal open={open} onClose={close} title="Criar novo grupo" description={`Etapa ${step} de 3`}>
      <div className="mb-6 grid grid-cols-3 gap-2" aria-label={`Etapa ${step} de 3`}>
        {[1, 2, 3].map((item) => <span key={item} className={cn('h-1.5 rounded-full', item <= step ? 'bg-petrol' : 'bg-line')} />)}
      </div>

      {step === 1 && (
        <div>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-ink">Nome do grupo</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus className="h-12 w-full rounded-2xl border border-line px-4 text-sm text-ink placeholder:text-muted/60" placeholder="Ex.: Casa, Família ou Viagem" />
          </label>
          <p className="mt-3 text-xs leading-5 text-muted">Use um nome que os participantes reconheçam com facilidade.</p>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3">
          {([
            { value: 'house_split' as const, icon: Home, note: 'Divida despesas e acompanhe a parte de cada pessoa.' },
            { value: 'balance_control' as const, icon: Landmark, note: 'Acompanhe entradas, saídas e o saldo individual.' },
          ]).map(({ value, icon: Icon, note }) => (
            <button key={value} onClick={() => setType(value)} className={cn('flex items-start gap-3 rounded-2xl border p-4 text-left transition', type === value ? 'border-petrol bg-sage/70' : 'border-line hover:bg-canvas')}>
              <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', type === value ? 'bg-petrol text-white' : 'bg-canvas text-muted')}><Icon size={20} /></span>
              <span className="flex-1"><span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">{groupTypeLabel[value]} {type === value && <Check size={17} className="text-petrol" />}</span><span className="mt-1 block text-xs leading-5 text-muted">{note}</span></span>
            </button>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="rounded-2xl bg-canvas p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Confirme os dados</p>
          <p className="mt-4 text-xl font-semibold text-ink">{name.trim()}</p>
          <p className="mt-1 text-sm font-medium text-petrol">{groupTypeLabel[type]}</p>
          <p className="mt-4 text-xs leading-5 text-muted">Você será adicionada como administradora. O grupo será privado desde a criação.</p>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-xs leading-5 text-danger">{error}</p>}
      {!enabled && <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber">Configure o Supabase para criar grupos reais.</p>}

      <div className="mt-6 flex gap-3">
        {step > 1 && <Button variant="secondary" onClick={() => setStep((step - 1) as 1 | 2)} disabled={busy}><ArrowLeft size={16} /> Voltar</Button>}
        {step < 3 ? (
          <Button className="ml-auto" onClick={() => setStep((step + 1) as 2 | 3)} disabled={step === 1 && !name.trim()}>{step === 1 ? 'Escolher tipo' : 'Revisar'} <ArrowRight size={16} /></Button>
        ) : (
          <Button className="ml-auto" onClick={confirm} disabled={!enabled || busy}>{busy ? 'Criando…' : 'Criar grupo'} {!busy && <Check size={16} />}</Button>
        )}
      </div>
    </Modal>
  )
}
