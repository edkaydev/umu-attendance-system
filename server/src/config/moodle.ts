/**
 * Moodle integration configuration.
 *
 * Reads environment variables at module load time and exposes a typed
 * config object. The token is NEVER logged, returned by any API, or
 * exposed to the frontend — it is held in memory server-side only.
 *
 * Required environment variables:
 *   MOODLE_BASE_URL    Base URL of the Moodle instance (no trailing slash)
 *                      e.g. https://moodle.umu.ac.ug
 *   MOODLE_WS_TOKEN    Permanent web service token issued by Moodle
 *
 * Optional:
 *   MOODLE_WS_SERVICE  Web service shortname (default: umu_attendance_sync)
 *
 * If MOODLE_BASE_URL or MOODLE_WS_TOKEN are absent the application still
 * starts. isMoodleConfigured() returns false and getMoodleConfig() throws
 * a clear 503 error so sync endpoints fail informatively rather than
 * silently making misconfigured requests.
 */

import { ApiError } from '../utils/apiResponse'

export interface MoodleConfig {
  /** Base URL, trailing slash stripped. e.g. https://moodle.umu.ac.ug */
  readonly baseUrl: string
  /**
   * Web service token.
   * NEVER log, return from any API, expose to the frontend, or commit.
   */
  readonly wsToken: string
  /** Web service shortname registered in Moodle. */
  readonly wsService: string
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs: number
  /** Maximum number of attempts per call (1 = no retry). */
  readonly maxAttempts: number
}

function loadConfig(): MoodleConfig | null {
  const baseUrl = process.env.MOODLE_BASE_URL?.replace(/\/+$/, '').trim()
  const wsToken = process.env.MOODLE_WS_TOKEN?.trim()
  const wsService = (process.env.MOODLE_WS_SERVICE?.trim()) || 'umu_attendance_sync'

  if (!baseUrl || !wsToken) {
    return null
  }

  return Object.freeze({
    baseUrl,
    wsToken,
    wsService,
    timeoutMs: 30_000,
    maxAttempts: 3,
  })
}

// Evaluated once at module load — not re-read on each call.
const _config: MoodleConfig | null = loadConfig()

/**
 * Returns the active Moodle config, or throws ApiError 503 if the required
 * environment variables are not set. Call this inside service functions that
 * need a live Moodle connection.
 */
export function getMoodleConfig(): MoodleConfig {
  if (_config === null) {
    throw new ApiError(
      'Moodle integration is not configured on this server. ' +
        'Set MOODLE_BASE_URL and MOODLE_WS_TOKEN in the server environment.',
      503,
      'MOODLE_NOT_CONFIGURED'
    )
  }
  return _config
}

/** Returns true when both required Moodle env vars are present. */
export function isMoodleConfigured(): boolean {
  return _config !== null
}
