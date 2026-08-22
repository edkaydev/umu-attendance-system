import { AttendanceStatus } from '@prisma/client'
import { prisma } from '../config/db'

/** The period a session belongs to, used to find the students enrolled in it. */
export interface SessionEnrollmentScope {
  courseUnitId: string
  academicYear: string
  semester: number
}

/**
 * Auto-mark absent (FR-05.8) every student enrolled in the session's unit and
 * period who has no attendance record yet. Returns how many were created.
 */
export async function markAbsentees(
  sessionId: string,
  session: SessionEnrollmentScope
): Promise<number> {
  const [enrollments, existing] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        courseUnitId: session.courseUnitId,
        academicYear: session.academicYear,
        semester: session.semester,
      },
      select: { studentId: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { sessionId },
      select: { studentId: true },
    }),
  ])

  const checkedInIds = new Set(existing.map((r) => r.studentId))
  const absentStudentIds = enrollments
    .map((e) => e.studentId)
    .filter((id) => !checkedInIds.has(id))

  if (absentStudentIds.length > 0) {
    await prisma.attendanceRecord.createMany({
      data: absentStudentIds.map((studentId) => ({
        sessionId,
        studentId,
        status: AttendanceStatus.absent,
      })),
    })
  }

  return absentStudentIds.length
}
