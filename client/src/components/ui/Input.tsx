import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', id, ...rest }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded border bg-surface-1 px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#94A3B8] focus:border-umu-red focus:outline-none focus:ring-2 focus:ring-umu-red/20 transition-all duration-200 ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
