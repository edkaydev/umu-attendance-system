import { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-lg bg-white p-8 shadow-lg animate-[modalIn_200ms_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-4 text-h2 font-semibold">{title}</h2>}
        {children}
      </div>
      <style>{`@keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  )
}
