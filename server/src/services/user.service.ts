import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { hashPassword } from '../utils/password'
import { roleMatchesEmail } from '../utils/domain'
import { validateStudentPath, recalculateEnrollments } from './profile.service'

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
  password: string
  facultyId?: string | null
  campusCode?: string
  programmeId?: string
  year?: number
  semester?: number
  academicYear?: string
  regNumber?: string
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

  const password = await hashPassword(input.password)

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
    profileComplete: boolean
  } = {
    email,
    password,
    fullName: input.fullName.trim(),
    role: input.role,
    profileComplete: input.role === Role.system_admin,
  }

  if (input.role === Role.student) {
    if (
      !input.campusCode || !input.facultyId || !input.programmeId ||
      !input.year || !input.semester || !input.academicYear || !input.regNumber
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
    })
    data.facultyId = input.facultyId
    data.programmeId = input.programmeId
    data.year = input.year
    data.semester = input.semester
    data.academicYear = input.academicYear
    data.regNumber = input.regNumber
    data.profileComplete = true
  } else if (input.role === Role.lecturer || input.role === Role.faculty_admin) {
    const facultyId = input.facultyId ?? null
    if (facultyId !== null) {
      const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
      if (!faculty) throw new ApiError('Faculty not found', 404)
      if (!faculty.isActive) throw new ApiError('Faculty is not active', 400)
    }
    data.facultyId = facultyId
    data.profileComplete = facultyId !== null
  }

  const user = await prisma.user.create({ data })

  if (input.role === Role.student) {
    await recalculateEnrollments(user.id, {
      campusCode: input.campusCode!,
      facultyId: input.facultyId!,
      programmeId: input.programmeId!,
      year: input.year!,
      semester: input.semester!,
      academicYear: input.academicYear!,
      regNumber: input.regNumber!,
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

  if (facultyId !== null) {
    const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
    if (!faculty) throw new ApiError('Faculty not found', 404)
    if (!faculty.isActive) throw new ApiError('Faculty is not active', 400)
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
    profileComplete?: boolean
  } = {
    fullName: input.fullName,
    email: input.email,
  }

  if (user.role === 'student') {
    if (
      !input.campusCode || !input.facultyId || !input.programmeId ||
      !input.year || !input.semester || !input.academicYear || !input.regNumber
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
    })
    data.facultyId = input.facultyId
    data.programmeId = input.programmeId
    data.year = input.year
    data.semester = input.semester
    data.academicYear = input.academicYear
    data.regNumber = input.regNumber
    data.profileComplete = true
  } else if (user.role === 'lecturer' || user.role === 'faculty_admin') {
    const facultyId = input.facultyId ?? null
    if (facultyId !== null) {
      const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
      if (!faculty) throw new ApiError('Faculty not found', 404)
      if (!faculty.isActive) throw new ApiError('Faculty is not active', 400)
    }
    data.facultyId = facultyId
  }

  const updated = await prisma.user.update({ where: { id }, data })

  if (user.role === 'student') {
    await recalculateEnrollments(id, {
      campusCode: input.campusCode!,
      facultyId: input.facultyId!,
      programmeId: input.programmeId!,
      year: input.year!,
      semester: input.semester!,
      academicYear: input.academicYear!,
      regNumber: input.regNumber!,
    })
  }

  return prisma.user.findUnique({ where: { id: updated.id }, select: managedUserSelect })
}
