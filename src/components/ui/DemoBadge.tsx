import { Eye } from 'lucide-react'

export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-1 text-[11px] font-semibold text-petrol">
      <Eye size={12} />
      Dados de demonstração
    </span>
  )
}
