import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { actorFromRequest } from '../utils/actor'
import { parsePeriodQuery } from '../utils/period'
import { AttendanceStatus } from '@prisma/client'
import {
  getMyAttendance,
  getSessionAttendance,
  getUnitSummary,
  editAttendance,
} from '../services/attendance.service'

const editSchema = z.object({
  status: z.enum(['present', 'absent', 'excused']),
  reason: z.string().min(1).max(500),
})

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
    const { records, counts } = await getSessionAttendance(
      req.params.sessionId,
      actorFromRequest(req)
    )
    ok(res, { records, counts })
  } catch (e) {
    next(e)
  }
}

/** Percentage + status per student for one course unit (FR-07.3). */
export async function unitSummaryController(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseUnitId } = z.object({ courseUnitId: z.string().uuid() }).parse(req.params)
    const { academicYear, semester } = parsePeriodQuery(req.query)
    const result = await getUnitSummary(courseUnitId, academicYear, semester)
    ok(res, result)
  } catch (e) {
    next(e)
  }
}

/** Manual attendance edit with reason (lecturer / faculty admin). */
export async function editAttendanceController(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, reason } = editSchema.parse(req.body)
    const record = await editAttendance(
      req.params.recordId,
      status as AttendanceStatus,
      reason,
      actorFromRequest(req)
    )
    ok(res, { message: 'Attendance updated', record })
  } catch (e) {
    next(e)
  }
}
