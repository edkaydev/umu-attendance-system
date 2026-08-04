import { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary:
    'bg-umu-red text-white hover:bg-umu-red-dark focus:ring-umu-red/30',
  secondary:
    'bg-white text-umu-red border-[1.5px] border-umu-red hover:bg-[#FFF4F4] focus:ring-umu-red/30',
  ghost: 'bg-transparent text-umu-red hover:bg-[#FFF4F4] focus:ring-umu-red/30',
  danger: 'bg-danger text-white hover:bg-[#B91C1C] focus:ring-danger/30',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded px-6 py-3 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
