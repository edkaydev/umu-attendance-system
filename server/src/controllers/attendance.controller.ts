import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { ApiError } from '../utils/apiResponse'
import {
  getMyAttendance,
  getSessionAttendance,
  getUnitSummary,
} from '../services/attendance.service'

/** Student: own attendance per unit for the current semester (FR-07.2). */
export async function myAttendanceController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getMyAttendance(req.user!.id)
    ok(res, result)
  } catch (e) {
    next(e)
  }
}

/** Lecturer / faculty admin: full attendance list for a session. */
export async function sessionAttendanceController(req: Request, res: Response, next: NextFunction) {
  try {
    const { records, counts } = await getSessionAttendance(req.params.sessionId, {
      id: req.user!.id,
      role: req.user!.role,
      facultyId: req.user!.facultyId ?? null,
    })
    ok(res, { records, counts })
  } catch (e) {
    next(e)
  }
}

/** Percentage + status per student for one course unit (FR-07.3). */
export async function unitSummaryController(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseUnitId } = z.object({ courseUnitId: z.string().uuid() }).parse(req.params)
    const academicYear = String(req.query.academicYear ?? '')
    const semester = Number(req.query.semester ?? '')
    if (!/^\d{4}\/\d{4}$/.test(academicYear)) {
      throw new ApiError('academicYear is required (e.g. 2025/2026)', 400)
    }
    if (!Number.isInteger(semester) || semester < 1 || semester > 2) {
      throw new ApiError('semester is required (1 or 2)', 400)
    }
    const result = await getUnitSummary(courseUnitId, academicYear, semester)
    ok(res, result)
  } catch (e) {
    next(e)
  }
}


