import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}

export function Modal({ open, onClose, title, description, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', closeOnEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-5" role="presentation">
      <button className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" aria-label="Fechar modal" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-lift"
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-canvas text-muted transition hover:text-ink"
        >
          <X size={18} />
        </button>
        <div className="pr-10">
          <h2 id="modal-title" className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-2 text-sm leading-6 text-muted">{description}</p>}
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
