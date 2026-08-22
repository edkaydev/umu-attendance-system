const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-4',
  lg: 'h-10 w-10 border-4',
} as const

interface SpinnerProps {
  size?: keyof typeof SIZES
}

/** UMU-red spinning ring. */
export function Spinner({ size = 'lg' }: SpinnerProps) {
  return (
    <div
      className={`${SIZES[size]} animate-spin rounded-full border-umu-red border-t-transparent`}
    />
  )
}

interface LoadingStateProps {
  /** Announced to screen readers and shown under the spinner. */
  label?: string
  /** Centre in the viewport instead of within the page content. */
  fullScreen?: boolean
}

/** Centred spinner with an optional caption, used while a page or panel loads. */
export function LoadingState({ label, fullScreen = false }: LoadingStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        fullScreen ? 'min-h-screen' : 'py-24'
      }`}
      role="status"
      aria-live="polite"
    >
      <Spinner />
      {label ? <p className="text-body-sm text-text-secondary">{label}</p> : null}
    </div>
  )
}
