import { WalletCards } from 'lucide-react'
import { cn } from '../../lib/utils/cn'

interface BrandMarkProps {
  compact?: boolean
  inverse?: boolean
}

export function BrandMark({ compact = false, inverse = false }: BrandMarkProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'grid h-10 w-10 place-items-center rounded-2xl',
          inverse ? 'bg-white/12 text-white' : 'bg-petrol text-white shadow-card',
        )}
      >
        <WalletCards size={20} strokeWidth={1.8} />
      </span>
      {!compact && (
        <div className="leading-none">
          <p className={cn('text-sm font-semibold tracking-tight', inverse ? 'text-white' : 'text-ink')}>Multiple</p>
          <p className={cn('mt-1 text-[10px] font-medium uppercase tracking-[0.2em]', inverse ? 'text-white/60' : 'text-muted')}>
            Finance
          </p>
        </div>
      )}
    </div>
  )
}
