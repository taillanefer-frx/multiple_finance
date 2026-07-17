import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils/cn'
import { Surface } from './Surface'

interface CollapsibleSectionProps {
  title: string
  description: string
  icon: LucideIcon
  badge?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({ title, description, icon: Icon, badge, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Surface className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-5 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sage text-petrol"><Icon size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">{description}</span>
        </span>
        {badge && <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-muted">{badge}</span>}
        <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </Surface>
  )
}
