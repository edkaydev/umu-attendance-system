import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { listAuditLogs } from '../services/audit-log.service'

const querySchema = z.object({
  action:  z.string().max(50).optional(),
  userId:  z.string().uuid().optional(),
  from:    z.string().optional(),
  to:      z.string().optional(),
  page:    z.coerce.number().int().min(1).optional(),
  limit:   z.coerce.number().int().min(1).max(100).optional(),
})

export async function listAuditLogsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const filters = querySchema.parse(req.query)
    const result  = await listAuditLogs(filters, {
      role:      req.user!.role,
      facultyId: req.user!.facultyId,
    })
    ok(res, result)
  } catch (e) {
    next(e)
  }
}
