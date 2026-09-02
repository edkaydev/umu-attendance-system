import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { submitExcuse, approveExcuse, rejectExcuse } from '../services/excuse.service'

const submitSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.string().min(1, 'A reason is required').max(500),
})

export async function submitExcuseController(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId, reason } = submitSchema.parse(req.body)
    const excuse = await submitExcuse(req.user!.id, sessionId, reason)
    ok(res, { message: 'Excuse request submitted', excuse })
  } catch (e) {
    next(e)
  }
}

export async function approveExcuseController(req: Request, res: Response, next: NextFunction) {
  try {
    await approveExcuse(req.params.excuseId, req.user!.id)
    ok(res, { message: 'Excuse approved — student marked as excused' })
  } catch (e) {
    next(e)
  }
}

export async function rejectExcuseController(req: Request, res: Response, next: NextFunction) {
  try {
    await rejectExcuse(req.params.excuseId, req.user!.id)
    ok(res, { message: 'Excuse rejected — student marked as absent' })
  } catch (e) {
    next(e)
  }
}
