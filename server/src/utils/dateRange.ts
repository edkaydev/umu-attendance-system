/** Half-open date range [start, end). */
export interface DateRange {
  start: Date
  end: Date
}

/** Midnight-to-midnight range for the day `daysAgo` days before today (server timezone). */
export function dayRange(daysAgo = 0): DateRange {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - daysAgo)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

/** Midnight at the start of today (server timezone). */
export function startOfToday(): Date {
  return dayRange(0).start
}

/** YYYY-MM-DD in UTC. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Prisma date filter for the `today` / `date` (YYYY-MM-DD) session list filters.
 * Returns undefined when neither filter is set or the date cannot be parsed.
 */
export function dayFilter(filters?: { today?: boolean; date?: string }):
  | { gte: Date; lt: Date }
  | undefined {
  if (filters?.today) {
    const { start, end } = dayRange(0)
    return { gte: start, lt: end }
  }
  if (filters?.date) {
    const start = new Date(filters.date + 'T00:00:00')
    if (Number.isNaN(start.getTime())) return undefined
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { gte: start, lt: end }
  }
  return undefined
}
