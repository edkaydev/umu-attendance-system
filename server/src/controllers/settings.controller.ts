import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { isProfileEditingEnabled, setSetting, PROFILE_EDITING_KEY } from '../services/settings.service'

export const profileEditingSchema = z.object({
  enabled: z.boolean(),
})

/** GET /api/settings/profile-editing — current state (any authenticated user). */
export async function getProfileEditing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { enabled: await isProfileEditingEnabled() })
  } catch (e) {
    next(e)
  }
}

/** PATCH /api/settings/profile-editing — System Admin toggles profile editing. */
export async function setProfileEditing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { enabled } = profileEditingSchema.parse(req.body)
    await setSetting(PROFILE_EDITING_KEY, String(enabled))
    ok(res, { enabled, message: enabled ? 'Profile editing enabled' : 'Profile editing disabled' })
  } catch (e) {
    next(e)
  }
}
