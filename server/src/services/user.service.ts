import { Prisma, Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { errorMessage } from '../utils/errors'
import { hashPassword } from '../utils/password'
import { getDefaultUserPasswordHash } from './settings.service'
import { roleMatchesEmail } from '../utils/domain'
import { validateStudentPath, recalculateEnrollments, friendlyUniqueError } from './profile.service'

export interface ListUsersParams {
  role?: Role
  search?: string
  page?: number
  limit?: number
}

const managedUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  profileComplete: true,
  isActive: true,
  regNumber: true,
  facultyId: true,
  faculty: { select: { id: true, name: true } },
  programmeId: true,
  programme: { select: { id: true, name: true } },
  year: true,
  semester: true,
  academicYear: true,
  createdAt: true,
} as const

async function assertFacultyAvailableForAdmin(facultyId: string, excludeUserId?: string) {
  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: Role.faculty_admin,
      facultyId,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { fullName: true },
  })
  if (existingAdmin) {
    throw new ApiError(`This faculty already has a Faculty Admin (${existingAdmin.fullName})`, 409)
  }
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
      select: managedUserSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return { users, total, page, limit }
}

export interface CreateUserInput {
  fullName: string
  email: string
  role: Role
  password?: string
  facultyId?: string | null
  campusCode?: string
  programmeId?: string
  year?: number
  semester?: number
  academicYear?: string
  regNumber?: string
  studentNumber?: string
}

/**
 * System Admin manually creates a user account (email + password).
 * Students must use @stud.umu.ac.ug; staff and admins must use @umu.ac.ug.
 */
export async function createUser(input: CreateUserInput) {
  const email = input.email.trim().toLowerCase()

  const clash = await prisma.user.findUnique({ where: { email } })
  if (clash) throw new ApiError('A user with this email already exists', 409)

  if (!roleMatchesEmail(input.role, email)) {
    throw new ApiError(
      input.role === Role.student
        ? 'Student emails must end in @stud.umu.ac.ug'
        : 'Staff emails must end in @umu.ac.ug',
      400
    )
  }

  const password = input.password
    ? await hashPassword(input.password)
    : await getDefaultUserPasswordHash()

  const data: {
    email: string
    password: string
    fullName: string
    role: Role
    facultyId?: string | null
    programmeId?: string | null
    year?: number | null
    semester?: number | null
    academicYear?: string | null
    regNumber?: string | null
    studentNumber?: string | null
    profileComplete: boolean
    mustChangePassword: boolean
  } = {
    email,
    password,
    fullName: input.fullName.trim(),
    role: input.role,
    profileComplete: input.role === Role.system_admin,
    mustChangePassword: true,
  }

  if (input.role === Role.student) {
    if (
      !input.campusCode || !input.facultyId || !input.programmeId ||
      !input.year || !input.semester || !input.academicYear || !input.regNumber ||
      !input.studentNumber
    ) {
      throw new ApiError('Student academic details are required', 400)
    }
    await validateStudentPath({
      campusCode: input.campusCode,
      facultyId: input.facultyId,
      programmeId: input.programmeId,
      year: input.year,
      semester: input.semester,
      academicYear: input.academicYear,
      regNumber: input.regNumber,
      studentNumber: input.studentNumber,
    })
    data.facultyId = input.facultyId
    data.programmeId = input.programmeId
    data.year = input.year
    data.semester = input.semester
    data.academicYear = input.academicYear
    data.regNumber = input.regNumber
    data.studentNumber = input.studentNumber
    data.profileComplete = true
  } else if (input.role === Role.lecturer || input.role === Role.faculty_admin) {
    const facultyId = input.facultyId ?? null
    if (facultyId === null) {
      throw new ApiError(`${input.role === Role.faculty_admin ? 'Faculty Admin' : 'Lecturer'} must be assigned to a faculty`, 400)
    }
    if (facultyId !== null) {
      const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
      if (!faculty) throw new ApiError('Faculty not found', 404)
      if (!faculty.isActive) throw new ApiError('Faculty is not active', 400)
      if (input.role === Role.faculty_admin) await assertFacultyAvailableForAdmin(facultyId)
    }
    data.facultyId = facultyId
    data.profileComplete = facultyId !== null
  }

  const user = await prisma.user.create({ data }).catch(friendlyUniqueError)

  if (input.role === Role.student) {
    await recalculateEnrollments(user.id, {
      campusCode: input.campusCode!,
      facultyId: input.facultyId!,
      programmeId: input.programmeId!,
      year: input.year!,
      semester: input.semester!,
      academicYear: input.academicYear!,
      regNumber: input.regNumber!,
      studentNumber: input.studentNumber!,
    })
  }

  return prisma.user.findUnique({ where: { id: user.id }, select: managedUserSelect })
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

/** Permanently remove an account that has no attendance or other linked records. */
export async function deleteUser(id: string, actorId: string) {
  if (id === actorId) {
    throw new ApiError('You cannot delete your own account', 400)
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, email: true } })
  if (!user) throw new ApiError('User not found', 404)

  try {
    await prisma.user.delete({ where: { id } })
    return user
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new ApiError('This user has linked records and cannot be deleted. Deactivate the account instead.', 409)
    }
    throw error
  }
}

export async function deleteUsers(
  ids: string[],
  actorId: string
): Promise<{ deleted: number; skipped: number; errors: { id: string; message: string }[] }> {
  const uniqueIds = [...new Set(ids)]
  const result = { deleted: 0, skipped: 0, errors: [] as { id: string; message: string }[] }

  for (const id of uniqueIds) {
    if (id === actorId) {
      result.skipped++
      continue
    }
    try {
      await deleteUser(id, actorId)
      result.deleted++
    } catch (error) {
      result.errors.push({ id, message: errorMessage(error, 'Could not delete user') })
    }
  }

  return result
}

export async function listUserIds({ role, search }: Pick<ListUsersParams, 'role' | 'search'>) {
  const users = await prisma.user.findMany({
    where: {
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
    },
    select: { id: true },
  })
  return users.map((user) => user.id)
}

export async function changeUserRole(id: string, role: Role) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new ApiError('User not found', 404)

  if (role === Role.faculty_admin) {
    if (!user.facultyId) throw new ApiError('Assign a faculty before making this user a Faculty Admin', 400)
    await assertFacultyAvailableForAdmin(user.facultyId, user.id)
  }

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

/**
 * Assign (or remove) a faculty from a faculty_admin or lecturer account.
 * Only System Admin can call this.
 */
export async function assignFaculty(userId: string, facultyId: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new ApiError('User not found', 404)

  if (user.role !== 'faculty_admin' && user.role !== 'lecturer') {
    throw new ApiError('Faculty can only be assigned to Faculty Admin or Lecturer accounts', 400)
  }

  if (facultyId === null) {
    throw new ApiError(`${user.role === 'faculty_admin' ? 'Faculty Admin' : 'Lecturer'} must remain assigned to a faculty`, 400)
  }

  if (facultyId !== null) {
    const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
    if (!faculty) throw new ApiError('Faculty not found', 404)
    if (!faculty.isActive) throw new ApiError('Faculty is not active', 400)
    if (user.role === 'faculty_admin') await assertFacultyAvailableForAdmin(facultyId, user.id)
  }

  return prisma.user.update({
    where: { id: userId },
    data: { facultyId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      faculty: { select: { id: true, name: true, code: true } },
    },
  })
}

export interface AdminUserUpdateInput {
  fullName: string
  email: string
  facultyId?: string | null
  campusCode?: string
  programmeId?: string
  year?: number
  semester?: number
  academicYear?: string
  regNumber?: string
  studentNumber?: string
}

/**
 * System Admin edits a user's account + role-specific academic details.
 * Bypasses the profile-editing freeze — this is an admin action.
 */
export async function updateUser(id: string, input: AdminUserUpdateInput) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new ApiError('User not found', 404)

  if (input.email !== user.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email } })
    if (clash) throw new ApiError('Another user already uses this email', 409)
  }

  const data: {
    fullName: string
    email: string
    facultyId?: string | null
    programmeId?: string | null
    year?: number | null
    semester?: number | null
    academicYear?: string | null
    regNumber?: string | null
    studentNumber?: string | null
    profileComplete?: boolean
  } = {
    fullName: input.fullName,
    email: input.email,
  }

  if (user.role === 'student') {
    if (
      !input.campusCode || !input.facultyId || !input.programmeId ||
      !input.year || !input.semester || !input.academicYear || !input.regNumber ||
      !input.studentNumber
    ) {
      throw new ApiError('Student academic details are required', 400)
    }
    await validateStudentPath({
      campusCode: input.campusCode,
      facultyId: input.facultyId,
      programmeId: input.programmeId,
      year: input.year,
      semester: input.semester,
      academicYear: input.academicYear,
      regNumber: input.regNumber,
      studentNumber: input.studentNumber,
    })
    data.facultyId = input.facultyId
    data.programmeId = input.programmeId
    data.year = input.year
    data.semester = input.semester
    data.academicYear = input.academicYear
    data.regNumber = input.regNumber
    data.studentNumber = input.studentNumber
    data.profileComplete = true
  } else if (user.role === 'lecturer' || user.role === 'faculty_admin') {
    const facultyId = input.facultyId ?? null
    if (facultyId === null) {
      throw new ApiError(`${user.role === 'faculty_admin' ? 'Faculty Admin' : 'Lecturer'} must be assigned to a faculty`, 400)
    }
    if (facultyId !== null) {
      const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
      if (!faculty) throw new ApiError('Faculty not found', 404)
      if (!faculty.isActive) throw new ApiError('Faculty is not active', 400)
      if (user.role === 'faculty_admin') await assertFacultyAvailableForAdmin(facultyId, user.id)
    }
    data.facultyId = facultyId
  }

  const updated = await prisma.user.update({ where: { id }, data }).catch(friendlyUniqueError)

  if (user.role === 'student') {
    await recalculateEnrollments(id, {
      campusCode: input.campusCode!,
      facultyId: input.facultyId!,
      programmeId: input.programmeId!,
      year: input.year!,
      semester: input.semester!,
      academicYear: input.academicYear!,
      regNumber: input.regNumber!,
      studentNumber: input.studentNumber!,
    })
  }

  return prisma.user.findUnique({ where: { id: updated.id }, select: managedUserSelect })
}

/**
 * Reset a user's password to the system default and force them to change it
 * on next login. All their data is untouched.
 */
export async function resetUserPassword(id: string, actorId: string) {
  if (id === actorId) {
    throw new ApiError('You cannot reset your own password this way — use Change Password instead', 400)
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, email: true } })
  if (!user) throw new ApiError('User not found', 404)

  const passwordHash = await getDefaultUserPasswordHash()
  await prisma.user.update({
    where: { id },
    data: {
      password: passwordHash,
      mustChangePassword: true,
    },
  })

  return user
}
