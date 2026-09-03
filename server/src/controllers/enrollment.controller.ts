import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok, created, noContent } from '../utils/apiResponse'
import { ApiError } from '../utils/apiResponse'

import {
  getFacultyUnitOverview,
  createEnrollment,
  removeEnrollment,
} from '../services/enrollment.service'

const enrollmentSchema = z.object({
  studentId: z.string().uuid(),
  courseUnitId: z.string().uuid(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'),
  semester: z.number().int().min(1).max(2),
})

function requireFaculty(req: Request): { facultyId: string } {
  const facultyId = req.user?.facultyId
  if (!facultyId) {
    throw new ApiError('You are not linked to a faculty', 403)
  }
  return { facultyId }
}

/** GET /api/enrollments/overview — students, lecturers and units in the admin's faculty. */
export async function getUnitOverview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { facultyId } = requireFaculty(req)
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
    const { facultyId } = requireFaculty(req)
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
    const { facultyId } = requireFaculty(req)
    await removeEnrollment(req.params.id, facultyId)
    noContent(res)
  } catch (e) {
    next(e)
  }
}

