/**
 * Moodle user API — read-only.
 *
 * Wraps the Moodle web service functions that return user data.
 * No writes to Moodle. No writes to the Attendance database.
 *
 * Functions implemented:
 *   core_webservice_get_site_info   — verify token, return safe site info
 *   core_user_get_users_by_field    — look up users by a single field
 */

import { z } from 'zod'
import { callMoodle } from './moodle.client'
import type {
  MoodleSiteInfo,
  MoodleUser,
  MoodleUsersResponse,
} from './moodle.types'
import { ApiError } from '../../utils/apiResponse'

// ─── Zod schemas for response validation ─────────────────────────────────────
// These are intentionally lenient on optional fields — we validate the fields
// we actually consume rather than every field Moodle may or may not return.

const MoodleSiteInfoSchema = z.object({
  sitename: z.string(),
  siteurl: z.string().url(),
  username: z.string(),
  userfullname: z.string(),
  userid: z.number().int(),
  version: z.string(),
  release: z.string(),
  functions: z.array(z.object({ name: z.string(), version: z.string() })),
})

const MoodleUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  fullname: z.string(),
  email: z.string(),
  auth: z.string().optional(),
  confirmed: z.number().optional(),
  suspended: z.number().optional(),
  idnumber: z.string().optional(),
  institution: z.string().optional(),
  department: z.string().optional(),
  customfields: z
    .array(z.object({ type: z.string(), value: z.string(), name: z.string(), shortname: z.string() }))
    .optional(),
  roles: z
    .array(z.object({ roleid: z.number(), name: z.string(), shortname: z.string(), sortorder: z.number() }))
    .optional(),
})

const MoodleUsersResponseSchema = z.array(MoodleUserSchema)

// ─── core_webservice_get_site_info ────────────────────────────────────────────

/**
 * Calls core_webservice_get_site_info and returns a safe subset of site info.
 *
 * Used to verify that the configured token is valid and the web service is
 * reachable. Returns only fields safe to include in API responses (no token,
 * no internal paths).
 */
export async function fetchSiteInfo(): Promise<{
  siteName: string
  siteUrl: string
  release: string
  version: string
  serviceUsername: string
  availableFunctions: string[]
}> {
  const raw = await callMoodle<MoodleSiteInfo>('core_webservice_get_site_info')

  const parsed = MoodleSiteInfoSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      'Moodle site info response has unexpected shape',
      502,
      'MOODLE_INVALID_RESPONSE'
    )
  }

  const data = parsed.data
  return {
    siteName: data.sitename,
    siteUrl: data.siteurl,
    release: data.release,
    version: data.version,
    serviceUsername: data.username,
    availableFunctions: data.functions.map((f) => f.name),
  }
}

// ─── core_user_get_users_by_field ─────────────────────────────────────────────

/**
 * Supported field names for core_user_get_users_by_field.
 * Moodle accepts: id | idnumber | username | email
 * We support the subset used by the UMU sync.
 */
export type MoodleUserField = 'id' | 'idnumber' | 'username' | 'email'

/**
 * Fetch one or more Moodle users by a specific field.
 *
 * @param field   The field to match on (e.g. 'email', 'idnumber')
 * @param values  Array of values to look up (1–50 items recommended)
 *
 * Moodle returns only users visible to the token's account.
 * Suspended or deleted users may be omitted depending on capabilities.
 *
 * REQUIRES ICT CONFIGURATION:
 *   The umu_attendance_sync service must include core_user_get_users_by_field
 *   and the service account must have the moodle/user:viewdetails capability.
 */
export async function fetchUsersByField(
  field: MoodleUserField,
  values: string[]
): Promise<MoodleUser[]> {
  if (values.length === 0) return []

  // Moodle expects indexed array parameters:
  //   field=email&values[0]=a@b.com&values[1]=c@d.com
  const params: Record<string, string | number | boolean> = { field }
  values.forEach((v, i) => {
    params[`values[${i}]`] = v
  })

  const raw = await callMoodle<MoodleUsersResponse>(
    'core_user_get_users_by_field',
    params
  )

  const parsed = MoodleUsersResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      'Moodle users response has unexpected shape',
      502,
      'MOODLE_INVALID_RESPONSE'
    )
  }

  return parsed.data
}
