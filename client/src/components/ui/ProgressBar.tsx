export function ProgressBar({ percentage }: { percentage: number }) {
  const color = percentage >= 80 ? 'bg-success' : percentage >= 75 ? 'bg-warning' : 'bg-danger'
  const width = Math.min(100, Math.max(0, percentage))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
      <div
        className={`h-full rounded-full transition-all duration-600 ${color}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
