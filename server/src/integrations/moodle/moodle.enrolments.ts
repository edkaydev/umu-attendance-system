/**
 * Moodle enrolment API — read-only.
 *
 * Wraps the Moodle web service functions that return enrolment/membership data.
 * No writes to Moodle. No writes to the Attendance database.
 *
 * Functions implemented:
 *   core_enrol_get_enrolled_users  — roster of users enrolled in a course
 *   core_enrol_get_users_courses   — courses a specific user is enrolled in
 *
 * Role shorthands used by UMU sync:
 *   "student"        → Role.student
 *   "editingteacher" → Role.lecturer
 *   "teacher"        → Role.lecturer
 *   "manager"        → skipped (never synced as student/lecturer)
 *   "coursecreator"  → skipped
 */

import { z } from 'zod'
import { callMoodle } from './moodle.client'
import type {
  MoodleEnrolledUser,
  MoodleEnrolledUsersResponse,
  MoodleUserCourse,
  MoodleUserCoursesResponse,
} from './moodle.types'
import { ApiError } from '../../utils/apiResponse'

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const RoleSchema = z.object({
  roleid: z.number(),
  name: z.string(),
  shortname: z.string(),
  sortorder: z.number(),
})

const MoodleEnrolledUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  fullname: z.string(),
  email: z.string(),
  idnumber: z.string().optional(),
  auth: z.string().optional(),
  suspended: z.number().optional(),
  roles: z.array(RoleSchema).optional(),
  enrolledcourses: z
    .array(z.object({ id: z.number(), fullname: z.string(), shortname: z.string() }))
    .optional(),
})

const MoodleEnrolledUsersResponseSchema = z.array(MoodleEnrolledUserSchema)

const MoodleUserCourseSchema = z.object({
  id: z.number().int().positive(),
  shortname: z.string(),
  fullname: z.string(),
  enrolledusercount: z.number().optional(),
  idnumber: z.string().optional(),
  visible: z.number().optional(),
  roles: z.array(RoleSchema).optional(),
})

const MoodleUserCoursesResponseSchema = z.array(MoodleUserCourseSchema)

// ─── core_enrol_get_enrolled_users ───────────────────────────────────────────

/** Options supported by core_enrol_get_enrolled_users. */
export interface EnrolledUsersOptions {
  /**
   * Return only users with this role shortname.
   * e.g. 'student' | 'editingteacher' | 'teacher'
   * Omit to return all enrolled users regardless of role.
   *
   * NOTE: Moodle's actual option key is 'withcapability' or filter by role —
   * filtering by role shortname post-fetch is more reliable across Moodle
   * versions. This option is therefore applied client-side, not as a Moodle
   * parameter.
   */
  roleShortname?: string
  /** Page offset for pagination (default 0). */
  page?: number
  /** Page size (default 0 = all). Use 250 for large courses. */
  perPage?: number
}

/**
 * Fetch the list of enrolled users for a Moodle course.
 *
 * @param moodleCourseId  Moodle course id (mdl_course.id)
 * @param options         Pagination and optional role filter
 *
 * Pagination: Moodle supports `options[limitfrom]` and `options[limitnumber]`.
 * For most UMU courses a single page suffices. Use perPage + page for large
 * cohorts if needed.
 *
 * REQUIRES ICT CONFIGURATION:
 *   Service account needs enrol/manual:enrol or moodle/course:viewparticipants
 *   capability at course context (Manager role at system context covers this).
 */
export async function fetchEnrolledUsers(
  moodleCourseId: number,
  options: EnrolledUsersOptions = {}
): Promise<MoodleEnrolledUser[]> {
  const { page = 0, perPage = 0 } = options

  const params: Record<string, string | number | boolean> = {
    courseid: moodleCourseId,
  }

  if (perPage > 0) {
    params['options[limitfrom]'] = page * perPage
    params['options[limitnumber]'] = perPage
  }

  const raw = await callMoodle<MoodleEnrolledUsersResponse>(
    'core_enrol_get_enrolled_users',
    params
  )

  const parsed = MoodleEnrolledUsersResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      `Moodle enrolled-users response for course ${moodleCourseId} has unexpected shape`,
      502,
      'MOODLE_INVALID_RESPONSE'
    )
  }

  const users = parsed.data

  // Apply client-side role filter if requested.
  if (options.roleShortname) {
    const target = options.roleShortname
    return users.filter((u) =>
      u.roles?.some((r) => r.shortname === target)
    )
  }

  return users
}

// ─── core_enrol_get_users_courses ─────────────────────────────────────────────

/**
 * Fetch all courses a specific Moodle user is enrolled in.
 *
 * @param moodleUserId  Moodle user id (mdl_user.id)
 *
 * Returns each course with the user's role(s) inside it, allowing the caller
 * to determine whether the user is enrolled as a student, teacher, etc.
 *
 * REQUIRES ICT CONFIGURATION:
 *   The service account must be able to view the target user's course list.
 *   Manager role at system context satisfies this.
 */
export async function fetchUserCourses(
  moodleUserId: number
): Promise<MoodleUserCourse[]> {
  const raw = await callMoodle<MoodleUserCoursesResponse>(
    'core_enrol_get_users_courses',
    { userid: moodleUserId }
  )

  const parsed = MoodleUserCoursesResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      `Moodle user-courses response for user ${moodleUserId} has unexpected shape`,
      502,
      'MOODLE_INVALID_RESPONSE'
    )
  }

  // Filter out the site course (id === 1).
  return parsed.data.filter((c) => c.id !== 1)
}
