/**
 * Moodle course API — read-only.
 *
 * Wraps the Moodle web service functions that return course data.
 * No writes to Moodle. No writes to the Attendance database.
 *
 * Functions implemented:
 *   core_course_get_courses           — fetch all courses (or by ID list)
 *   core_course_get_courses_by_field  — fetch courses matching a field value
 */

import { z } from 'zod'
import { callMoodle } from './moodle.client'
import type {
  MoodleCourse,
  MoodleCoursesResponse,
  MoodleCoursesByFieldResponse,
} from './moodle.types'
import { ApiError } from '../../utils/apiResponse'

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const MoodleCourseSchema = z.object({
  id: z.number().int().positive(),
  shortname: z.string(),
  fullname: z.string(),
  displayname: z.string().optional(),
  categoryid: z.number().optional(),
  format: z.string().optional(),
  visible: z.number().optional(),
  timemodified: z.number().optional(),
  summary: z.string().optional(),
  idnumber: z.string().optional(),
})

const MoodleCoursesResponseSchema = z.array(MoodleCourseSchema)

const MoodleCoursesByFieldResponseSchema = z.object({
  courses: z.array(MoodleCourseSchema),
  warnings: z
    .array(z.object({ item: z.string().optional(), itemid: z.number().optional(), warningcode: z.string(), message: z.string() }))
    .optional(),
})

// ─── core_course_get_courses ──────────────────────────────────────────────────

/**
 * Fetch all courses visible to the service token, or a specific list by ID.
 *
 * @param ids  Optional array of Moodle course IDs to fetch.
 *             Pass an empty array or omit to fetch all courses.
 *
 * Note: fetching ALL courses on a large Moodle instance can be slow. Prefer
 * core_course_get_courses_by_field when matching a specific shortname.
 *
 * REQUIRES ICT CONFIGURATION:
 *   The service account must have moodle/course:view capability at system
 *   context to see all courses (not just those it is enrolled in).
 */
export async function fetchAllCourses(ids: number[] = []): Promise<MoodleCourse[]> {
  const params: Record<string, string | number | boolean> = {}
  ids.forEach((id, i) => {
    params[`options[ids][${i}]`] = id
  })

  const raw = await callMoodle<MoodleCoursesResponse>('core_course_get_courses', params)

  const parsed = MoodleCoursesResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      'Moodle courses response has unexpected shape',
      502,
      'MOODLE_INVALID_RESPONSE'
    )
  }

  // Exclude the Moodle "site course" (id === 1) — it is a system record,
  // not a real course, and has no enrolments of interest.
  return parsed.data.filter((c) => c.id !== 1)
}

// ─── core_course_get_courses_by_field ─────────────────────────────────────────

/**
 * Supported field names for core_course_get_courses_by_field.
 * Moodle accepts: id | category | shortname | idnumber
 */
export type MoodleCourseField = 'id' | 'category' | 'shortname' | 'idnumber'

/**
 * Fetch courses matching a single field/value pair.
 *
 * Useful for looking up a specific course unit by its shortname (which maps
 * to UMU's CourseUnit.code) without fetching the entire course catalogue.
 *
 * @param field  Field to match on
 * @param value  Value to match (single string — Moodle only accepts one value)
 *
 * REQUIRES ICT CONFIGURATION:
 *   Same capability as fetchAllCourses.
 */
export async function fetchCoursesByField(
  field: MoodleCourseField,
  value: string
): Promise<MoodleCourse[]> {
  const raw = await callMoodle<MoodleCoursesByFieldResponse>(
    'core_course_get_courses_by_field',
    { field, value }
  )

  const parsed = MoodleCoursesByFieldResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      'Moodle courses-by-field response has unexpected shape',
      502,
      'MOODLE_INVALID_RESPONSE'
    )
  }

  return parsed.data.courses.filter((c) => c.id !== 1)
}
