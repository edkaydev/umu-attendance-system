import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import {
  openSession,
  listSessions,
  listSessionsForFaculty,
  getSession,
  getLiveSession,
  closeSession,
  reopenSession,
  extendSessionTime,
} from '../services/session.service'
import { evaluateAttendanceAlerts } from '../services/alert.service'

const openSessionSchema = z.object({
  courseUnitId: z.string().uuid(),
  venue: z.string().max(120).optional(),
  /** Zoom / Google Meet / Teams join URL — online sessions only */
  meetingLink: z.string().url('Enter a valid link, e.g. https://zoom.us/j/…').max(500).optional(),
  mode: z.enum(['physical', 'online']).optional(),
  startsAt: z.string().datetime().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'),
  semester: z.number().int().min(1).max(2),
  classDuration: z.number().int().min(1).max(180).optional(),
  codeTtl: z.number().int().min(15).max(30).optional(),
  /** Lecturer GPS for physical session campus check */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

const listQuerySchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  status: z.enum(['open', 'closed']).optional(),
  /** Pass ?today=true to scope to today's sessions only */
  today: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  /** Pass ?date=YYYY-MM-DD to scope to a specific day */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export async function openSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = openSessionSchema.parse(req.body)
    const session = await openSession(req.user!.id, data)
    ok(res, { message: 'Session opened', session })
  } catch (e) {
    next(e)
  }
}

export async function listSessionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listQuerySchema.parse(req.query)
    const sessions = await listSessions(req.user!.id, {
      academicYear: filters.academicYear,
      semester: filters.semester,
      status: filters.status,
      today: filters.today || undefined,
      date: filters.date,
    })
    ok(res, { sessions })
  } catch (e) {
    next(e)
  }
}

export async function listFacultySessionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listQuerySchema.parse(req.query)
    const facultyId = req.user!.facultyId
    if (!facultyId) {
      ok(res, { sessions: [] })
      return
    }
    const sessions = await listSessionsForFaculty(facultyId, {
      academicYear: filters.academicYear,
      semester: filters.semester,
      status: filters.status,
      today: filters.today || undefined,
      date: filters.date,
    })
    ok(res, { sessions })
  } catch (e) {
    next(e)
  }
}

export async function getSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await getSession(req.params.sessionId, {
      id: req.user!.id,
      role: req.user!.role,
      facultyId: req.user!.facultyId ?? null,
    })
    ok(res, { session })
  } catch (e) {
    next(e)
  }
}

export async function getLiveSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const live = await getLiveSession(req.params.sessionId, req.user!.id)
    ok(res, live)
  } catch (e) {
    next(e)
  }
}

export async function closeSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await closeSession(req.params.sessionId, req.user!.id)
    await evaluateAttendanceAlerts(
      result.session.courseUnitId,
      result.session.academicYear,
      result.session.semester
    )
    ok(res, { message: 'Session closed', ...result })
  } catch (e) {
    next(e)
  }
}

export async function reopenSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await reopenSession(req.params.sessionId, req.user!.id)
    ok(res, { message: 'Session reopened', session })
  } catch (e) {
    next(e)
  }
}

export async function extendSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const minutes = z.coerce.number().int().min(1).max(60).parse(req.body?.minutes ?? 5)
    const session = await extendSessionTime(req.params.sessionId, req.user!.id, minutes)
    ok(res, { message: 'Session time extended', session })
  } catch (e) {
    next(e)
  }
}
