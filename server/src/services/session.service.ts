import { AttendanceStatus, SessionMode, SessionStatus } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { generateUniqueSessionCode } from '../utils/codeGenerator'
import { writeAuditLog } from '../utils/audit'
import { isWithinCampus, geofence } from '../config/geofence'
import { notifySessionOpened } from './email.service'

const DEFAULT_CODE_TTL = 5 // minutes

export interface OpenSessionInput {
  courseUnitId: string
  venue?: string
  mode?: SessionMode
  startsAt?: string
  academicYear: string
  semester: number
  classDuration?: number  // 1–180 min; null = no auto-close
  codeTtl?: number        // 5–60 min; defaults to 5
  /** Lecturer GPS — required for physical sessions (Check 1). */
  lat?: number
  lng?: number
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

  const mode = input.mode ?? SessionMode.physical

  // ── Check 1: physical sessions require the lecturer to be on campus ──────
  if (mode === SessionMode.physical) {
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
      throw new ApiError(
        'Please enable location access and try again',
        400,
        'LOCATION_REQUIRED'
      )
    }
    if (!isWithinCampus(input.lat!, input.lng!)) {
      throw new ApiError(
        'You appear to be off campus. You need to be on campus to open a physical session.',
        403,
        'LECTURER_OUTSIDE_CAMPUS'
      )
    }
  }

  let startsAt: Date | null = null
  if (input.startsAt) {
    startsAt = new Date(input.startsAt)
    if (Number.isNaN(startsAt.getTime())) {
      throw new ApiError('Invalid session time', 400)
    }
  }

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

  const codeTtlMinutes = Math.min(60, Math.max(5, input.codeTtl ?? DEFAULT_CODE_TTL))
  const classDuration = input.classDuration
    ? Math.min(180, Math.max(1, input.classDuration))
    : null

  const session = await prisma.session.create({
    data: {
      courseUnitId: input.courseUnitId,
      lecturerId,
      academicYear: input.academicYear,
      semester: input.semester,
      code,
      codeExpiresAt: new Date(Date.now() + codeTtlMinutes * 60_000),
      status: SessionStatus.open,
      venue: input.venue ?? null,
      mode,
      startsAt,
      classDuration,
      codeTtl: codeTtlMinutes,
      // Store lecturer position for student proximity check (physical only)
      lecturerLat: mode === SessionMode.physical ? input.lat : null,
      lecturerLng: mode === SessionMode.physical ? input.lng : null,
      proximityRadius: mode === SessionMode.physical ? geofence.lecturerProximityMeters : null,
    },
    include: { courseUnit: { select: { id: true, code: true, name: true } } },
  })

  await writeAuditLog(lecturerId, 'SESSION_OPEN', 'session', session.id, {
    courseUnitId: input.courseUnitId,
  })

  // Notify enrolled students that check-in is open (includes closing time,
  // never the code). Fire-and-forget — an SMTP hiccup must not fail the open.
  void notifySessionOpened(session.id)

  return session
}

/** List sessions owned by the lecturer. Supports optional today/date filtering. */
export async function listSessions(
  lecturerId: string,
  filters?: {
    academicYear?: string
    semester?: number
    status?: SessionStatus
    /** ISO date string YYYY-MM-DD — only return sessions opened on this day */
    date?: string
    /** convenience flag: only return sessions opened today (server timezone) */
    today?: boolean
  }
) {
  // Build the date range if requested
  let dateFilter: { gte: Date; lt: Date } | undefined
  if (filters?.today) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    dateFilter = { gte: start, lt: end }
  } else if (filters?.date) {
    // Accept YYYY-MM-DD
    const start = new Date(filters.date + 'T00:00:00')
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      dateFilter = { gte: start, lt: end }
    }
  }

  return prisma.session.findMany({
    where: {
      // Scope strictly to sessions this lecturer opened — not just units assigned
      lecturerId,
      ...(filters?.academicYear ? { academicYear: filters.academicYear } : {}),
      ...(filters?.semester ? { semester: filters.semester } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(dateFilter ? { openedAt: dateFilter } : {}),
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

/** List all sessions belonging to course units within a faculty (Faculty Admin view). */
export async function listSessionsForFaculty(
  facultyId: string,
  filters?: {
    academicYear?: string
    semester?: number
    status?: SessionStatus
    today?: boolean
    date?: string
  }
) {
  let dateFilter: { gte: Date; lt: Date } | undefined
  if (filters?.today) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    dateFilter = { gte: start, lt: end }
  } else if (filters?.date) {
    const start = new Date(filters.date + 'T00:00:00')
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      dateFilter = { gte: start, lt: end }
    }
  }

  return prisma.session.findMany({
    where: {
      courseUnit: { facultyId },
      ...(filters?.academicYear ? { academicYear: filters.academicYear } : {}),
      ...(filters?.semester ? { semester: filters.semester } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(dateFilter ? { openedAt: dateFilter } : {}),
    },
    include: {
      courseUnit: { select: { id: true, code: true, name: true } },
      lecturer: { select: { id: true, fullName: true } },
      _count: {
        select: {
          attendanceRecords: { where: { status: 'present' } },
        },
      },
    },
    orderBy: { openedAt: 'desc' },
  })
}

/** Get a single session + attendance list. Lecturer (own units) or Faculty Admin (own or shared faculty). */
export async function getSession(sessionId: string, actor: { id: string; role: string; facultyId: string | null }) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      courseUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          facultyId: true,
          sharedFaculties: { select: { facultyId: true } },
        },
      },
      lecturer: { select: { id: true, fullName: true, email: true } },
      attendanceRecords: {
        select: {
          id: true,
          status: true,
          checkedInAt: true,
          edits: {
            take: 1,
            orderBy: { changedAt: 'desc' },
            select: { oldStatus: true, newStatus: true, reason: true, changedAt: true },
          },
          student: { select: { id: true, regNumber: true, fullName: true, email: true } },
        },
        orderBy: { student: { fullName: 'asc' } },
      },
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

  const counts = session.attendanceRecords.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    { present: 0, absent: 0, excused: 0 }
  )

  return { ...session, counts }
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
      mode: session.mode,
      startsAt: session.startsAt,
      openedAt: session.openedAt,
      classDuration: session.classDuration,
      codeTtl: session.codeTtl ?? DEFAULT_CODE_TTL,
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
  // Compare calendar dates in EAT (UTC+3) so the check reflects the lecturer's
  // local day at Nkozi Campus, Uganda.
  //
  // ⚠️  TIMEZONE NOTE: the +3 offset is hardcoded here because the system is
  // deployed exclusively at UMU Nkozi (EAT, UTC+3, no DST).  If the system is
  // ever deployed in a different timezone, replace the constant with a
  // configurable offset (e.g. process.env.TZ_OFFSET_HOURS) or switch to a
  // timezone-aware library such as Luxon.
  const toEATDate = (d: Date) => {
    const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000)
    return eat.toISOString().slice(0, 10) // "YYYY-MM-DD"
  }
  const sameDay = toEATDate(opened) === toEATDate(new Date())
  if (!sameDay) {
    throw new ApiError('Sessions can only be reopened on the same day', 400)
  }

  // New code + expiry using the original codeTtl
  const ttl = session.codeTtl ?? DEFAULT_CODE_TTL
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
      codeExpiresAt: new Date(Date.now() + ttl * 60_000),
      closedAt: null,
    },
  })

  return reopened
}

/** Extend an open session by N minutes (same code, keeps the session live).
 *  Extends BOTH the code expiry and the class time so the "Class time remaining"
 *  countdown (openedAt + classDuration) stays in sync with reality.
 *  Extension is blocked once the class time is nearly over (< 5 min left). */
export async function extendSessionTime(sessionId: string, lecturerId: string, minutes = DEFAULT_CODE_TTL) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new ApiError('Session not found', 404)
  if (session.lecturerId !== lecturerId) {
    throw new ApiError('You do not own this session', 403)
  }
  if (session.status !== SessionStatus.open) {
    throw new ApiError('Only open sessions can be extended', 400)
  }

  // Block extending when the class is nearly over — the lecturer should close
  // the session instead of keeping the code alive after the class has ended.
  if (session.classDuration) {
    const elapsedMinutes = (Date.now() - session.openedAt.getTime()) / 60_000
    const remainingMinutes = session.classDuration - elapsedMinutes
    if (remainingMinutes < 5) {
      throw new ApiError('Class time is nearly over — close the session instead of extending', 400, 'CLASS_TIME_ENDING')
    }
  }

  const base = Math.max(session.codeExpiresAt.getTime(), Date.now())
  const codeExpiresAt = new Date(base + minutes * 60_000)
  const classDuration = session.classDuration
    ? session.classDuration + minutes
    : session.classDuration

  const extended = await prisma.session.update({
    where: { id: sessionId },
    data: { codeExpiresAt, classDuration },
    include: { courseUnit: { select: { id: true, code: true, name: true } } },
  })

  await writeAuditLog(lecturerId, 'SESSION_EXTEND', 'session', session.id, {
    minutes,
    codeExpiresAt: codeExpiresAt.toISOString(),
    classDuration,
  })

  return extended
}
