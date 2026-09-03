/**
 * Current-period resolver for the Moodle academic hierarchy.
 *
 * Pure logic — no DB, no network. Given a parsed CategoryTree and the explicit
 * Moodle current-period configuration, it resolves the exact Moodle category
 * nodes that represent the Attendance "current period", or returns a clear,
 * actionable error.
 *
 * WHY this is explicit (never guessed):
 *   The Moodle instance has multiple parallel and historical trees with
 *   duplicate names and visible=1 nodes. Picking a period from category names,
 *   visibility, depth, or dates would silently map attendance onto the wrong
 *   academic node. Therefore a verified Moodle SEMESTER category id is required.
 */

import type { CategoryNode, CategoryTree } from './moodle-category-tree'
import type { MoodleCurrentPeriodConfig } from '../../services/settings.service'

export interface ResolvedMoodlePeriod {
  /** The resolved Moodle semester category node. */
  semester: CategoryNode
  /** The semester's own academic-year ancestor, when one can be determined. */
  academicYear: CategoryNode | null
  /** Attendance semester number (1 or 2) from the config. */
  semesterNumber: number
  /** Optional display label for the academic year. */
  academicYearName: string | null
}

export type ResolvePeriodResult =
  | { ok: true; period: ResolvedMoodlePeriod }
  | { ok: false; error: string }

function findByBigIntId(root: CategoryNode, id: bigint): CategoryNode | null {
  if (root.id === id) return root
  for (const child of root.children) {
    const found = findByBigIntId(child, id)
    if (found) return found
  }
  return null
}

/** Walk up from a node to find the nearest academic-year ancestor (if any). */
function findAcademicYearAncestor(node: CategoryNode, root: CategoryNode): CategoryNode | null {
  let current = node
  while (current.parent !== root.id && current.parent !== 0n) {
    const parent = findNodeInTree(root, current.parent)
    if (!parent) return null
    if (parent.role === 'academic-year') return parent
    current = parent
  }
  return node.role === 'academic-year' ? node : null
}

function findNodeInTree(root: CategoryNode, id: bigint): CategoryNode | null {
  return findByBigIntId(root, id)
}

/**
 * Resolve the configured Moodle current period against a parsed tree.
 *
 * Semantics:
 *   - `semesterId` is REQUIRED. Without it the resolver refuses to guess and
 *     returns an error telling the admin to configure a verified semester id.
 *   - `academicYearId`, when provided, is cross-checked against the resolved
 *     semester's academic-year ancestor; a mismatch is an error.
 */
export function resolveMoodleCurrentPeriod(
  tree: CategoryTree,
  config: MoodleCurrentPeriodConfig
): ResolvePeriodResult {
  if (config.semesterId === null) {
    return {
      ok: false,
      error:
        'Moodle current period is not configured: no semester category id is set. ' +
        'Set moodle.current.semesterId to a verified Moodle semester category id (and ' +
        'optionally moodle.current.academicYearId) before running the sync.',
    }
  }

  const semester = findNodeInTree(tree.root, config.semesterId)
  if (!semester) {
    return {
      ok: false,
      error: `Configured Moodle semester category id ${config.semesterId} was not found in the parsed Moodle category tree. Please verify the id against the current Moodle hierarchy.`,
    }
  }
  if (semester.role !== 'semester') {
    return {
      ok: false,
      error: `Configured Moodle category id ${config.semesterId} ("${semester.name}") is role "${semester.role}", not "semester". Verify the id points at the current teaching semester.`,
    }
  }

  const academicYear = findAcademicYearAncestor(semester, tree.root)

  if (config.academicYearId !== null) {
    if (!academicYear || academicYear.id !== config.academicYearId) {
      return {
        ok: false,
        error: `Configured Moodle academic-year id ${config.academicYearId} does not match the ancestor of semester ${config.semesterId} (${semester.name}). Semester ${config.semesterId} belongs to academic year ${academicYear ? academicYear.id + ' (' + academicYear.name + ')' : '(none)' }.`,
      }
    }
  }

  return {
    ok: true,
    period: {
      semester,
      academicYear,
      semesterNumber: config.semesterNumber,
      academicYearName: config.academicYearName,
    },
  }
}
