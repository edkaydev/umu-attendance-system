interface ProgressBarProps {
  progress?: number
  percentage?: number // For backward compatibility
  label?: string
  showPercentage?: boolean
}

export function ProgressBar({ progress, percentage, label, showPercentage = true }: ProgressBarProps) {
  const actualProgress = percentage !== undefined ? percentage : (progress ?? 0)
  
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
          className="h-full rounded-full bg-umu-red transition-all duration-300 ease-out"
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