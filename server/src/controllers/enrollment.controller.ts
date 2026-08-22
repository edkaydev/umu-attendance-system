import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok, created, noContent } from '../utils/apiResponse'
import { requireFacultyScope } from '../utils/actor'
import { academicYearField, semesterField } from '../utils/period'
import {
  getFacultyUnitOverview,
  createEnrollment,
  removeEnrollment,
} from '../services/enrollment.service'

const enrollmentSchema = z.object({
  studentId: z.string().uuid(),
  courseUnitId: z.string().uuid(),
  academicYear: academicYearField,
  semester: semesterField,
})

/** GET /api/enrollments/overview — students, lecturers and units in the admin's faculty. */
export async function getUnitOverview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { facultyId } = requireFacultyScope(req)
    ok(res, await getFacultyUnitOverview(facultyId))
  } catch (e) {
    next(e)
  }
}

/** POST /api/enrollments — FA enrols a student in a unit within their faculty. */
export async function postEnrollment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { facultyId } = requireFacultyScope(req)
    const input = enrollmentSchema.parse(req.body)
    await createEnrollment(input, facultyId)
    created(res, { message: 'Student enrolled' })
  } catch (e) {
    next(e)
  }
}

/** DELETE /api/enrollments/:id — FA removes a student's unit within their faculty. */
export async function deleteEnrollment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { facultyId } = requireFacultyScope(req)
    await removeEnrollment(req.params.id, facultyId)
    noContent(res)
  } catch (e) {
    next(e)
  }
}
