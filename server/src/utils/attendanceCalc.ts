export type AttendanceStatusLabel = 'good' | 'warning' | 'not_eligible'

/**
 * Attendance percentage (FR-07.3):
 * (Present + Excused) / Total Closed Sessions × 100
 */
export function attendancePercentage(presentExcusedCount: number, totalSessions: number): number {
  if (totalSessions <= 0) return 100
  return (presentExcusedCount / totalSessions) * 100
}

/**
 * Eligibility status:
 *   > 80   → good
 *   75–80  → warning
 *   < 75   → not eligible
 */
export function attendanceStatus(pct: number): AttendanceStatusLabel {
  if (pct > 80) return 'good'
  if (pct >= 75) return 'warning'
  return 'not_eligible'
}

/** Alert thresholds used by the alert evaluation service (FR-08). */
export const ALERT_THRESHOLDS = {
  warning: 80, // fires when pct <= 80
  critical: 75, // fires when pct < 75
} as const
