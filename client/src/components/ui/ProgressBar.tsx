export function ProgressBar({ percentage }: { percentage: number }) {
  const color = percentage >= 80 ? 'bg-success' : percentage >= 75 ? 'bg-warning' : 'bg-danger'
  const width = Math.min(100, Math.max(0, percentage))
  const status = width >= 80 ? 'Good attendance' : width >= 75 ? 'Attendance warning' : 'Attendance critical'
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]"
      role="progressbar"
      aria-label="Attendance percentage"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
      aria-valuetext={`${width}% — ${status}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-600 ${color}`}
        style={{ width: `${width}%` }}
      />
      <span className="sr-only">{status}</span>
    </div>
  )
}
