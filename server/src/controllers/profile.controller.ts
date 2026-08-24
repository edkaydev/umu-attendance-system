import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ok } from '../utils/apiResponse'
import { ApiError } from '../utils/apiResponse'
import {
  completeStudentProfile,
  updateStudentProfile,
  completeLecturerProfile,
  updateLecturerProfile,
  markTourComplete,
} from '../services/profile.service'

export const studentProfileSchema = z.object({
  campusCode: z.string().min(1).max(20),
  facultyId: z.string().uuid(),
  programmeId: z.string().uuid(),
  year: z.number().int().min(1).max(6),
  semester: z.number().int().min(1).max(2),
  regNumber: z.string().min(1).max(30),
  studentNumber: z.string().min(1).max(30),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'),
})

export const lecturerProfileSchema = z.object({
  facultyIds: z.array(z.string().uuid()).min(1).max(3),
})

async function routeByRole(
  req: Request,
  res: Response,
  next: NextFunction,
  { complete }: { complete: boolean }
): Promise<void> {
  try {
    const role = req.user!.role
    if (role === 'student') {
      const data = studentProfileSchema.parse(req.body)
      const result = complete
        ? await completeStudentProfile(req.user!.id, data)
        : await updateStudentProfile(req.user!.id, data)
      ok(res, { message: 'Profile saved', result })
      return
    }
    if (role === 'lecturer') {
      const { facultyIds } = lecturerProfileSchema.parse(req.body)
      const result = complete
        ? await completeLecturerProfile(req.user!.id, facultyIds)
        : await updateLecturerProfile(req.user!.id, facultyIds)
      ok(res, { message: 'Profile saved', result })
      return
    }
    throw new ApiError('Only students and lecturers complete a profile', 403)
  } catch (e) {
    next(e)
  }
}

export async function completeProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  return routeByRole(req, res, next, { complete: true })
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  return routeByRole(req, res, next, { complete: false })
}

/** PUT /api/profile/tour-complete — persist that the current user finished/skipped the tour (all roles). */
export async function completeTour(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await markTourComplete(req.user!.id)
    ok(res, { message: 'Tour completed', result })
  } catch (e) {
    next(e)
  }
}
