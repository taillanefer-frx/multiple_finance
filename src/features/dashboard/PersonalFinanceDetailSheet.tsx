import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Plus } from 'lucide-react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/utils/cn'
import { currency, shortDate } from '../../lib/utils/format'
import { categoryDefinition } from './personalFinanceCategories'
import type { PersonalFinanceSummary, PersonalLedgerItem, PersonalTransactionType } from './types'

type DetailView = 'overview' | 'expense' | 'income'

interface PersonalFinanceDetailSheetProps {
  open: boolean
  onClose: () => void
  monthLabel: string
  items: PersonalLedgerItem[]
  summary: PersonalFinanceSummary
  onNew: (type: PersonalTransactionType) => void
  onSelect: (item: PersonalLedgerItem) => void
}

const tabs: Array<{ key: DetailView; label: string }> = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'expense', label: 'Gasto mensal' },
  { key: 'income', label: 'Renda mensal' },
]

export function PersonalFinanceDetailSheet({ open, onClose, monthLabel, items, summary, onNew, onSelect }: PersonalFinanceDetailSheetProps) {
  const [view, setView] = useState<DetailView>('overview')
  const [category, setCategory] = useState('all')

  const visibleByView = useMemo(() => items.filter((item) => view === 'overview' || item.type === view), [items, view])
  const categories = useMemo(() => {
    const values = new Map<string, { key: string; label: string; color: string }>()
    for (const item of visibleByView) {
      const definition = categoryDefinition(item.category, item.type)
      values.set(definition.key, { key: definition.key, label: definition.label, color: definition.color })
    }
    return [...values.values()]
  }, [visibleByView])
  const visibleItems = useMemo(() => visibleByView.filter((item) => category === 'all' || categoryDefinition(item.category, item.type).key === category), [category, visibleByView])

  function chooseView(nextView: DetailView) {
    setView(nextView)
    setCategory('all')
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Movimentações de ${monthLabel}`} description="Seus lançamentos pessoais e sua participação nas despesas compartilhadas.">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-canvas p-1">
        {tabs.map((tab) => <button key={tab.key} type="button" onClick={() => chooseView(tab.key)} className={cn('rounded-xl px-2 py-2.5 text-[11px] font-semibold transition sm:text-xs', view === tab.key ? 'bg-surface text-petrol shadow-card' : 'text-muted')}>{tab.label}</button>)}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-emerald-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-positive">Entradas</p><p className="mt-1 text-base font-semibold text-ink">{currency.format(summary.income)}</p></div>
        <div className="rounded-2xl bg-red-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-danger">Saídas</p><p className="mt-1 text-base font-semibold text-ink">{currency.format(summary.totalExpenses)}</p></div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setCategory('all')} className={cn('shrink-0 rounded-full border px-3 py-2 text-xs font-semibold', category === 'all' ? 'border-petrol bg-sage text-petrol' : 'border-line bg-surface text-muted')}>Todas</button>
        {categories.map((item) => <button key={item.key} type="button" onClick={() => setCategory(item.key)} className="shrink-0 rounded-full border px-3 py-2 text-xs font-semibold" style={{ borderColor: item.color, color: item.color, backgroundColor: category === item.key ? `${item.color}18` : 'white' }}>{item.label}</button>)}
      </div>

      <div className="mt-5 space-y-2">
        {visibleItems.length === 0 ? <div className="rounded-2xl border border-dashed border-line p-7 text-center text-sm text-muted">Nenhuma movimentação neste filtro.</div> : visibleItems.map((item) => {
          const income = item.type === 'income'
          const definition = categoryDefinition(item.category, item.type)
          return (
            <button key={item.id} type="button" onClick={() => onSelect(item)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left transition hover:bg-canvas">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ color: definition.color, backgroundColor: `${definition.color}16` }}>{income ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{item.description}</span><span className="mt-1 block truncate text-[11px] text-muted">{definition.label} · {shortDate.format(new Date(`${item.occurredOn}T12:00:00`))}{item.groupName ? ` · ${item.groupName}` : ''}</span></span>
              <span className="text-right"><span className={cn('block text-sm font-semibold', income ? 'text-positive' : 'text-danger')}>{income ? '+' : '−'} {currency.format(item.amount)}</span><span className="mt-1 flex items-center justify-end text-[10px] text-muted">{item.editable ? 'Editar' : 'Detalhes'} <ChevronRight size={12} /></span></span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onNew('income')}><ArrowDownLeft size={16} /> Nova entrada</Button>
        <Button onClick={() => onNew('expense')}><Plus size={16} /> Nova saída</Button>
      </div>
    </BottomSheet>
  )
}
