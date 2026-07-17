import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, description, children }: BottomSheetProps) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" aria-label="Fechar ações rápidas" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="safe-bottom relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-line bg-white px-5 pb-5 pt-3 shadow-lift"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-canvas text-muted"
        >
          <X size={18} />
        </button>
        <div className="pr-12">
          <h2 id="sheet-title" className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
