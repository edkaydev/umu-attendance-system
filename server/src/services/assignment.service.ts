import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { isProfileEditingEnabled } from './settings.service'

export interface AssignmentInput {
  lecturerId: string
  courseUnitId: string
  academicYear: string
  semester: number
}

/** List assignments for course units within a faculty admin's faculty. */
export function listAssignments(facultyId: string) {
  return prisma.lecturerAssignment.findMany({
    where: { courseUnit: { facultyId } },
    include: {
      lecturer: { select: { id: true, fullName: true, email: true } },
      courseUnit: { select: { id: true, code: true, name: true } },
      assignedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { assignedAt: 'desc' },
  })
}

/** Assign a lecturer to a course unit within the admin's faculty (FR-04.1). */
export async function createAssignment(
  input: AssignmentInput,
  facultyAdminId: string,
  facultyId: string
) {
  if (!(await isProfileEditingEnabled('admins'))) {
    throw new ApiError('Unit editing is currently disabled by the System Admin', 403)
  }

  const lecturer = await prisma.user.findUnique({ where: { id: input.lecturerId } })
  if (!lecturer || lecturer.role !== 'lecturer') {
    throw new ApiError('Lecturer not found', 404)
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

  return prisma.lecturerAssignment.upsert({
    where: {
      lecturerId_courseUnitId_academicYear_semester: {
        lecturerId: input.lecturerId,
        courseUnitId: input.courseUnitId,
        academicYear: input.academicYear,
        semester: input.semester,
      },
    },
    create: {
      lecturerId: input.lecturerId,
      courseUnitId: input.courseUnitId,
      academicYear: input.academicYear,
      semester: input.semester,
      assignedById: facultyAdminId,
    },
    update: {},
    include: {
      lecturer: { select: { id: true, fullName: true, email: true } },
      courseUnit: { select: { id: true, code: true, name: true } },
    },
  })
}

/** Remove a lecturer from a course unit (FR-04.3). */
export async function removeAssignment(id: string, facultyId: string) {
  if (!(await isProfileEditingEnabled('admins'))) {
    throw new ApiError('Unit editing is currently disabled by the System Admin', 403)
  }

  const existing = await prisma.lecturerAssignment.findUnique({
    where: { id },
    include: { courseUnit: { select: { facultyId: true } } },
  })
  if (!existing) throw new ApiError('Assignment not found', 404)
  if (existing.courseUnit.facultyId !== facultyId) {
    throw new ApiError('Assignment is outside your faculty', 403)
  }
  await prisma.lecturerAssignment.delete({ where: { id } })
  return existing
}
