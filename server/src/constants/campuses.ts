/**
 * Fixed UMU campuses.
 *
 * Campuses are permanent and do not change, so they are defined here in code
 * instead of being user-managed records in the database.
 */

/**
 * East Africa Time offset from UTC, in hours.
 * UMU Nkozi is in Uganda (EAT = UTC+3, no DST year-round).
 *
 * All date comparisons that need to reflect the local calendar day at Nkozi
 * (e.g. "same day" check for session reopen, weekly summary window) must use
 * this constant rather than a hardcoded literal.
 *
 * If the system is ever deployed in a different timezone, change this value
 * (or replace with process.env.TZ_OFFSET_HOURS) — do NOT scatter raw `+3`
 * literals through the codebase.
 */
export const EAT_OFFSET_HOURS = 3

/**
 * Convert any UTC Date to an EAT "YYYY-MM-DD" string.
 * Use this wherever a wall-clock calendar day at Nkozi Campus is needed.
 */
export function toEATDateString(d: Date): string {
  const eat = new Date(d.getTime() + EAT_OFFSET_HOURS * 60 * 60 * 1000)
  return eat.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

/**
 * Return the current hour-of-day in EAT (0–23).
 * Used by the weekly summary scheduler.
 */
export function eatHour(d: Date): number {
  return new Date(d.getTime() + EAT_OFFSET_HOURS * 60 * 60 * 1000).getUTCHours()
}

export interface CampusInfo {
  code: string
  name: string
}

export const CAMPUSES: CampusInfo[] = [
  { code: 'NKZ', name: 'Nkozi Campus' },
  { code: 'LBG', name: 'Lubaga Campus' },
  { code: 'NSB', name: 'Nsambya Campus' },
  { code: 'MSK', name: 'Masaka Campus' },
  { code: 'NGT', name: 'Ngetta Campus' },
  { code: 'FPT', name: 'Fort Portal Campus' },
  { code: 'MBL', name: 'Mbale Campus' },
]

export function getCampus(code: string): CampusInfo | undefined {
  return CAMPUSES.find((c) => c.code === code.toUpperCase())
}

export function isValidCampusCode(code: string): boolean {
  return getCampus(code) !== undefined
}

export function campusName(code: string): string {
  return getCampus(code)?.name ?? code
}
