import { Request, Response, NextFunction } from 'express'
import { ok } from '../utils/apiResponse'
import {
  testMoodleConnection,
  getLastSyncStatus,
  runFullSync,
} from '../services/moodle-sync.service'
import { isMoodleConfigured, getMoodleConfig } from '../config/moodle'

/**
 * GET /api/moodle/config — configuration status (System Admin only).
 * Returns whether Moodle is configured, the base URL, and whether a token is
 * set (never the token itself). Safe to expose to authenticated admins.
 */
export async function getConfig(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const configured = isMoodleConfigured()
    if (!configured) {
      ok(res, { configured: false })
      return
    }
    const config = getMoodleConfig()
    ok(res, {
      configured: true,
      baseUrl: config.baseUrl,
      wsService: config.wsService,
      tokenSet: true,
    })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /api/moodle/test-connection — verify the Moodle token and return safe
 * site info without writing anything to the database.
 */
export async function testConnection(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await testMoodleConnection()
    ok(res, result)
  } catch (e) {
    next(e)
  }
}

/**
 * GET /api/moodle/sync-status — most recent sync run + summary.
 */
export async function getSyncStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    ok(res, await getLastSyncStatus())
  } catch (e) {
    next(e)
  }
}

/**
 * POST /api/moodle/sync — run a full Moodle → Attendance sync.
 * Requires a logged-in System Admin (actor) for the audit trail.
 */
export async function sync(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await runFullSync(req.user!.id)
    ok(res, result)
  } catch (e) {
    next(e)
  }
}
