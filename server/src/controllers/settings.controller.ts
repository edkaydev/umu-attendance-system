import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { ApiError } from '../utils/apiResponse'
import {
  getProfileEditingSettings,
  setSetting,
  PROFILE_EDITING_KEYS,
  ProfileEditingScope,
  ProfileEditingSettings,
} from '../services/settings.service'

export const profileEditingSchema = z.object({
  students: z.boolean().optional(),
  lecturers: z.boolean().optional(),
  admins: z.boolean().optional(),
})

const SCOPE_LABEL: Record<ProfileEditingScope, string> = {
  students: 'Students',
  lecturers: 'Lecturers',
  admins: 'Faculty Admins',
}

/** GET /api/settings/profile-editing — current state (any authenticated user). */
export async function getProfileEditing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    ok(res, { enabled: await getProfileEditingSettings() })
  } catch (e) {
    next(e)
  }
}

/** PATCH /api/settings/profile-editing — System Admin toggles per-scope editing. */
export async function setProfileEditing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const updates = profileEditingSchema.parse(req.body) as Partial<ProfileEditingSettings>
    const scopes = Object.keys(updates) as ProfileEditingScope[]
    if (scopes.length === 0) {
      throw new ApiError('Provide at least one of: students, lecturers, admins', 400)
    }

    for (const scope of scopes) {
      await setSetting(PROFILE_EDITING_KEYS[scope], String(updates[scope]))
    }

    const enabled = await getProfileEditingSettings()
    const changed = scopes.map((s) => `${SCOPE_LABEL[s]} ${updates[s] ? 'enabled' : 'disabled'}`).join(', ')
    ok(res, { enabled, message: changed })
  } catch (e) {
    next(e)
  }
}
