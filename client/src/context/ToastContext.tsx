import { createContext, useCallback, useContext, useState, ReactNode } from 'react'

type ToastType = 'success' | 'warning' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
})

const iconByType: Record<ToastType, { icon: ReactNode; className: string }> = {
  success: {
    className: 'text-success',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
      </svg>
    ),
  },
  warning: {
    className: 'text-warning',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  error: {
    className: 'text-danger',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  info: {
    className: 'text-info',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  // Deduplication: track recently shown messages so the same error
  // from a retry storm or multiple components can't stack endlessly.
  const recentKeys = new Set<string>()

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (type: ToastType, message: string) => {
      // Deduplicate: ignore if the same type+message was shown in the last 3s
      const key = `${type}::${message}`
      if (recentKeys.has(key)) return
      recentKeys.add(key)
      setTimeout(() => recentKeys.delete(key), 3000)

      const id = nextId++
      setToasts((prev) => {
        // Also cap at 5 visible toasts — oldest gets dropped if we overflow
        const next = [...prev, { id, type, message }]
        return next.length > 5 ? next.slice(next.length - 5) : next
      })
      setTimeout(() => dismiss(id), 4000)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dismiss]
  )

  const value: ToastContextValue = {
    toast,
    success: (m: string) => toast('success', m),
    error: (m: string) => toast('error', m),
    info: (m: string) => toast('info', m),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-slideIn items-start gap-2 rounded border border-border bg-white p-3.5 shadow-md"
            onClick={() => dismiss(t.id)}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            <span aria-hidden="true" className={`mt-0.5 shrink-0 ${iconByType[t.type].className}`}>
              {iconByType[t.type].icon}
            </span>
            <span className="text-sm text-text-primary">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}
