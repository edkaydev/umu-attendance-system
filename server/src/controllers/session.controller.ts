import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import {
  openSession,
  listSessions,
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
  mode: z.enum(['physical', 'online']).optional(),
  startsAt: z.string().datetime().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'),
  semester: z.number().int().min(1).max(2),
})

const listQuerySchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  status: z.enum(['open', 'closed']).optional(),
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
    const sessions = await listSessions(req.user!.id, filters)
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
