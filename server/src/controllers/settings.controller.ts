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
  getCurrentPeriod,
  setCurrentPeriod,
  getSupportSettings,
  setSupportSettings,
} from '../services/settings.service'
import { writeAuditLog } from '../utils/audit'

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

const currentPeriodSchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'),
  semester: z.number().int().min(1).max(2),
})

/** GET /api/settings/current-period — any authenticated user */
export async function getCurrentPeriodController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    ok(res, { period: await getCurrentPeriod() })
  } catch (e) {
    next(e)
  }
}

/** PATCH /api/settings/current-period — System Admin only */
export async function setCurrentPeriodController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { academicYear, semester } = currentPeriodSchema.parse(req.body)
    const period = await setCurrentPeriod(academicYear, semester)
    ok(res, { period, message: `Current period set to ${academicYear} Semester ${semester}` })
  } catch (e) {
    next(e)
  }
}

const supportSettingsSchema = z.object({
  email: z.string().email('Invalid email').max(150).optional(),
  phone: z.string().max(30).optional(),
  guide: z.string().max(10000).optional(),
})

/** GET /api/settings/support — support contacts + user guide (any authenticated user). */
export async function getSupportSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    ok(res, { support: await getSupportSettings() })
  } catch (e) {
    next(e)
  }
}

/** PATCH /api/settings/support — System Admin edits support contacts + user guide. */
export async function setSupportSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = supportSettingsSchema.parse(req.body)
    const support = await setSupportSettings(data)
    ok(res, { support, message: 'Support details updated' })
  } catch (e) {
    next(e)
  }
}

/** POST /api/settings/clear-cache — System Admin only.
 *  Signals the server is fresh; the client clears its own PWA/browser caches. */
export async function clearCacheController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await writeAuditLog(req.user!.id, 'USER_UPDATE', 'system', 'cache', { action: 'clear_cache' })
    ok(res, { message: 'Cache cleared successfully.' })
  } catch (e) {
    next(e)
  }
}
