import { prisma } from '../config/db'
import { publish } from './events.service'
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

  const courseUnit = await prisma.courseUnit.findUnique({
    where: { id: input.courseUnitId },
  })
  if (!courseUnit) throw new ApiError('Course unit not found', 404)

  // No ownership gate: units like Ethics cut across faculties, and any
  // faculty admin may assign a lecturer to a unit their programmes take.

  if (!/^\d{4}\/\d{4}$/.test(input.academicYear)) {
    throw new ApiError('Academic year must be like 2025/2026', 400)
  }
  if (!Number.isInteger(input.semester) || input.semester < 1 || input.semester > 2) {
    throw new ApiError('Semester must be 1 or 2', 400)
  }

  await assertNoCohortClash(input.lecturerId, input.courseUnitId, input.academicYear, input.semester)

  // A unit can only be assigned to one lecturer per period
  const existingAssignment = await prisma.lecturerAssignment.findFirst({
    where: {
      courseUnitId: input.courseUnitId,
      academicYear: input.academicYear,
      semester: input.semester,
      lecturerId: { not: input.lecturerId },
    },
    include: { lecturer: { select: { fullName: true } } },
  })
  if (existingAssignment) {
    throw new ApiError(
      `This unit is already assigned to ${existingAssignment.lecturer.fullName} for ${input.academicYear} Semester ${input.semester}. Remove that assignment first.`,
      409
    )
  }

  const assignment = await prisma.lecturerAssignment.upsert({
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
  publish('assignments-changed')
  return assignment
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

  // Scope check: the FA must own the unit's faculty.
  // Cross-faculty shared units are visible to the FA but only the owning faculty can remove.
  if (existing.courseUnit.facultyId !== facultyId) {
    throw new ApiError('You can only remove assignments for units in your faculty', 403)
  }

  await prisma.lecturerAssignment.delete({ where: { id } })
  publish('assignments-changed')
  return existing
}

/**
 * A lecturer may teach at most one unit per (programme + year) cohort in a
 * given academic year + semester. They may still teach across years,
 * programmes, and semesters.
 *
 * Uses SemesterCourseUnit (populated by Moodle sync) rather than the legacy
 * CurriculumUnit table which is no longer written to.
 * Join chain: SemesterCourseUnit → Semester → ProgrammeYear (programmeId + year).
 */
async function assertNoCohortClash(
  lecturerId: string,
  courseUnitId: string,
  academicYear: string,
  semester: number
) {
  const newUnitSCUs = await prisma.semesterCourseUnit.findMany({
    where: {
      courseUnitId,
      semester: { number: semester },
    },
    select: {
      semester: {
        select: {
          programmeYear: { select: { programmeId: true, year: true } },
        },
      },
    },
  })
  const newUnitCohorts = newUnitSCUs.map((u) => u.semester.programmeYear)
  if (newUnitCohorts.length === 0) return

  const existing = await prisma.lecturerAssignment.findMany({
    where: { lecturerId, academicYear, semester, courseUnitId: { not: courseUnitId } },
    select: { courseUnitId: true },
  })
  if (existing.length === 0) return

  const existingSCUs = await prisma.semesterCourseUnit.findMany({
    where: {
      courseUnitId: { in: existing.map((e) => e.courseUnitId) },
      semester: { number: semester },
    },
    select: {
      semester: {
        select: {
          programmeYear: { select: { programmeId: true, year: true } },
        },
      },
    },
  })
  const existingCohorts = existingSCUs.map((u) => u.semester.programmeYear)

  const newCohortSet = new Set(newUnitCohorts.map((c) => `${c.programmeId}|${c.year}`))
  const clash = existingCohorts.find((c) => newCohortSet.has(`${c.programmeId}|${c.year}`))
  if (clash) {
    const programme = await prisma.programme.findUnique({
      where: { id: clash.programmeId },
      select: { name: true },
    })
    throw new ApiError(
      `This lecturer already teaches a unit taken by ${programme?.name ?? 'the same'} Year ${clash.year} cohort in ${academicYear} Semester ${semester}. Pick a different year, programme, or semester.`,
      400
    )
  }
}
