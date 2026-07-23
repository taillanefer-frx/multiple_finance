import { PieChart } from 'lucide-react'
import { currency } from '../../lib/utils/format'
import type { PersonalCategoryTotal } from './types'

interface PersonalCategoryChartProps {
  categories: PersonalCategoryTotal[]
  total: number
}

function chartBackground(categories: PersonalCategoryTotal[], total: number) {
  if (total <= 0 || categories.length === 0) return '#E2E6E2'
  let cursor = 0
  const segments = categories.map((category) => {
    const start = cursor
    cursor += (category.amount / total) * 100
    return `${category.color} ${start}% ${cursor}%`
  })
  return `conic-gradient(${segments.join(', ')})`
}

export function PersonalCategoryChart({ categories, total }: PersonalCategoryChartProps) {
  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-canvas/60 px-5 py-8 text-center">
        <PieChart className="mx-auto text-muted" size={24} />
        <p className="mt-3 text-sm font-semibold text-ink">Sem gastos neste mês</p>
        <p className="mt-1 text-xs leading-5 text-muted">As categorias aparecem após o primeiro lançamento ou participação em uma despesa do grupo.</p>
      </div>
    )
  }

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[9rem_1fr]">
      <div
        className="relative mx-auto h-32 w-32 rounded-full"
        style={{ background: chartBackground(categories, total) }}
        role="img"
        aria-label={`Despesas por categoria: ${currency.format(total)}`}
      >
        <div className="absolute inset-[22px] grid place-items-center rounded-full bg-surface text-center shadow-card">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Total</p><p className="mt-1 text-sm font-semibold text-ink">{currency.format(total)}</p></div>
        </div>
      </div>
      <div className="space-y-3">
        {categories.slice(0, 6).map((category) => {
          const percent = total > 0 ? Math.round((category.amount / total) * 100) : 0
          return (
            <div key={category.key}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-medium text-ink"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><span className="truncate">{category.label}</span></span>
                <span className="shrink-0 font-semibold text-ink">{currency.format(category.amount)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/70"><div className="h-full rounded-full" style={{ width: `${Math.max(percent, 3)}%`, backgroundColor: category.color }} /></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
