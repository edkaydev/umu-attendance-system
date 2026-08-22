export type AttendanceStatusLabel = 'good' | 'warning' | 'not_eligible'

/** Statuses that count towards attendance (FR-07.3): present or excused. */
export function isAttended(record: { status: string }): boolean {
  return record.status === 'present' || record.status === 'excused'
}

/**
 * Count attended records grouped by a key (student, unit, day, ...).
 * Records whose key is undefined are skipped.
 */
export function countAttendedBy<T extends { status: string }>(
  records: T[],
  key: (record: T) => string | undefined
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const record of records) {
    if (!isAttended(record)) continue
    const k = key(record)
    if (k === undefined) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

/** Attended vs total record counts over a flat list of records. */
export function tallyAttendance(records: { status: string }[]): {
  attended: number
  total: number
} {
  let attended = 0
  for (const record of records) {
    if (isAttended(record)) attended += 1
  }
  return { attended, total: records.length }
}

/** Average attendance as a 2-decimal percentage, or null when there is nothing to average. */
export function averagePercentage(attended: number, total: number): number | null {
  return total ? Number(((attended / total) * 100).toFixed(2)) : null
}

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
 *   >= 80  → good
 *   75–79  → warning
 *   < 75   → not eligible
 */
export function attendanceStatus(pct: number): AttendanceStatusLabel {
  if (pct >= 80) return 'good'
  if (pct >= 75) return 'warning'
  return 'not_eligible'
}

/** Alert thresholds used by the alert evaluation service (FR-08). */
export const ALERT_THRESHOLDS = {
  warning: 80, // fires when pct <= 80
  critical: 75, // fires when pct < 75
} as const

/**
 * Which alert levels should fire for a given percentage.
 * Pure function so the threshold rules can be unit tested (FR-08.1/08.2).
 */
export function alertLevelsForPct(pct: number): { warning: boolean; critical: boolean } {
  return {
    warning: pct <= ALERT_THRESHOLDS.warning,
    critical: pct < ALERT_THRESHOLDS.critical,
  }
}
