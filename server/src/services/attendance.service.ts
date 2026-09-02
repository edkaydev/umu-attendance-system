import { AttendanceStatus, SessionStatus } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { attendancePercentage, attendanceStatus } from '../utils/attendanceCalc'
import { writeAuditLog } from '../utils/audit'

/** All records of a session with student details (FR-05.12 / FR-07.5).
 *  Lecturer must own the session; Faculty Admin must be in the same or shared faculty. */
export async function getSessionAttendance(
  sessionId: string,
  actor: { id: string; role: string; facultyId: string | null }
) {
  // Fetch session with faculty info for scope check
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      lecturerId: true,
      courseUnit: {
        select: {
          facultyId: true,
          sharedFaculties: { select: { facultyId: true } },
        },
      },
    },
  })
  if (!session) throw new ApiError('Session not found', 404)

  if (actor.role === 'lecturer') {
    if (session.lecturerId !== actor.id) {
      throw new ApiError('You can only view attendance for your own sessions', 403)
    }
  } else if (actor.role === 'faculty_admin') {
    const allowed = new Set([
      session.courseUnit.facultyId,
      ...session.courseUnit.sharedFaculties.map((sf) => sf.facultyId),
    ])
    if (!actor.facultyId || !allowed.has(actor.facultyId)) {
      throw new ApiError('Session is outside your faculty', 403)
    }
  } else if (actor.role !== 'system_admin') {
    throw new ApiError('Forbidden', 403)
  }

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

/**
 * Student's own attendance per unit for the current period (FR-07.2).
 * "Current" = the most recent academicYear/semester the student is enrolled in.
 */
export async function getMyAttendance(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    select: {
      courseUnitId: true,
      courseUnit: { select: { id: true, code: true, name: true } },
      academicYear: true,
      semester: true,
    },
    orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
  })

  if (enrollments.length === 0) {
    return { period: null, units: [] }
  }

  const { academicYear, semester } = enrollments[0]
  const units = enrollments.filter(
    (e) => e.academicYear === academicYear && e.semester === semester
  )

  const closedSessions = await prisma.session.findMany({
    where: {
      courseUnitId: { in: units.map((u) => u.courseUnitId) },
      academicYear,
      semester,
      status: SessionStatus.closed,
    },
    select: { id: true, courseUnitId: true },
  })

  const totalByUnit = new Map<string, number>()
  const sessionToUnit = new Map<string, string>()
  for (const s of closedSessions) {
    totalByUnit.set(s.courseUnitId, (totalByUnit.get(s.courseUnitId) ?? 0) + 1)
    sessionToUnit.set(s.id, s.courseUnitId)
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId, sessionId: { in: closedSessions.map((s) => s.id) } },
    select: { sessionId: true, status: true },
  })

  const presentExcusedByUnit = new Map<string, number>()
  for (const r of records) {
    const unitId = sessionToUnit.get(r.sessionId)
    if (unitId && (r.status === 'present' || r.status === 'excused')) {
      presentExcusedByUnit.set(unitId, (presentExcusedByUnit.get(unitId) ?? 0) + 1)
    }
  }

  return {
    period: { academicYear, semester },
    units: units.map((u) => {
      const attended = presentExcusedByUnit.get(u.courseUnitId) ?? 0
      const total = totalByUnit.get(u.courseUnitId) ?? 0
      // No closed sessions yet → no meaningful percentage (avoids a fake "100% Good")
      if (total === 0) {
        return { courseUnit: u.courseUnit, sessionsHeld: 0, attended: 0, percentage: null, status: 'none' as const }
      }
      const pct = attendancePercentage(attended, total)
      return {
        courseUnit: u.courseUnit,
        sessionsHeld: total,
        attended,
        percentage: Number(pct.toFixed(2)),
        status: attendanceStatus(pct),
      }
    }),
  }
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
 * Manual attendance edit (FR-07.4/07.5):
 * requires a reason, stored in attendance_edits + audit_logs.
 * Lecturer owns the session; Faculty Admin within own faculty.
 */
export async function editAttendance(
  recordId: string,
  newStatus: AttendanceStatus,
  reason: string,
  editor: { id: string; role: string; facultyId: string | null }
) {
  if (!reason.trim()) {
    throw new ApiError('A reason is required for attendance edits', 400)
  }

  const record = await prisma.attendanceRecord.findUnique({
    where: { id: recordId },
    include: {
      session: {
        include: {
          courseUnit: {
            select: {
              facultyId: true,
              sharedFaculties: { select: { facultyId: true } },
            },
          },
        },
      },
    },
  })
  if (!record) throw new ApiError('Attendance record not found', 404)
  if (record.status === newStatus) {
    throw new ApiError('Status is already ' + newStatus, 400)
  }

  // Only Faculty Admin and System Admin can edit attendance records.
  // Lecturers are not permitted to change a student's recorded status.
  if (editor.role === 'lecturer') {
    throw new ApiError('Lecturers cannot edit attendance records. Contact your Faculty Admin.', 403)
  } else if (editor.role === 'faculty_admin') {
    const allowedFaculties = new Set([
      record.session.courseUnit.facultyId,
      ...record.session.courseUnit.sharedFaculties.map((sf) => sf.facultyId),
    ])
    if (!editor.facultyId || !allowedFaculties.has(editor.facultyId)) {
      throw new ApiError('This session is outside your faculty', 403)
    }
  } else if (editor.role !== 'system_admin') {
    throw new ApiError('Forbidden', 403)
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
    sessionId: record.sessionId,
    from: record.status,
    to: newStatus,
    reason,
  })

  return updated[0]
}
