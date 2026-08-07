import type { UnitStatus, AttendanceStatus, SessionStatus } from '../../types'

const badgeColors: Record<string, { bg: string; text: string; border: string; label: string }> = {
  good: { bg: 'bg-success-light', text: 'text-success', border: 'border-success-border', label: 'Good' },
  warning: { bg: 'bg-warning-light', text: 'text-warning', border: 'border-warning-border', label: 'Warning' },
  not_eligible: { bg: 'bg-danger-light', text: 'text-danger', border: 'border-danger-border', label: 'Not Eligible' },
  none: { bg: 'bg-surface-2', text: 'text-text-secondary', border: 'border-border', label: 'No sessions' },
  present: { bg: 'bg-success-light', text: 'text-success', border: 'border-success-border', label: 'Present' },
  absent: { bg: 'bg-danger-light', text: 'text-danger', border: 'border-danger-border', label: 'Absent' },
  excused: { bg: 'bg-info-light', text: 'text-info', border: 'border-info-border', label: 'Excused' },
  open: { bg: 'bg-success-light', text: 'text-success', border: 'border-success-border', label: 'Open' },
  closed: { bg: 'bg-surface-2', text: 'text-text-secondary', border: 'border-border', label: 'Closed' },
  critical: { bg: 'bg-danger-light', text: 'text-danger', border: 'border-danger-border', label: 'Critical' },
}

export function Badge({ status }: { status: UnitStatus | AttendanceStatus | SessionStatus | 'critical' }) {
  const c = badgeColors[status]
  if (!c) return null
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text} ${c.border}`}>
      {c.label}
    </span>
  )
}
