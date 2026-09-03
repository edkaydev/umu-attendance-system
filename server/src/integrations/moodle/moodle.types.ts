/**
 * TypeScript types for Moodle REST API responses.
 *
 * These types reflect the actual JSON shapes returned by the Moodle web
 * service functions used by the UMU Attendance sync. They are intentionally
 * permissive on optional fields — Moodle versions and capability levels may
 * omit fields that are documented as present. All fields that the sync logic
 * actually consumes are typed as required; ancillary fields are typed as
 * optional or unknown.
 *
 * Source: Moodle REST API (tested against the umu_attendance_sync service
 * defined in devops/scripts/moodle/setup-webservice.php).
 *
 * NOTE: Moodle returns numeric IDs as JSON numbers. JavaScript JSON.parse
 * can represent integers up to Number.MAX_SAFE_INTEGER (2^53 - 1) precisely.
 * Moodle IDs are BIGINT in MySQL but in practice stay far below 2^53, so
 * plain number is safe here. We store them as Prisma BigInt (server/prisma/
 * schema.prisma) to match the source column type.
 */

// ─── Shared ──────────────────────────────────────────────────────────────────

/**
 * Moodle wraps some API errors as HTTP 200 with this shape instead of a
 * non-200 status code. The client detects and rejects these responses.
 */
export interface MoodleException {
  exception: string   // e.g. "moodle_exception", "invalid_parameter_exception"
  errorcode: string   // e.g. "invalidtoken", "accessdenied"
  message: string     // Human-readable (may contain sensitive context — logged at debug only)
  debuginfo?: string  // Extra detail in developer mode (never forwarded to clients)
}

/** Type-guard: true when the value looks like a Moodle exception object. */
export function isMoodleException(value: unknown): value is MoodleException {
  return (
    typeof value === 'object' &&
    value !== null &&
    'exception' in value &&
    'errorcode' in value &&
    typeof (value as MoodleException).exception === 'string' &&
    typeof (value as MoodleException).errorcode === 'string'
  )
}

// ─── core_webservice_get_site_info ───────────────────────────────────────────

/** Response from core_webservice_get_site_info. */
export interface MoodleSiteInfo {
  sitename: string
  siteurl: string
  username: string
  userfullname: string
  userid: number
  /** Moodle version string, e.g. "2024042200" */
  version: string
  /** Human-readable release, e.g. "Moodle 5.0.2+" */
  release: string
  /** Functions available to this token */
  functions: Array<{ name: string; version: string }>
}

// ─── core_user_get_users_by_field ─────────────────────────────────────────────

/** A single Moodle user as returned by core_user_get_users_by_field. */
export interface MoodleUser {
  id: number
  username: string
  firstname: string
  lastname: string
  fullname: string
  email: string
  /** e.g. "manual", "googleoauth2", "ldap" */
  auth?: string
  /** 0 = not confirmed, 1 = confirmed */
  confirmed?: number
  /** 0 = active, 1 = suspended */
  suspended?: number
  /** Moodle idnumber — matches UMU regNumber when populated */
  idnumber?: string
  /** User's institution field */
  institution?: string
  /** User's department field */
  department?: string
  /** Custom profile field values, if requested */
  customfields?: Array<{ type: string; value: string; name: string; shortname: string }>
  /** User's roles at system context (not course-level) */
  roles?: Array<{ roleid: number; name: string; shortname: string; sortorder: number }>
}

/** Response wrapper: core_user_get_users_by_field returns a plain array. */
export type MoodleUsersResponse = MoodleUser[]

// ─── core_course_get_categories ───────────────────────────────────────────────

/**
 * A single Moodle category as returned by core_course_get_categories.
 *
 * Category IDs are the authoritative external identity for the academic
 * hierarchy (Campus → Faculty → Level → Academic Year → Programme →
 * Programme Year → Semester). Names are duplicated across the messy UMU
 * database, so they are display metadata only — never merged by name.
 *
 * `parent` is the category id of the parent node, and `0` represents
 * Moodle's top-level root. `path` is the slash-delimited ancestor chain
 * (e.g. "/2/3/61"), `depth` its length. `visible` distinguishes the active
 * tree (1) from historical/old trees (0).
 */
export interface MoodleCategory {
  id: number
  name: string
  idnumber?: string
  /** Parent category id; 0 = top-level root. */
  parent: number
  /** Number of direct course children. */
  coursecount?: number
  /** 1 = visible (active tree), 0 = hidden (historical tree). */
  visible: number
  /** Row depth starting at 1 for direct children of the root. */
  depth: number
  /** Ancestor chain, e.g. "/2/3/61". */
  path: string
  timemodified?: number
  sortorder?: number
}

/** Response from core_course_get_categories — plain array of categories. */
export type MoodleCategoriesResponse = MoodleCategory[]

// ─── core_course_get_courses ──────────────────────────────────────────────────

/** A single Moodle course as returned by core_course_get_courses. */
export interface MoodleCourse {
  id: number
  shortname: string
  fullname: string
  displayname?: string
  /** Category id */
  categoryid?: number
  /** e.g. "topics", "weeks" */
  format?: string
  visible?: number
  /** Timestamp of last modification */
  timemodified?: number
  /** Course summary */
  summary?: string
  idnumber?: string
}

/**
 * Response from core_course_get_courses.
 * Returns an array of course objects directly (not wrapped).
 */
export type MoodleCoursesResponse = MoodleCourse[]

// ─── core_course_get_courses_by_field ─────────────────────────────────────────

/**
 * Response from core_course_get_courses_by_field.
 * The courses are inside a `courses` key.
 */
export interface MoodleCoursesByFieldResponse {
  courses: MoodleCourse[]
  warnings?: MoodleWarning[]
}

// ─── core_enrol_get_enrolled_users ────────────────────────────────────────────

/**
 * A user as returned inside core_enrol_get_enrolled_users.
 * Shares most fields with MoodleUser but roles are course-context roles.
 */
export interface MoodleEnrolledUser {
  id: number
  username: string
  firstname: string
  lastname: string
  fullname: string
  email: string
  idnumber?: string
  auth?: string
  suspended?: number
  /** Course-context roles for this user */
  roles?: Array<{
    roleid: number
    name: string
    shortname: string  // e.g. "student", "editingteacher", "teacher"
    sortorder: number
  }>
  /** Enrolment method details */
  enrolledcourses?: Array<{ id: number; fullname: string; shortname: string }>
}

/** Response from core_enrol_get_enrolled_users — plain array. */
export type MoodleEnrolledUsersResponse = MoodleEnrolledUser[]

// ─── core_enrol_get_users_courses ─────────────────────────────────────────────

/**
 * A course as returned by core_enrol_get_users_courses.
 * Lighter shape than MoodleCourse — fewer fields are guaranteed present.
 */
export interface MoodleUserCourse {
  id: number
  shortname: string
  fullname: string
  enrolledusercount?: number
  idnumber?: string
  visible?: number
  /** User's roles in this course */
  roles?: Array<{ roleid: number; name: string; shortname: string; sortorder: number }>
}

/** Response from core_enrol_get_users_courses — plain array. */
export type MoodleUserCoursesResponse = MoodleUserCourse[]

// ─── Shared warning type ──────────────────────────────────────────────────────

/** Moodle warning object (non-fatal notice inside a successful response). */
export interface MoodleWarning {
  item?: string
  itemid?: number
  warningcode: string
  message: string
}
