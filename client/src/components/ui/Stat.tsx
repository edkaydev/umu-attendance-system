const VARIANT_COLOURS = {
  default: 'text-text-primary',
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
} as const

interface StatProps {
  label: string
  value: number | string
  variant?: keyof typeof VARIANT_COLOURS
}

/** Boxed headline figure with a caption, used across the dashboards. */
export function Stat({ label, value, variant = 'default' }: StatProps) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-white p-4">
      <span className={`text-h2 font-bold leading-none ${VARIANT_COLOURS[variant]}`}>{value}</span>
      <span className="text-body-sm text-text-secondary">{label}</span>
    </div>
  )
}
