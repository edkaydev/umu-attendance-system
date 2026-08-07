import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { checkIn, listLiveForStudent } from '../services/checkin.service'

const checkInSchema = z.object({
  code: z.string().min(1).max(10),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

export async function checkInController(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, lat, lng } = checkInSchema.parse(req.body)
    const location =
      lat !== undefined && lng !== undefined ? { lat, lng } : undefined
    const result = await checkIn(req.user!.id, code, location)
    ok(res, { message: 'Check-in successful', ...result })
  } catch (e) {
    next(e)
  }
}

export async function listLiveController(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await listLiveForStudent(req.user!.id)
    ok(res, { sessions })
  } catch (e) {
    next(e)
  }
}
