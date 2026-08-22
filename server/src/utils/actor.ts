import { Request } from 'express'
import { Role } from '@prisma/client'
import { ApiError } from './apiResponse'

/** Identity + faculty scope of the caller, passed from controllers into services. */
export interface Actor {
  id: string
  role: Role
  facultyId: string | null
}

/** Build the service-level actor from an authenticated request. */
export function actorFromRequest(req: Request): Actor {
  return { id: req.user!.id, role: req.user!.role, facultyId: req.user!.facultyId ?? null }
}

/** Caller's own faculty — rejects staff accounts that are not linked to one. */
export function requireFacultyScope(req: Request): { adminId: string; facultyId: string } {
  const facultyId = req.user?.facultyId
  if (!facultyId) {
    throw new ApiError('You are not linked to a faculty', 403)
  }
  return { adminId: req.user!.id, facultyId }
}
