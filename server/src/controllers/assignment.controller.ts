import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok, created, noContent } from '../utils/apiResponse'
import { requireFacultyScope } from '../utils/actor'
import { academicYearField, semesterField } from '../utils/period'
import {
  listAssignments,
  createAssignment,
  removeAssignment,
} from '../services/assignment.service'

const assignmentSchema = z.object({
  lecturerId: z.string().uuid(),
  courseUnitId: z.string().uuid(),
  academicYear: academicYearField,
  semester: semesterField,
})

export async function getAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { facultyId } = requireFacultyScope(req)
    ok(res, { assignments: await listAssignments(facultyId) })
  } catch (e) {
    next(e)
  }
}

export async function postAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { adminId, facultyId } = requireFacultyScope(req)
    const input = assignmentSchema.parse(req.body)
    created(res, { assignment: await createAssignment(input, adminId, facultyId) })
  } catch (e) {
    next(e)
  }
}

export async function deleteAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { facultyId } = requireFacultyScope(req)
    await removeAssignment(req.params.id, facultyId)
    noContent(res)
  } catch (e) {
    next(e)
  }
}
