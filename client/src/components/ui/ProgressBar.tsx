interface ProgressBarProps {
  progress?: number
  percentage?: number // For backward compatibility
  label?: string
  showPercentage?: boolean
  /** Override the automatic colour (green ≥80, amber ≥75, red <75) */
  tone?: 'success' | 'warning' | 'danger'
}

const TONES = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const

function toneFor(value: number): keyof typeof TONES {
  if (value >= 80) return 'success'
  if (value >= 75) return 'warning'
  return 'danger'
}

export function ProgressBar({ progress, percentage, label, showPercentage = true, tone }: ProgressBarProps) {
  const actualProgress = percentage !== undefined ? percentage : (progress ?? 0)
  const barTone = tone ?? toneFor(actualProgress)

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs text-text-secondary">
          <span>{label}</span>
          {showPercentage && <span>{Math.round(actualProgress)}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${TONES[barTone]}`}
          style={{ width: `${Math.min(actualProgress, 100)}%` }}
          role="progressbar"
          aria-valuenow={actualProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}