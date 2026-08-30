import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Finestra modale: intestazione fissa, corpo scorrevole.
 *
 * Era cucita addosso alla mappa delle allerte; da quando la usa anche la
 * privacy va tenuta in un posto solo, altrimenti le due copie divergono al
 * primo ritocco. Si chiude col fondo, con la × e con Esc.
 *
 * `data-lenis-prevent` sul corpo: senza, lo scorrimento con inerzia della
 * pagina si mangia quello interno alla finestra.
 */
export default function Modal({ title, subtitle, onClose, children, bodyClassName = '', maxWidth = 860 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-[20px] border border-hair bg-surface card-shadow"
      >
        <div className="flex items-start gap-3 border-b border-hair p-4 pb-3">
          <div>
            <div className="text-[15px] font-bold">{title}</div>
            {subtitle && <div className="mt-0.5 text-[12px] text-ink-muted">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="ml-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fill text-[17px] leading-none text-ink transition duration-300 hover:bg-fill-hover"
          >
            ×
          </button>
        </div>
        <div data-lenis-prevent className={`overflow-auto p-4 ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
