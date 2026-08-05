import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { ok } from '../utils/apiResponse'
import { ApiError } from '../utils/apiResponse'
import {
  listUsers,
  getUser,
  setUserActive,
  changeUserRole,
  assignFaculty,
} from '../services/user.service'

const roleSchema = z.object({
  role: z.nativeEnum(Role),
})

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
