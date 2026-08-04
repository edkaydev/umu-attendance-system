import { AttendanceStatus, SessionStatus } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'

/**
 * Student check-in using the 6-character session code (FR-06.1 → 06.6).
 */
export async function checkIn(studentId: string, code: string): Promise<{
  courseUnit: { id: string; name: string; code: string }
  date: string
  status: string
}> {
  const normalized = code.trim().toUpperCase()

  // FR-06.2: code exists and session is open
  const session = await prisma.session.findFirst({
    where: { code: normalized, status: SessionStatus.open },
    include: { courseUnit: { select: { id: true, name: true, code: true } } },
  })

  if (!session) {
    throw new ApiError('Invalid or expired code', 400, 'INVALID_CODE')
  }

  // FR-06.2: code not expired (5-minute validity)
  if (session.codeExpiresAt < new Date()) {
    throw new ApiError('Session code has expired', 400, 'CODE_EXPIRED')
  }

  // FR-06.2: student is enrolled in the course unit for this period
  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_courseUnitId_academicYear_semester: {
        studentId,
        courseUnitId: session.courseUnitId,
        academicYear: session.academicYear,
        semester: session.semester,
      },
    },
  })
  if (!enrollment) {
    throw new ApiError('You are not enrolled in this course unit', 403, 'NOT_ENROLLED')
  }

  // FR-06.3: one check-in per session
  const existing = await prisma.attendanceRecord.findUnique({
    where: { sessionId_studentId: { sessionId: session.id, studentId } },
  })
  if (existing && existing.status === 'present') {
    throw new ApiError('You have already checked in to this session', 409, 'ALREADY_CHECKED_IN')
  }

  // If a reopened session recorded the student as absent, upgrade to present.
  if (existing) {
    await prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: { status: AttendanceStatus.present, checkedInAt: new Date() },
    })
  } else {
    await prisma.attendanceRecord.create({
      data: {
        sessionId: session.id,
        studentId,
        status: AttendanceStatus.present,
        checkedInAt: new Date(),
      },
    })
  }

  // FR-06.4: confirmation with course unit, date, status
  return {
    courseUnit: session.courseUnit,
    date: new Date().toISOString().slice(0, 10),
    status: AttendanceStatus.present,
  }
}
