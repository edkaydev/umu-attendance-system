import { ReactNode, useId, useRef } from 'react'
import { useDialogAccessibility } from './useDialogAccessibility'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  closeOnOverlay?: boolean
  closeOnEscape?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  closeOnOverlay = true,
  closeOnEscape = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const { onKeyDown } = useDialogAccessibility(open, panelRef, onClose, closeOnEscape)

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[480px] rounded-lg bg-white p-8 shadow-lg animate-[modalIn_200ms_ease]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        {title && <h2 id={titleId} className="mb-4 text-h2 font-semibold">{title}</h2>}
        {description && <p id={descriptionId} className="mb-4 text-body-sm text-text-secondary">{description}</p>}
        {children}
      </div>
      <style>{`@keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  )
}
