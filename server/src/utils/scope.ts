import { ApiError } from './apiResponse'
import { Actor } from './actor'

/** Faculty ownership of a course unit: owning faculty plus any it is shared with. */
export interface CourseUnitScope {
  facultyId: string
  sharedFaculties: { facultyId: string }[]
}

/** Faculties allowed to administer a course unit. */
export function courseUnitFacultyIds(courseUnit: CourseUnitScope): Set<string> {
  return new Set([
    courseUnit.facultyId,
    ...courseUnit.sharedFaculties.map((sf) => sf.facultyId),
  ])
}

/**
 * Authorise access to a session's data.
 *
 * Lecturers are checked by `lecturerCheck` (ownership or assignment, depending
 * on the caller), Faculty Admins must belong to the unit's own or a shared
 * faculty, System Admins always pass and every other role is rejected.
 */
export async function assertSessionScope(
  actor: Actor,
  courseUnit: CourseUnitScope,
  lecturerCheck: () => void | Promise<void>,
  outsideFacultyMessage = 'Session is outside your faculty'
): Promise<void> {
  if (actor.role === 'lecturer') {
    await lecturerCheck()
    return
  }
  if (actor.role === 'faculty_admin') {
    if (!actor.facultyId || !courseUnitFacultyIds(courseUnit).has(actor.facultyId)) {
      throw new ApiError(outsideFacultyMessage, 403)
    }
    return
  }
  if (actor.role !== 'system_admin') {
    throw new ApiError('Forbidden', 403)
  }
}
