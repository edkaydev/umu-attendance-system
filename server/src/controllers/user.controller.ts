import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { academicYearField, semesterField } from '../utils/period'
import { Role } from '@prisma/client'
import { ok } from '../utils/apiResponse'
import { ApiError } from '../utils/apiResponse'
import { writeAuditLog } from '../utils/audit'
import {
  listUsers,
  getUser,
  createUser,
  setUserActive,
  changeUserRole,
  assignFaculty,
  updateUser,
  deleteUser,
  deleteUsers,
  listUserIds,
  resetUserPassword,
} from '../services/user.service'

const roleSchema = z.object({
  role: z.nativeEnum(Role),
})

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email').max(150),
  role: z.nativeEnum(Role),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128).optional(),
  facultyId: z.string().uuid().nullable().optional(),
  campusCode: z.string().min(1).max(20).optional(),
  programmeId: z.string().uuid().optional(),
  year: z.number().int().min(1).max(6).optional(),
  semester: semesterField.optional(),
  academicYear: academicYearField.optional(),
  regNumber: z.string().trim().min(1).max(30).optional(),
  studentNumber: z.string().trim().min(1).max(30).optional(),
})

const commonProfileFields = {
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email').max(150),
}

const studentAcademicFields = {
  campusCode: z.string().min(1).max(20),
  facultyId: z.string().uuid(),
  programmeId: z.string().uuid(),
  year: z.number().int().min(1).max(6),
  semester: semesterField,
  academicYear: academicYearField,
  regNumber: z.string().trim().min(1, 'Reg number is required').max(30),
  studentNumber: z.string().trim().min(1, 'Student number is required').max(30),
}

const staffFacultyField = {
  facultyId: z.string().uuid().nullable(),
}

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const role = (req.query.role as Role) || undefined
    const search = (req.query.search as string) || undefined

    ok(res, await listUsers({ role, search, page, limit }))
  } catch (e) {
    next(e)
  }
}

export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { user: await getUser(req.params.id) })
  } catch (e) {
    next(e)
  }
}

export async function createUserController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = createUserSchema.parse(req.body)
    const user = await createUser(input)

    await writeAuditLog(req.user!.id, 'USER_CREATE', 'user', user!.id, {
      fullName: user?.fullName,
      email: user?.email,
      role: input.role,
    })

    ok(res, { user }, 201)
  } catch (e) {
    next(e)
  }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.params.id === req.user?.id) {
      throw new ApiError('You cannot deactivate your own account', 400)
    }
    ok(res, { user: await setUserActive(req.params.id, false) })
  } catch (e) {
    next(e)
  }
}

export async function activateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { user: await setUserActive(req.params.id, true) })
  } catch (e) {
    next(e)
  }
}

export async function deleteUserController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await deleteUser(req.params.id, req.user!.id)
    await writeAuditLog(req.user!.id, 'USER_DELETE', 'user', user.id, { fullName: user.fullName, email: user.email })
    ok(res, { deleted: 1 })
  } catch (e) {
    next(e)
  }
}

const bulkDeleteSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  allMatching: z.boolean().optional(),
  role: z.nativeEnum(Role).optional(),
  search: z.string().trim().max(150).optional(),
}).refine((data) => Boolean(data.allMatching) !== Boolean(data.userIds), {
  message: 'Provide userIds or set allMatching to true',
})

export async function bulkDeleteUsersController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = bulkDeleteSchema.parse(req.body)
    const ids = input.allMatching
      ? await listUserIds({ role: input.role, search: input.search })
      : input.userIds!
    const result = await deleteUsers(ids, req.user!.id)

    if (result.deleted > 0) {
      await writeAuditLog(req.user!.id, 'USER_DELETE', 'user_batch', 'bulk', {
        deleted: result.deleted,
        skipped: result.skipped,
        failed: result.errors.length,
      })
    }
    ok(res, { result })
  } catch (e) {
    next(e)
  }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role } = roleSchema.parse(req.body)
    ok(res, { user: await changeUserRole(req.params.id, role) })
  } catch (e) {
    next(e)
  }
}

const facultySchema = z.object({
  facultyId: z.string().uuid().nullable(),
})

export async function assignFacultyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { facultyId } = facultySchema.parse(req.body)
    ok(res, { user: await assignFaculty(req.params.id, facultyId) })
  } catch (e) {
    next(e)
  }
}

export async function updateUserController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const target = await getUser(req.params.id)
    const extra =
      target.role === 'student'
        ? studentAcademicFields
        : target.role === 'system_admin'
          ? {}
          : staffFacultyField

    const data = z.object({ ...commonProfileFields, ...extra }).parse(req.body)
    const user = await updateUser(req.params.id, data)

    await writeAuditLog(req.user!.id, 'USER_UPDATE', 'user', req.params.id, {
      fullName: user?.fullName,
      email: user?.email,
      role: target.role,
    })

    ok(res, { user })
  } catch (e) {
    next(e)
  }
}

export async function resetPasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await resetUserPassword(req.params.id, req.user!.id)
    await writeAuditLog(req.user!.id, 'USER_UPDATE', 'user', user.id, {
      action: 'reset_password',
      fullName: user.fullName,
      email: user.email,
    })
    ok(res, { message: `Password reset to default for ${user.fullName}. They will be prompted to change it on next login.` })
  } catch (e) {
    next(e)
  }
}
