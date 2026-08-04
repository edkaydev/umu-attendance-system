import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { checkIn } from '../services/checkin.service'

const checkInSchema = z.object({
  code: z.string().min(1).max(10),
})

export async function checkInController(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = checkInSchema.parse(req.body)
    const result = await checkIn(req.user!.id, code)
    ok(res, { message: 'Check-in successful', ...result })
  } catch (e) {
    next(e)
  }
}
