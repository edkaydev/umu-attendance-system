import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { actorFromRequest } from '../utils/actor'
import { parsePeriodQuery } from '../utils/period'
import {
  getLecturerReport,
  getProgrammeReport,
  getCourseUnitReport,
  getStudentReport,
} from '../services/report.service'

export async function lecturerReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { lecturerId } = z.object({ lecturerId: z.string().uuid() }).parse(req.params)
    const data = await getLecturerReport(actorFromRequest(req), lecturerId, parsePeriodQuery(req.query))
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function programmeReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { programmeId } = z.object({ programmeId: z.string().uuid() }).parse(req.params)
    const data = await getProgrammeReport(actorFromRequest(req), programmeId, parsePeriodQuery(req.query))
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function courseUnitReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseUnitId } = z.object({ courseUnitId: z.string().uuid() }).parse(req.params)
    const data = await getCourseUnitReport(actorFromRequest(req), courseUnitId, parsePeriodQuery(req.query))
    ok(res, data)
  } catch (e) {
    next(e)
  }
}

export async function studentReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.params)
    const data = await getStudentReport(actorFromRequest(req), studentId, parsePeriodQuery(req.query))
    ok(res, data)
  } catch (e) {
    next(e)
  }
}
