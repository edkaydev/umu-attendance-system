import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { listAlerts } from '../services/alert-list.service'

const listQuerySchema = z.object({
  status: z.enum(['active', 'resolved']).optional(),
  alertType: z.enum(['warning', 'critical']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export async function listAlertsController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listQuerySchema.parse(req.query)
    const result = await listAlerts(
      { id: req.user!.id, role: req.user!.role, facultyId: req.user!.facultyId ?? null },
      filters
    )
    ok(res, result)
  } catch (e) {
    next(e)
  }
}
