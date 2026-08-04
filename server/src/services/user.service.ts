import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'

export interface ListUsersParams {
  role?: Role
  search?: string
  page?: number
  limit?: number
}

export async function listUsers({ role, search, page = 1, limit = 20 }: ListUsersParams) {
  const skip = (page - 1) * limit

  const where = {
    ...(role ? { role } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search } },
            { email: { contains: search } },
            { regNumber: { contains: search } },
          ],
        }
      : {}),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        profileComplete: true,
        isActive: true,
        regNumber: true,
        faculty: { select: { id: true, name: true } },
        programme: { select: { id: true, name: true } },
        year: true,
        semester: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return { users, total, page, limit }
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      profileComplete: true,
      isActive: true,
      regNumber: true,
      faculty: { select: { id: true, name: true, code: true } },
      programme: { select: { id: true, name: true, code: true } },
      year: true,
      semester: true,
      academicYear: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!user) throw new ApiError('User not found', 404)
  return user
}

export async function setUserActive(id: string, isActive: boolean) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new ApiError('User not found', 404)
  return prisma.user.update({ where: { id }, data: { isActive } })
}

export async function changeUserRole(id: string, role: Role) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new ApiError('User not found', 404)

  // Changing a student's role: clear student-only fields
  const data: { role: Role; programmeId?: null; year?: null; semester?: null; regNumber?: null } = {
    role,
  }
  if (role !== Role.student) {
    data.programmeId = null
    data.year = null
    data.semester = null
    data.regNumber = null
  }

  return prisma.user.update({ where: { id }, data })
}
