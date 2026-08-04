import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { ApiError } from '../utils/apiResponse'
import {
  getLecturerReport,
  getProgrammeReport,
  getCourseUnitReport,
  getStudentReport,
} from '../services/report.service'

function parsePeriod(query: Record<string, unknown>): { academicYear: string; semester: number } {
  const academicYear = String(query.academicYear ?? '')
  const semester = Number(query.semester ?? '')
  if (!/^\d{4}\/\d{4}$/.test(academicYear)) {
    throw new ApiError('academicYear is required (e.g. 2025/2026)', 400)
  }
  if (!Number.isInteger(semester) || semester < 1 || semester > 2) {
    throw new ApiError('semester is required (1 or 2)', 400)
  }
  return { academicYear, semester }
}

function actor(req: Request) {
  return { id: req.user!.id, role: req.user!.role, facultyId: req.user!.facultyId ?? null }
}

export async function lecturerReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { lecturerId } = z.object({ lecturerId: z.string().uuid() }).parse(req.params)
    const data = await getLecturerReport(actor(req), lecturerId, parsePeriod(req.query))
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function programmeReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { programmeId } = z.object({ programmeId: z.string().uuid() }).parse(req.params)
    const data = await getProgrammeReport(actor(req), programmeId, parsePeriod(req.query))
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function courseUnitReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseUnitId } = z.object({ courseUnitId: z.string().uuid() }).parse(req.params)
    const data = await getCourseUnitReport(actor(req), courseUnitId, parsePeriod(req.query))
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function studentReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.params)
    const data = await getStudentReport(actor(req), studentId, parsePeriod(req.query))
    ok(res, data)
  } catch (e) {
    next(e)
  }
}
