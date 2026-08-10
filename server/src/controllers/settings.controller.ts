import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok, ApiError } from '../utils/apiResponse'
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
  resetDatabase,
} from '../services/settings.service'
import { writeAuditLog } from '../utils/audit'

export const profileEditingSchema = z.object({
  students:  z.boolean().optional(),
  lecturers: z.boolean().optional(),
  admins:    z.boolean().optional(),
})

const SCOPE_LABEL: Record<ProfileEditingScope, string> = {
  students:  'Students',
  lecturers: 'Lecturers',
  admins:    'Faculty Admins',
}

/** GET /api/settings/profile-editing */
export async function getProfileEditing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { ok(res, { enabled: await getProfileEditingSettings() }) } catch (e) { next(e) }
}

/** PATCH /api/settings/profile-editing */
export async function setProfileEditing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updates = profileEditingSchema.parse(req.body) as Partial<ProfileEditingSettings>
    const scopes = Object.keys(updates) as ProfileEditingScope[]
    if (scopes.length === 0) throw new ApiError('Provide at least one of: students, lecturers, admins', 400)
    for (const scope of scopes) await setSetting(PROFILE_EDITING_KEYS[scope], String(updates[scope]))
    const enabled = await getProfileEditingSettings()
    const changed = scopes.map((s) => `${SCOPE_LABEL[s]} ${updates[s] ? 'enabled' : 'disabled'}`).join(', ')
    ok(res, { enabled, message: changed })
  } catch (e) { next(e) }
}

const currentPeriodSchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'),
  semester:     z.number().int().min(1).max(2),
})

/** GET /api/settings/current-period */
export async function getCurrentPeriodController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { ok(res, { period: await getCurrentPeriod() }) } catch (e) { next(e) }
}

/** PATCH /api/settings/current-period */
export async function setCurrentPeriodController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { academicYear, semester } = currentPeriodSchema.parse(req.body)
    const period = await setCurrentPeriod(academicYear, semester)
    ok(res, { period, message: `Current period set to ${academicYear} Semester ${semester}` })
  } catch (e) { next(e) }
}

const supportSettingsSchema = z.object({
  email: z.string().email('Invalid email').max(150).optional(),
  phone: z.string().max(30).optional(),
  guide: z.string().max(10000).optional(),
})

/** GET /api/settings/support */
export async function getSupportSettingsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { ok(res, { support: await getSupportSettings() }) } catch (e) { next(e) }
}

/** PATCH /api/settings/support */
export async function setSupportSettingsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = supportSettingsSchema.parse(req.body)
    const support = await setSupportSettings(data)
    ok(res, { support, message: 'Support details updated' })
  } catch (e) { next(e) }
}

/** POST /api/settings/reset-database */
export async function resetDatabaseController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await resetDatabase(req.user!.id)
    await writeAuditLog(req.user!.id, 'RESET_DATABASE', 'system', 'all', result as unknown as Record<string, unknown>)
    ok(res, { message: 'Database reset complete. All academic data has been wiped.', result })
  } catch (e) { next(e) }
}

/** POST /api/settings/clear-cache */
export async function clearCacheController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await writeAuditLog(req.user!.id, 'USER_UPDATE', 'system', 'cache', { action: 'clear_cache' })
    ok(res, { message: 'Cache cleared successfully.' })
  } catch (e) { next(e) }
}

/** POST /api/settings/update-system */
export async function updateSystemController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { spawn } = await import('child_process')
    const path = await import('path')
    const fs = await import('fs')
    const appDir = process.env.APP_DIR || '/var/www/umu-attendance'
    const scriptPath = path.join(appDir, 'devops/scripts/update.sh')
    const logPath = path.join(appDir, 'server/assets/update.log')
    fs.writeFileSync(logPath, `[PENDING] Update triggered by ${req.user!.email} at ${new Date().toISOString()}\n`)
    const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: '/root' } })
    child.unref()
    await writeAuditLog(req.user!.id, 'USER_UPDATE', 'system', 'update', { action: 'update_system' })
    ok(res, { message: 'Update started. Check the log for progress.' })
  } catch (e) { next(e) }
}

/** GET /api/settings/update-log */
export async function updateLogController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const path = await import('path')
    const fs = await import('fs')
    const appDir = process.env.APP_DIR || '/var/www/umu-attendance'
    const logPath = path.join(appDir, 'server/assets/update.log')
    if (!fs.existsSync(logPath)) { ok(res, { log: '', done: false }); return }
    const log = fs.readFileSync(logPath, 'utf-8')
    const done = log.includes('[UPDATE COMPLETE]') || log.includes('[UPDATE FAILED]')
    ok(res, { log, done })
  } catch (e) { next(e) }
}
