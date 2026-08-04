import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok, created, noContent } from '../utils/apiResponse'
import { ApiError } from '../utils/apiResponse'
import {
  listAssignments,
  createAssignment,
  removeAssignment,
} from '../services/assignment.service'

const assignmentSchema = z.object({
  lecturerId: z.string().uuid(),
  courseUnitId: z.string().uuid(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'),
  semester: z.number().int().min(1).max(2),
})

function requireFaculty(req: Request): { adminId: string; facultyId: string } {
  const facultyId = req.user?.facultyId
  if (!facultyId) {
    throw new ApiError('You are not linked to a faculty', 403)
  }
  return { adminId: req.user!.id, facultyId }
}

export async function getAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { facultyId } = requireFaculty(req)
    ok(res, { assignments: await listAssignments(facultyId) })
  } catch (e) {
    next(e)
  }
}

export async function postAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { adminId, facultyId } = requireFaculty(req)
    const input = assignmentSchema.parse(req.body)
    created(res, { assignment: await createAssignment(input, adminId, facultyId) })
  } catch (e) {
    next(e)
  }
}

export async function deleteAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { facultyId } = requireFaculty(req)
    await removeAssignment(req.params.id, facultyId)
    noContent(res)
  } catch (e) {
    next(e)
  }
}
