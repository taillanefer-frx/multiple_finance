import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils/cn'

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-3xl border border-line/80 bg-surface shadow-card', className)} {...props} />
}
