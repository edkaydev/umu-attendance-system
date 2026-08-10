import { Gender } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { isValidCampusCode } from '../constants/campuses'
import { isProfileEditingEnabled } from './settings.service'
import { getCurriculumUnitIds } from './enrollment.service'

// ─── Student profile ──────────────────────────────────────────────────────────

export interface StudentPathInput {
  campusCode:   string
  facultyId:    string
  programmeId:  string
  year:         number
  semester:     number
  regNumber:    string
  academicYear: string
  whatsapp:     string
  gender:       Gender
}

export async function validateStudentPath(input: StudentPathInput): Promise<void> {
  if (!isValidCampusCode(input.campusCode)) {
    throw new ApiError('Campus not found', 404)
  }
  if (input.year < 1 || input.year > 5) {
    throw new ApiError('Year must be between 1 and 5', 400)
  }
  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
    include: { faculty: true },
  })
  if (!programme) throw new ApiError('Programme not found', 404)
  if (programme.facultyId !== input.facultyId) {
    throw new ApiError('Programme does not belong to the selected faculty', 400)
  }
  if (programme.faculty.campusCode.toUpperCase() !== input.campusCode.toUpperCase()) {
    throw new ApiError('Faculty does not belong to the selected campus', 400)
  }
}

/**
 * Recalculate a student's curriculum-based enrolments for the given period.
 * Manual enrolments (added by Faculty Admin) are preserved.
 * Old curriculum-based enrolments are deleted and recreated from the
 * curriculum mapping (FR-02.4 / FR-02.6).
 */
export async function recalculateEnrollments(
  studentId: string,
  { programmeId, year, semester, academicYear }: StudentPathInput
): Promise<number> {
  const curriculumUnitIds = await getCurriculumUnitIds(programmeId, year, semester, academicYear)

  // Delete only curriculum-based (non-manual) enrollments for this period
  await prisma.enrollment.deleteMany({
    where: { studentId, academicYear, semester, isManual: false },
  })

  if (curriculumUnitIds.length > 0) {
    // upsert to avoid conflicts if a manual enrollment already exists for the same unit
    for (const courseUnitId of curriculumUnitIds) {
      await prisma.enrollment.upsert({
        where: {
          studentId_courseUnitId_academicYear_semester: {
            studentId,
            courseUnitId,
            academicYear,
            semester,
          },
        },
        create: { studentId, courseUnitId, academicYear, semester, isManual: false },
        update: { isManual: false }, // keep existing record, just ensure isManual is false
      })
    }
  }

  return curriculumUnitIds.length
}

/** First-time student profile completion. */
export async function completeStudentProfile(userId: string, input: StudentPathInput) {
  await validateStudentPath(input)
  await prisma.user.update({
    where: { id: userId },
    data: {
      facultyId:       input.facultyId,
      programmeId:     input.programmeId,
      year:            input.year,
      semester:        input.semester,
      academicYear:    input.academicYear,
      regNumber:       input.regNumber.trim(),
      whatsapp:        input.whatsapp.trim(),
      gender:          input.gender,
      profileComplete: true,
    },
  })
  const unitsEnrolled = await recalculateEnrollments(userId, input)
  return { unitsEnrolled }
}

/** Student edits their academic path — enrolments recalculated, manual ones preserved. */
export async function updateStudentProfile(userId: string, input: StudentPathInput) {
  await assertProfileEditingAllowed('students')
  await validateStudentPath(input)
  await prisma.user.update({
    where: { id: userId },
    data: {
      facultyId:       input.facultyId,
      programmeId:     input.programmeId,
      year:            input.year,
      semester:        input.semester,
      academicYear:    input.academicYear,
      regNumber:       input.regNumber.trim(),
      whatsapp:        input.whatsapp.trim(),
      gender:          input.gender,
      profileComplete: true,
    },
  })
  const unitsEnrolled = await recalculateEnrollments(userId, input)
  return { unitsEnrolled }
}

// ─── Lecturer profile ─────────────────────────────────────────────────────────

export interface LecturerProfileInput {
  facultyId:            string
  additionalFacultyIds: string[]
  whatsapp:             string
  gender:               Gender
}

async function syncAdditionalFaculties(userId: string, primaryFacultyId: string, additionalFacultyIds: string[]): Promise<void> {
  // Deduplicate and exclude the primary faculty
  const unique = [...new Set(additionalFacultyIds)].filter((id) => id !== primaryFacultyId)

  // Validate all additional faculties exist
  if (unique.length > 0) {
    const found = await prisma.faculty.findMany({
      where: { id: { in: unique }, isActive: true },
      select: { id: true },
    })
    if (found.length !== unique.length) {
      throw new ApiError('One or more additional faculties not found or inactive', 404)
    }
  }

  // Replace all additional faculty links
  await prisma.userFaculty.deleteMany({ where: { userId } })
  if (unique.length > 0) {
    await prisma.userFaculty.createMany({
      data: unique.map((facultyId) => ({ userId, facultyId })),
    })
  }
}

/** First-time lecturer profile completion. */
export async function completeLecturerProfile(userId: string, input: LecturerProfileInput) {
  const faculty = await prisma.faculty.findUnique({ where: { id: input.facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)

  await prisma.user.update({
    where: { id: userId },
    data: {
      facultyId:       input.facultyId,
      whatsapp:        input.whatsapp.trim(),
      gender:          input.gender,
      profileComplete: true,
    },
  })
  await syncAdditionalFaculties(userId, input.facultyId, input.additionalFacultyIds)
  return { facultyId: input.facultyId }
}

/** Lecturer updates their profile. */
export async function updateLecturerProfile(userId: string, input: LecturerProfileInput) {
  await assertProfileEditingAllowed('lecturers')
  const faculty = await prisma.faculty.findUnique({ where: { id: input.facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)

  await prisma.user.update({
    where: { id: userId },
    data: {
      facultyId:       input.facultyId,
      whatsapp:        input.whatsapp.trim(),
      gender:          input.gender,
      profileComplete: true,
    },
  })
  await syncAdditionalFaculties(userId, input.facultyId, input.additionalFacultyIds)
  return { facultyId: input.facultyId }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertProfileEditingAllowed(
  scope: Parameters<typeof isProfileEditingEnabled>[0]
): Promise<void> {
  if (!(await isProfileEditingEnabled(scope))) {
    throw new ApiError('Profile editing is currently disabled by the System Admin', 403)
  }
}
