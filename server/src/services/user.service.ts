import { Prisma, Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { roleMatchesEmail } from '../utils/domain'

export interface ListUsersParams {
  role?: Role
  search?: string
  page?: number
  limit?: number
}

const managedUserSelect = {
  id:              true,
  email:           true,
  fullName:        true,
  role:            true,
  profileComplete: true,
  isActive:        true,
  regNumber:       true,
  whatsapp:        true,
  gender:          true,
  photoUrl:        true,
  facultyId:       true,
  faculty:         { select: { id: true, name: true } },
  programmeId:     true,
  programme:       { select: { id: true, name: true } },
  year:            true,
  semester:        true,
  academicYear:    true,
  createdAt:       true,
} as const

async function assertFacultyAvailableForAdmin(facultyId: string, excludeUserId?: string) {
  const existing = await prisma.user.findFirst({
    where: {
      role: Role.faculty_admin,
      facultyId,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { fullName: true },
  })
  if (existing) {
    throw new ApiError(
      `This faculty already has a Faculty Admin (${existing.fullName || existing.fullName || 'assigned'})`,
      409
    )
  }
}

export async function listUsers({ role, search, page = 1, limit = 20 }: ListUsersParams) {
  const skip = (page - 1) * limit
  const where = {
    ...(role ? { role } : {}),
    ...(search
      ? {
          OR: [
            { fullName:  { contains: search } },
            { email:     { contains: search } },
            { regNumber: { contains: search } },
          ],
        }
      : {}),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, select: managedUserSelect, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.user.count({ where }),
  ])
  return { users, total, page, limit }
}

/**
 * Pre-register a staff account (System Admin only).
 * Only email + role required. For faculty_admin, facultyId is also required.
 * fullName is intentionally left empty — it will be filled in from Google on
 * first login.
 */
export interface PreRegisterInput {
  email:     string
  role:      'lecturer' | 'faculty_admin' | 'system_admin'
  facultyId?: string
}

export async function createUser(input: PreRegisterInput) {
  const email = input.email.trim().toLowerCase()

  if (!roleMatchesEmail(input.role as Role, email)) {
    throw new ApiError('Staff emails must end in @umu.ac.ug', 400)
  }

  const clash = await prisma.user.findUnique({ where: { email } })
  if (clash) throw new ApiError('A user with this email already exists', 409)

  // faculty_admin requires a faculty; profile is immediately complete (no setup step)
  if (input.role === 'faculty_admin') {
    if (!input.facultyId) {
      throw new ApiError('Faculty is required for Faculty Admin accounts', 400)
    }
    const faculty = await prisma.faculty.findUnique({ where: { id: input.facultyId } })
    if (!faculty) throw new ApiError('Faculty not found', 404)
    if (!faculty.isActive) throw new ApiError('Faculty is not active', 400)
    await assertFacultyAvailableForAdmin(input.facultyId)
  }

  const user = await prisma.user.create({
    data: {
      email,
      fullName:        '',          // filled from Google on first login
      role:            input.role as Role,
      facultyId:       input.role === 'faculty_admin' ? input.facultyId : null,
      profileComplete: input.role === 'faculty_admin' || input.role === 'system_admin',
      isActive:        true,
    },
  })

  return prisma.user.findUnique({ where: { id: user.id }, select: managedUserSelect })
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id:              true,
      email:           true,
      fullName:        true,
      role:            true,
      profileComplete: true,
      isActive:        true,
      regNumber:       true,
      whatsapp:        true,
      gender:          true,
      photoUrl:        true,
      faculty:         { select: { id: true, name: true, code: true } },
      programme:       { select: { id: true, name: true, code: true } },
      year:            true,
      semester:        true,
      academicYear:    true,
      createdAt:       true,
      updatedAt:       true,
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

export async function deleteUser(id: string, actorId: string) {
  if (id === actorId) throw new ApiError('You cannot delete your own account', 400)
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true },
  })
  if (!user) throw new ApiError('User not found', 404)
  try {
    await prisma.user.delete({ where: { id } })
    return user
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new ApiError(
        'This user has linked records and cannot be deleted. Deactivate the account instead.',
        409
      )
    }
    throw error
  }
}

export async function deleteUsers(ids: string[], actorId: string) {
  const uniqueIds = [...new Set(ids)]
  const result = { deleted: 0, skipped: 0, errors: [] as { id: string; message: string }[] }
  for (const id of uniqueIds) {
    if (id === actorId) { result.skipped++; continue }
    try {
      await deleteUser(id, actorId)
      result.deleted++
    } catch (error) {
      result.errors.push({ id, message: error instanceof Error ? error.message : 'Could not delete user' })
    }
  }
  return result
}

export async function listUserIds({ role, search }: Pick<ListUsersParams, 'role' | 'search'>) {
  const users = await prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(search
        ? { OR: [{ fullName: { contains: search } }, { email: { contains: search } }, { regNumber: { contains: search } }] }
        : {}),
    },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

export async function changeUserRole(id: string, role: Role) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new ApiError('User not found', 404)

  if (role === Role.faculty_admin) {
    if (!user.facultyId) throw new ApiError('Assign a faculty before making this user a Faculty Admin', 400)
    await assertFacultyAvailableForAdmin(user.facultyId, user.id)
  }

  const data: { role: Role; programmeId?: null; year?: null; semester?: null; regNumber?: null } = { role }
  if (role !== Role.student) {
    data.programmeId = null
    data.year = null
    data.semester = null
    data.regNumber = null
  }

  return prisma.user.update({ where: { id }, data })
}

export async function assignFaculty(userId: string, facultyId: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new ApiError('User not found', 404)

  if (user.role !== 'faculty_admin' && user.role !== 'lecturer') {
    throw new ApiError('Faculty can only be assigned to Faculty Admin or Lecturer accounts', 400)
  }
  if (facultyId === null) {
    throw new ApiError(`${user.role === 'faculty_admin' ? 'Faculty Admin' : 'Lecturer'} must remain assigned to a faculty`, 400)
  }

  const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)
  if (!faculty.isActive) throw new ApiError('Faculty is not active', 400)
  if (user.role === 'faculty_admin') await assertFacultyAvailableForAdmin(facultyId, user.id)

  return prisma.user.update({
    where: { id: userId },
    data: { facultyId },
    select: {
      id:       true,
      fullName: true,
      email:    true,
      role:     true,
      faculty:  { select: { id: true, name: true, code: true } },
    },
  })
}
