import { z } from 'zod'
import { ApiError } from './apiResponse'

/** Academic year + semester an operation applies to. */
export interface Period {
  academicYear: string
  semester: number
}

/** True for an academic year written as YYYY/YYYY (e.g. 2025/2026). */
export function isValidAcademicYear(academicYear: string): boolean {
  return /^\d{4}\/\d{4}$/.test(academicYear)
}

/** True for semester 1 or 2. */
export function isValidSemester(semester: number): boolean {
  return Number.isInteger(semester) && semester >= 1 && semester <= 2
}

/** Zod field for an academic year in request bodies. */
export const academicYearField = z
  .string()
  .regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026')

/** Zod field for a semester in request bodies. */
export const semesterField = z.number().int().min(1).max(2)

/** Reject a period that is not a valid academic year + semester. */
export function assertValidPeriod(academicYear: string, semester: number): void {
  if (!isValidAcademicYear(academicYear)) {
    throw new ApiError('Academic year must be like 2025/2026', 400)
  }
  if (!isValidSemester(semester)) {
    throw new ApiError('Semester must be 1 or 2', 400)
  }
}

/** Read and validate the academicYear/semester query parameters of a report request. */
export function parsePeriodQuery(query: Record<string, unknown>): Period {
  const academicYear = String(query.academicYear ?? '')
  const semester = Number(query.semester ?? '')
  if (!isValidAcademicYear(academicYear)) {
    throw new ApiError('academicYear is required (e.g. 2025/2026)', 400)
  }
  if (!isValidSemester(semester)) {
    throw new ApiError('semester is required (1 or 2)', 400)
  }
  return { academicYear, semester }
}
