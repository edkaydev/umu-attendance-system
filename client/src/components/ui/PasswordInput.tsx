import { useState, InputHTMLAttributes } from 'react'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  showStrength?: boolean
}

interface Strength {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
}

export function getPasswordStrength(password: string): Strength {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 8)  score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  // cap at 4
  const capped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', 'bg-danger', 'bg-warning', 'bg-[#F59E0B]', 'bg-success']
  return { score: capped, label: labels[capped], color: colors[capped] }
}

const EyeOpen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M2.2 12S5.8 6 12 6s9.8 6 9.8 6-3.6 6-9.8 6S2.2 12 2.2 12Z"/>
    <circle cx="12" cy="12" r="2.5"/>
  </svg>
)

const EyeOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="m3 3 18 18"/>
    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
    <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9.3 5.3 9.8 6-.3.5-1.5 2.1-3.4 3.4"/>
    <path d="M6.6 6.6C4.4 8.1 2.7 10.7 2.2 11.5c.7 1.1 4.3 6.5 9.8 6.5 1.4 0 2.7-.3 3.8-.9"/>
  </svg>
)

export function PasswordInput({
  label,
  error,
  showStrength = false,
  className = '',
  id,
  value = '',
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const strength = showStrength ? getPasswordStrength(String(value)) : null

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          className={`w-full rounded border bg-surface-1 px-4 py-3 pr-12 text-sm text-[#1A1A1A] placeholder:text-[#94A3B8] focus:border-umu-red focus:outline-none focus:ring-2 focus:ring-umu-red/20 transition-all duration-200 ${error ? 'border-danger' : 'border-border'} ${className}`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-text-secondary hover:text-text-primary"
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOff /> : <EyeOpen />}
        </button>
      </div>

      {/* Strength meter — only shown when showStrength=true and user has typed something */}
      {showStrength && strength && strength.score > 0 && (
        <div className="mt-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((bar) => (
              <div
                key={bar}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  bar <= strength.score ? strength.color : 'bg-border'
                }`}
              />
            ))}
          </div>
          <p className={`mt-1 text-xs font-medium ${
            strength.score <= 1 ? 'text-danger' :
            strength.score === 2 ? 'text-warning' :
            strength.score === 3 ? 'text-[#F59E0B]' :
            'text-success'
          }`}>
            {strength.label}
          </p>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
