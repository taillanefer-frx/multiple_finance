import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-petrol text-white shadow-card hover:bg-petrol-dark disabled:bg-petrol/45',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
  ghost: 'bg-transparent text-petrol hover:bg-sage',
  danger: 'bg-red-50 text-danger hover:bg-red-100',
}

export function Button({ className, variant = 'primary', fullWidth, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70',
        variants[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  )
}
