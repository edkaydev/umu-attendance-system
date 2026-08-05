import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { isProfileEditingEnabled } from './settings.service'

export interface EnrollmentInput {
  studentId: string
  courseUnitId: string
  academicYear: string
  semester: number
}

/**
 * Everything a Faculty Admin needs for unit management in their faculty:
 * their faculty's course units (dropdown source) and the students + lecturers
 * in that faculty together with the units each currently has.
 */
export async function getFacultyUnitOverview(facultyId: string) {
  const [courseUnits, students, lecturers] = await Promise.all([
    prisma.courseUnit.findMany({
      where: { facultyId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: 'student', facultyId },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        regNumber: true,
        programme: { select: { id: true, name: true, code: true } },
        enrollments: {
          select: {
            id: true,
            courseUnitId: true,
            academicYear: true,
            semester: true,
            courseUnit: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: 'lecturer', facultyId },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        lecturerAssignments: {
          select: {
            id: true,
            courseUnitId: true,
            academicYear: true,
            semester: true,
            courseUnit: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
  ])

  return { courseUnits, students, lecturers }
}

/** Enrol a student in a course unit — both must be in the admin's faculty. */
export async function createEnrollment(
  input: EnrollmentInput,
  facultyId: string
): Promise<void> {
  if (!(await isProfileEditingEnabled('admins'))) {
    throw new ApiError('Unit editing is currently disabled by the System Admin', 403)
  }

  const student = await prisma.user.findUnique({ where: { id: input.studentId } })
  if (!student || student.role !== 'student') {
    throw new ApiError('Student not found', 404)
  }
  if (student.facultyId !== facultyId) {
    throw new ApiError('Student is outside your faculty', 403)
  }

  const courseUnit = await prisma.courseUnit.findUnique({ where: { id: input.courseUnitId } })
  if (!courseUnit) throw new ApiError('Course unit not found', 404)
  if (courseUnit.facultyId !== facultyId) {
    throw new ApiError('Course unit is outside your faculty', 403)
  }

  if (!/^\d{4}\/\d{4}$/.test(input.academicYear)) {
    throw new ApiError('Academic year must be like 2025/2026', 400)
  }
  if (!Number.isInteger(input.semester) || input.semester < 1 || input.semester > 2) {
    throw new ApiError('Semester must be 1 or 2', 400)
  }

  await prisma.enrollment.upsert({
    where: {
      studentId_courseUnitId_academicYear_semester: {
        studentId: input.studentId,
        courseUnitId: input.courseUnitId,
        academicYear: input.academicYear,
        semester: input.semester,
      },
    },
    create: {
      studentId: input.studentId,
      courseUnitId: input.courseUnitId,
      academicYear: input.academicYear,
      semester: input.semester,
    },
    update: {},
  })
}

/** Remove a student's enrolment — scoped to the admin's faculty. */
export async function removeEnrollment(id: string, facultyId: string): Promise<void> {
  if (!(await isProfileEditingEnabled('admins'))) {
    throw new ApiError('Unit editing is currently disabled by the System Admin', 403)
  }

  const existing = await prisma.enrollment.findUnique({
    where: { id },
    include: { student: { select: { facultyId: true } }, courseUnit: { select: { facultyId: true } } },
  })
  if (!existing) throw new ApiError('Enrolment not found', 404)
  if (existing.student.facultyId !== facultyId || existing.courseUnit.facultyId !== facultyId) {
    throw new ApiError('Enrolment is outside your faculty', 403)
  }

  await prisma.enrollment.delete({ where: { id } })
}
