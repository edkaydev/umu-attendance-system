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

const iconByType: Record<ToastType, string> = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
}

const borderByType: Record<ToastType, string> = {
  success: 'border-l-success',
  warning: 'border-l-warning',
  error: 'border-l-danger',
  info: 'border-l-info',
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
            className={`pointer-events-auto flex items-start gap-2 rounded border border-border border-l-4 bg-white p-3.5 shadow-md ${borderByType[t.type]}`}
            onClick={() => dismiss(t.id)}
            role="alert"
          >
            <span aria-hidden="true">{iconByType[t.type]}</span>
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
