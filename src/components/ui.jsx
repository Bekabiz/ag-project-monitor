import { useEffect, useId, useRef } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function ModalShell({ open, onClose, title, description, icon: Icon, children, actions, size = 'md', className = '' }) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = dialogRef.current
    window.requestAnimationFrame(() => (dialog?.querySelector(FOCUSABLE) || dialog)?.focus())

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE))
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="ui-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
      <section
        ref={dialogRef}
        className={`ui-modal ui-modal-${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="ui-modal-header">
          <div className="ui-modal-heading">
            {Icon && <span className="ui-modal-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>}
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descriptionId}>{description}</p>}
            </div>
          </div>
          <button type="button" className="ui-icon-button" onClick={onClose} aria-label="Κλείσιμο">
            <X size={19} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>
        <div className="ui-modal-body">{children}</div>
        {actions && <footer className="ui-modal-actions">{actions}</footer>}
      </section>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, compact = false, tone = 'neutral' }) {
  return (
    <div className={`ui-empty-state ui-empty-state-${tone} ${compact ? 'is-compact' : ''}`}>
      {Icon && <span className="ui-empty-icon" aria-hidden="true"><Icon size={26} strokeWidth={1.65} /></span>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actionLabel && onAction && <button type="button" className="ui-button ui-button-primary" onClick={onAction}>{actionLabel}</button>}
    </div>
  )
}

export function LoadingState({ label = 'Φόρτωση δεδομένων…', cards = 3 }) {
  return (
    <div className="ui-loading-state" role="status" aria-live="polite" aria-label={label}>
      <div className="ui-loading-heading"><span /><span /></div>
      <div className="ui-loading-grid">
        {Array.from({ length: cards }, (_, index) => (
          <div className="ui-skeleton-card" key={index}>
            <span className="ui-skeleton-line is-short" />
            <span className="ui-skeleton-line" />
            <span className="ui-skeleton-line is-medium" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function InlineNotice({ children, tone = 'info' }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div className={`ui-inline-notice ui-inline-notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

export function ButtonSpinner({ label = 'Επεξεργασία…' }) {
  return <><LoaderCircle className="ui-spin" size={17} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></>
}
