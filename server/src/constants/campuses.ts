/**
 * Fixed UMU campuses.
 *
 * Campuses are permanent and do not change, so they are defined here in code
 * instead of being user-managed records in the database.
 */
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
