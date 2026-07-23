import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/utils/cn'
import { Button } from './Button'

interface LoadingStateProps {
  label?: string
  fullScreen?: boolean
}

export function LoadingState({ label = 'Carregando…', fullScreen = false }: LoadingStateProps) {
  return (
    <div className={cn('grid place-items-center px-6 py-16', fullScreen && 'min-h-screen bg-canvas')}>
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sage text-petrol">
          <LoaderCircle className="animate-spin" size={22} />
        </span>
        <p className="mt-4 text-sm font-medium text-muted">{label}</p>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  icon?: LucideIcon
}

export function EmptyState({ title, description, actionLabel, onAction, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-surface/55 px-6 py-12 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sage text-petrol"><Icon size={22} /></span>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted">{description}</p>
      {actionLabel && onAction && <Button className="mt-5" variant="secondary" onClick={onAction}>{actionLabel}</Button>}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Não foi possível carregar',
  description = 'Algo saiu do esperado. Tente novamente em instantes.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="rounded-3xl border border-red-100 bg-red-50/70 px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-danger"><AlertCircle size={22} /></span>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted">{description}</p>
      {onRetry && <Button className="mt-5" variant="secondary" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  )
}
