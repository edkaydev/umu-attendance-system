import { AttendanceStatus, SessionStatus } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { attendancePercentage, attendanceStatus } from '../utils/attendanceCalc'
import { writeAuditLog } from '../utils/audit'

/** One session's records for a student (FR-07.1). */
export async function getMySessionAttendance(studentId: string, sessionId: string) {
  const record = await prisma.attendanceRecord.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
    select: {
      status: true,
      checkedInAt: true,
      edits: {
        take: 1,
        orderBy: { changedAt: 'desc' },
        select: { oldStatus: true, newStatus: true, reason: true, changedAt: true },
      },
      session: {
        select: {
          id: true,
          openedAt: true,
          closedAt: true,
          status: true,
          venue: true,
          courseUnit: { select: { id: true, code: true, name: true } },
        },
      },
    },
  })

  if (!record) {
    return {
      session: await prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          openedAt: true,
          closedAt: true,
          status: true,
          venue: true,
          courseUnit: { select: { id: true, code: true, name: true } },
        },
      }),
      record: null,
    }
  }

  return { session: record.session, record }
}

/** All records of a session with student details (FR-05.12 / FR-07.5). */
export async function getSessionAttendance(sessionId: string) {
  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId },
    select: {
      id: true,
      status: true,
      checkedInAt: true,
      edits: {
        take: 1,
        orderBy: { changedAt: 'desc' },
        select: {
          oldStatus: true,
          newStatus: true,
          reason: true,
          changedAt: true,
          changedBy: { select: { fullName: true } },
        },
      },
      student: {
        select: {
          id: true,
          regNumber: true,
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: { student: { fullName: 'asc' } },
  })

  const counts = records.reduce<Record<AttendanceStatus, number>>(
    (acc, r) => {
      acc[r.status] += 1
      return acc
    },
    { present: 0, absent: 0, excused: 0 }
  )

  return { records, counts }
}

/** Attendance percentage + status per student for one course unit (FR-07.3). */
export async function getUnitSummary(courseUnitId: string, academicYear: string, semester: number) {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseUnitId, academicYear, semester },
    select: {
      student: { select: { id: true, regNumber: true, fullName: true } },
    },
  })

  const closedSessions = await prisma.session.findMany({
    where: { courseUnitId, academicYear, semester, status: SessionStatus.closed },
    select: { id: true },
  })
  const totalSessions = closedSessions.length

  const records = await prisma.attendanceRecord.findMany({
    where: {
      sessionId: { in: closedSessions.map((s) => s.id) },
    },
    select: { sessionId: true, studentId: true, status: true },
  })

  const studentPresentExcused = new Map<string, number>()
  for (const r of records) {
    if (r.status === 'present' || r.status === 'excused') {
      studentPresentExcused.set(r.studentId, (studentPresentExcused.get(r.studentId) ?? 0) + 1)
    }
  }

  return {
    courseUnitId,
    totalSessions,
    students: enrollments.map((e) => {
      const attended = studentPresentExcused.get(e.student.id) ?? 0
      const pct = attendancePercentage(attended, totalSessions)
      return {
        student: e.student,
        percentage: Number(pct.toFixed(2)),
        status: attendanceStatus(pct),
      }
    }),
  }
}

/**
 * Manual attendance edit (FR-07.5 / FR-07.6):
 * requires a reason, stored in attendance_edits + audit_logs.
 */
export async function editAttendance(
  sessionId: string,
  studentId: string,
  newStatus: AttendanceStatus,
  reason: string,
  editor: { id: string; role: string }
) {
  if (!reason.trim()) {
    throw new ApiError('A reason is required for attendance edits', 400)
  }

  const record = await prisma.attendanceRecord.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
  })
  if (!record) throw new ApiError('Attendance record not found', 404)
  if (record.status === newStatus) {
    throw new ApiError('Status is already ' + newStatus, 400)
  }

  const updated = await prisma.$transaction([
    prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { status: newStatus },
    }),
    prisma.attendanceEdit.create({
      data: {
        attendanceRecordId: record.id,
        changedById: editor.id,
        oldStatus: record.status,
        newStatus,
        reason: reason.trim(),
      },
    }),
  ])

  await writeAuditLog(editor.id, 'ATTENDANCE_EDIT', 'attendance_record', record.id, {
    sessionId,
    from: record.status,
    to: newStatus,
    reason,
  })

  return updated[0]
}
