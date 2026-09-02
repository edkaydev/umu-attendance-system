import { AttendanceStatus, SessionStatus } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { publish } from './events.service'
import { ApiError } from '../utils/apiResponse'
import { isWithinCampus, isNearLecturer } from '../config/geofence'

export interface CheckInLocation {
  lat: number
  lng: number
}

/**
 * Student check-in using the 6-character session code (FR-06.1 → 06.6).
 * Physical sessions are geo-fenced — the student's location must be inside
 * the campus radius. Online sessions skip the location check entirely.
 */
export async function checkIn(
  studentId: string,
  code: string,
  location?: CheckInLocation
): Promise<{
  courseUnit: { id: string; name: string; code: string }
  date: string
  status: string
}> {
  const normalized = code.trim().toUpperCase()

  // FR-06.2: code exists, session is open, AND code has not expired.
  // Merging the expiry check into the DB query avoids a redundant round-trip
  // and returns a single INVALID_CODE error for both "no such session" and
  // "session exists but code expired" — preventing information leakage.
  const session = await prisma.session.findFirst({
    where: {
      code: normalized,
      status: SessionStatus.open,
      codeExpiresAt: { gt: new Date() },
    },
    include: { courseUnit: { select: { id: true, name: true, code: true } } },
  })

  if (!session) {
    throw new ApiError('Invalid or expired code', 400, 'INVALID_CODE')
  }

  // Geo-fence: physical sessions require a location inside the campus radius
  // AND within proximity of the lecturer's recorded position (two checks).
  if (session.mode === 'physical') {
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
      throw new ApiError('Please enable location access and try again', 400, 'LOCATION_REQUIRED')
    }

    // Check 1: student must be within campus bounds
    if (!isWithinCampus(location.lat, location.lng)) {
      throw new ApiError('You appear to be off campus. Move closer and try again.', 403, 'OUTSIDE_CAMPUS')
    }

    // Check 2: student must be near the lecturer
    const lLat = session.lecturerLat ? Number(session.lecturerLat) : null
    const lLng = session.lecturerLng ? Number(session.lecturerLng) : null
    if (lLat !== null && lLng !== null) {
      if (!isNearLecturer(location.lat, location.lng, lLat, lLng, session.proximityRadius)) {
        throw new ApiError(
          'You appear to be outside the classroom. Move closer and try again.',
          403,
          'TOO_FAR_FROM_LECTURER'
        )
      }
    }
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

  // FR-06.3: one check-in per session.
  // Check first so we can give a clear ALREADY_CHECKED_IN error for the
  // normal case. The create below is additionally guarded against the race
  // condition where two concurrent requests both pass this findUnique before
  // either has written — the DB @@unique([sessionId, studentId]) will reject
  // the second insert with a P2002; we catch that and surface the same error.
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
    try {
      await prisma.attendanceRecord.create({
        data: {
          sessionId: session.id,
          studentId,
          status: AttendanceStatus.present,
          checkedInAt: new Date(),
        },
      })
    } catch (err) {
      // Two concurrent requests both passed the findUnique guard simultaneously.
      // The DB unique constraint fires on the second insert — treat it as a
      // benign duplicate rather than an internal server error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('You have already checked in to this session', 409, 'ALREADY_CHECKED_IN')
      }
      throw err
    }
  }

  publish('attendance-changed')

  // FR-06.4: confirmation with course unit, date, status
  return {
    courseUnit: session.courseUnit,
    date: new Date().toISOString().slice(0, 10),
    status: AttendanceStatus.present,
  }
}

/** Open sessions for course units the student is enrolled in (live check-in discovery). */
export async function listLiveForStudent(studentId: string) {
  // Pull the student's enrolled (courseUnitId, academicYear, semester) tuples.
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    select: { courseUnitId: true, academicYear: true, semester: true },
  })

  if (enrollments.length === 0) return []

  // Push the enrollment filter into the DB query instead of fetching all open
  // sessions and filtering in memory.  The OR list is bounded by the number of
  // course units the student is enrolled in (typically ≤ 10).
  const openSessions = await prisma.session.findMany({
    where: {
      status: SessionStatus.open,
      OR: enrollments.map((e) => ({
        courseUnitId: e.courseUnitId,
        academicYear: e.academicYear,
        semester: e.semester,
      })),
    },
    include: {
      courseUnit: { select: { id: true, code: true, name: true } },
      lecturer: { select: { id: true, fullName: true } },
    },
    orderBy: { openedAt: 'desc' },
  })

  if (openSessions.length === 0) return []

  const checkedInRecords = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      sessionId: { in: openSessions.map((s) => s.id) },
      status: AttendanceStatus.present,
    },
    select: { sessionId: true },
  })
  const checkedIn = new Set(checkedInRecords.map((r) => r.sessionId))

  const pendingExcuses = await prisma.excuseRequest.findMany({
    where: {
      studentId,
      sessionId: { in: openSessions.map((s) => s.id) },
      status: 'pending',
    },
    select: { sessionId: true },
  })
  const excusePending = new Set(pendingExcuses.map((e) => e.sessionId))

  return openSessions.map((s) => ({
    id: s.id,
    courseUnit: s.courseUnit,
    lecturer: s.lecturer,
    venue: s.venue,
    meetingLink: s.meetingLink,
    mode: s.mode,
    startsAt: s.startsAt,
    openedAt: s.openedAt,
    codeExpiresAt: s.codeExpiresAt,
    classDuration: s.classDuration,
    checkedIn: checkedIn.has(s.id),
    excusePending: excusePending.has(s.id),
  }))
}
