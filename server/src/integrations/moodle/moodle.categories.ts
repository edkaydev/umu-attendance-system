/**
 * Moodle category API — read-only.
 *
 * Wraps the Moodle web service functions that return category data
 * (the academic hierarchy). No writes to Moodle. No writes to Attendance.
 *
 * Functions implemented:
 *   core_course_get_categories  — fetch the category tree (all, or by id)
 *
 * Category IDs (mdl_course_categories.id) are the authoritative external
 * identity for the academic hierarchy. See moodle-category-tree.ts for how
 * the flat list is turned into a tree and interpreted.
 */

import { z } from 'zod'
import { callMoodle } from './moodle.client'
import type { MoodleCategoriesResponse } from './moodle.types'
import { ApiError } from '../../utils/apiResponse'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const MoodleCategorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  idnumber: z.string().optional(),
  parent: z.number().int(),
  coursecount: z.number().optional(),
  visible: z.number(),
  depth: z.number().int().positive(),
  path: z.string(),
  timemodified: z.number().optional(),
  sortorder: z.number().optional(),
})

const MoodleCategoriesResponseSchema = z.array(MoodleCategorySchema)

/** Options supported by core_course_get_categories. */
export interface CategoriesOptions {
  /** Restrict to a specific category id (default: all). */
  categoryId?: number
  /** Include all root categories when true (core_course_get_categories default). */
  addsubcategories?: boolean
}

/**
 * Fetch the Moodle category hierarchy.
 *
 * @param options Optional id / addsubcategories filter.
 *
 * REQUIRES ICT CONFIGURATION:
 *   The service account must have moodle/category:viewhiddencategories
 *   and moodle/course:visibility capabilities (Manager at system context)
 *   to see hidden (historical) categories and full visibility flags.
 */
export async function fetchCategories(
  options: CategoriesOptions = {}
): Promise<MoodleCategoriesResponse> {
  const params: Record<string, string | number | boolean> = {}

  if (options.categoryId !== undefined) {
    params['criteria[0][key]'] = 'id'
    params['criteria[0][value]'] = options.categoryId
  }

  // core_course_get_categories fetches all categories by default. To reliably
  // build the full tree (including the configured root and its descendants)
  // we request everything; filters are applied by the tree builder.
  if (options.addsubcategories !== undefined) {
    params['addsubcategories'] = options.addsubcategories ? 1 : 0
  }

  const raw = await callMoodle<MoodleCategoriesResponse>(
    'core_course_get_categories',
    params
  )

  const parsed = MoodleCategoriesResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      'Moodle categories response has unexpected shape',
      502,
      'MOODLE_INVALID_RESPONSE'
    )
  }

  return parsed.data
}
