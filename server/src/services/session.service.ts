import { AttendanceStatus, SessionStatus } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { generateUniqueSessionCode } from '../utils/codeGenerator'
import { writeAuditLog } from '../utils/audit'

const CODE_TTL_MINUTES = 5

export interface OpenSessionInput {
  courseUnitId: string
  venue?: string
  academicYear: string
  semester: number
}

async function assertLecturerAssigned(
  lecturerId: string,
  courseUnitId: string,
  academicYear: string,
  semester: number
): Promise<void> {
  const assignment = await prisma.lecturerAssignment.findUnique({
    where: {
      lecturerId_courseUnitId_academicYear_semester: {
        lecturerId,
        courseUnitId,
        academicYear,
        semester,
      },
    },
  })
  if (!assignment) {
    throw new ApiError('You are not assigned to this course unit', 403)
  }
}

function validatePeriod(academicYear: string, semester: number): void {
  if (!/^\d{4}\/\d{4}$/.test(academicYear)) {
    throw new ApiError('Academic year must be like 2025/2026', 400)
  }
  if (!Number.isInteger(semester) || semester < 1 || semester > 2) {
    throw new ApiError('Semester must be 1 or 2', 400)
  }
}

/** Open a new attendance session (FR-05.1 → 05.6). */
export async function openSession(lecturerId: string, input: OpenSessionInput) {
  validatePeriod(input.academicYear, input.semester)
  await assertLecturerAssigned(
    lecturerId,
    input.courseUnitId,
    input.academicYear,
    input.semester
  )

  // FR-05.6: only one active session per course unit at a time
  const existing = await prisma.session.findFirst({
    where: {
      courseUnitId: input.courseUnitId,
      status: 'open',
      academicYear: input.academicYear,
      semester: input.semester,
    },
  })
  if (existing) {
    throw new ApiError('A session is already open for this course unit', 409, 'SESSION_ALREADY_OPEN')
  }

  // FR-05.2/05.3: unique 6-char code from the safe pool
  const code = await generateUniqueSessionCode(async (candidate) => {
    const taken = await prisma.session.findFirst({
      where: { code: candidate, status: 'open' },
      select: { id: true },
    })
    return Boolean(taken)
  })

  const session = await prisma.session.create({
    data: {
      courseUnitId: input.courseUnitId,
      lecturerId,
      academicYear: input.academicYear,
      semester: input.semester,
      code,
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      status: SessionStatus.open,
      venue: input.venue ?? null,
    },
    include: { courseUnit: { select: { id: true, code: true, name: true } } },
  })

  await writeAuditLog(lecturerId, 'SESSION_OPEN', 'session', session.id, {
    courseUnitId: input.courseUnitId,
  })

  return session
}

/** List sessions for units assigned to the lecturer (FR-04.5 scoping). */
export async function listSessions(
  lecturerId: string,
  filters?: { academicYear?: string; semester?: number; status?: SessionStatus }
) {
  const assignments = await prisma.lecturerAssignment.findMany({
    where: { lecturerId },
    select: { courseUnitId: true },
  })
  const unitIds = assignments.map((a) => a.courseUnitId)
  if (unitIds.length === 0) return []

  return prisma.session.findMany({
    where: {
      courseUnitId: { in: unitIds },
      ...(filters?.academicYear ? { academicYear: filters.academicYear } : {}),
      ...(filters?.semester ? { semester: filters.semester } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: {
      courseUnit: { select: { id: true, code: true, name: true } },
      _count: {
        select: {
          attendanceRecords: { where: { status: 'present' } },
        },
      },
    },
    orderBy: { openedAt: 'desc' },
  })
}

/** Get a single session. Lecturer (own units) or Faculty Admin (own faculty). */
export async function getSession(sessionId: string, actor: { id: string; role: string; facultyId: string | null }) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      courseUnit: {
        select: { id: true, code: true, name: true, facultyId: true },
      },
      lecturer: { select: { id: true, fullName: true, email: true } },
    },
  })
  if (!session) throw new ApiError('Session not found', 404)

  if (actor.role === 'lecturer') {
    await assertLecturerAssigned(
      actor.id,
      session.courseUnitId,
      session.academicYear,
      session.semester
    )
  } else if (actor.role === 'faculty_admin') {
    if (session.courseUnit.facultyId !== actor.facultyId) {
      throw new ApiError('Session is outside your faculty', 403)
    }
  } else {
    throw new ApiError('Forbidden', 403)
  }

  return session
}

/** Live check-in data for the lecturer's screen (FR-05.11). */
export async function getLiveSession(sessionId: string, lecturerId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      courseUnit: { select: { id: true, code: true, name: true } },
    },
  })
  if (!session) throw new ApiError('Session not found', 404)
  if (session.lecturerId !== lecturerId) {
    throw new ApiError('You do not own this session', 403)
  }

  const [enrolledCount, presentRecords] = await Promise.all([
    prisma.enrollment.count({
      where: {
        courseUnitId: session.courseUnitId,
        academicYear: session.academicYear,
        semester: session.semester,
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { sessionId, status: 'present' },
      select: {
        id: true,
        checkedInAt: true,
        student: { select: { id: true, fullName: true, regNumber: true } },
      },
      orderBy: { checkedInAt: 'desc' },
    }),
  ])

  return {
    session: {
      id: session.id,
      code: session.code,
      codeExpiresAt: session.codeExpiresAt,
      status: session.status,
      venue: session.venue,
      openedAt: session.openedAt,
      courseUnit: session.courseUnit,
    },
    presentCount: presentRecords.length,
    enrolledCount,
    present: presentRecords,
  }
}

/**
 * Close a session (FR-05.8): every enrolled student without a check-in
 * is auto-marked Absent.
 */
export async function closeSession(sessionId: string, lecturerId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new ApiError('Session not found', 404)
  if (session.lecturerId !== lecturerId) {
    throw new ApiError('You do not own this session', 403)
  }
  if (session.status === 'closed') {
    throw new ApiError('Session is already closed', 400)
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      courseUnitId: session.courseUnitId,
      academicYear: session.academicYear,
      semester: session.semester,
    },
    select: { studentId: true },
  })

  const existing = await prisma.attendanceRecord.findMany({
    where: { sessionId },
    select: { studentId: true },
  })
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

  const closed = await prisma.session.update({
    where: { id: sessionId },
    data: { status: SessionStatus.closed, closedAt: new Date() },
    include: { courseUnit: { select: { id: true, name: true, code: true } } },
  })

  await writeAuditLog(lecturerId, 'SESSION_CLOSE', 'session', session.id, {
    absenteesAutoMarked: absentStudentIds.length,
  })

  return { session: closed, absenteesAutoMarked: absentStudentIds.length }
}

/** Reopen a closed session on the same day (FR-05.9). */
export async function reopenSession(sessionId: string, lecturerId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new ApiError('Session not found', 404)
  if (session.lecturerId !== lecturerId) {
    throw new ApiError('You do not own this session', 403)
  }
  if (session.status !== 'closed') {
    throw new ApiError('Session is not closed', 400)
  }

  const opened = session.closedAt ?? session.openedAt
  const sameDay =
    opened.toDateString() === new Date().toDateString()
  if (!sameDay) {
    throw new ApiError('Sessions can only be reopened on the same day', 400)
  }

  // New code + expiry so students can check in again
  const code = await generateUniqueSessionCode(async (candidate) => {
    const taken = await prisma.session.findFirst({
      where: { code: candidate, status: 'open' },
      select: { id: true },
    })
    return Boolean(taken)
  })

  const reopened = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: SessionStatus.open,
      code,
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      closedAt: null,
    },
  })

  return reopened
}
