import { AttendanceStatus } from '@prisma/client'
import { prisma } from '../config/db'
import { publish } from './events.service'
import { ApiError } from '../utils/apiResponse'

/**
 * Student submits an excuse request for a session.
 * - Must be enrolled in the course unit for that period
 * - Must not have already checked in
 * - Must not already have a pending/approved excuse for this session
 * - Session must be open
 */
export async function submitExcuse(
  studentId: string,
  sessionId: string,
  reason: string
) {
  if (!reason.trim()) {
    throw new ApiError('A reason is required', 400)
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new ApiError('Session not found', 404)
  if (session.status !== 'open') {
    throw new ApiError('This session is no longer open', 400, 'SESSION_CLOSED')
  }

  // Must be enrolled
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

  // Must not have already checked in
  const existingRecord = await prisma.attendanceRecord.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
  })
  if (existingRecord && existingRecord.status === 'present') {
    throw new ApiError('You have already checked in to this session', 409, 'ALREADY_CHECKED_IN')
  }

  // Must not already have a pending or approved excuse
  const existingExcuse = await prisma.excuseRequest.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
  })
  if (existingExcuse) {
    if (existingExcuse.status === 'pending') {
      throw new ApiError('You already have a pending excuse request for this session', 409, 'EXCUSE_ALREADY_PENDING')
    }
    if (existingExcuse.status === 'approved') {
      throw new ApiError('Your excuse for this session has already been approved', 409, 'EXCUSE_ALREADY_APPROVED')
    }
    // Was rejected — allow resubmission
    const updated = await prisma.excuseRequest.update({
      where: { id: existingExcuse.id },
      data: { reason: reason.trim(), status: 'pending', reviewedById: null, reviewedAt: null },
    })
    publish('excuse-changed')
    return updated
  }

  const excuse = await prisma.excuseRequest.create({
    data: {
      studentId,
      sessionId,
      reason: reason.trim(),
    },
  })

  publish('excuse-changed')
  return excuse
}

/**
 * Lecturer approves an excuse request → student marked as excused.
 * The excuse record is deleted after approval since the attendance record is the source of truth.
 */
export async function approveExcuse(
  excuseId: string,
  lecturerId: string
) {
  const excuse = await prisma.excuseRequest.findUnique({
    where: { id: excuseId },
    include: { session: true },
  })
  if (!excuse) throw new ApiError('Excuse request not found', 404)
  if (excuse.status !== 'pending') {
    throw new ApiError('This request has already been reviewed', 400, 'ALREADY_REVIEWED')
  }
  if (excuse.session.lecturerId !== lecturerId) {
    throw new ApiError('You do not own this session', 403)
  }
  if (excuse.session.status !== 'open') {
    throw new ApiError('Session is no longer open', 400, 'SESSION_CLOSED')
  }

  // Create or update attendance record as excused, then delete the excuse request
  const existingRecord = await prisma.attendanceRecord.findUnique({
    where: { sessionId_studentId: { sessionId: excuse.sessionId, studentId: excuse.studentId } },
  })

  await prisma.$transaction([
    existingRecord
      ? prisma.attendanceRecord.update({
          where: { id: existingRecord.id },
          data: { status: AttendanceStatus.excused },
        })
      : prisma.attendanceRecord.create({
          data: {
            sessionId: excuse.sessionId,
            studentId: excuse.studentId,
            status: AttendanceStatus.excused,
            checkedInAt: new Date(),
          },
        }),
    prisma.excuseRequest.delete({ where: { id: excuseId } }),
  ])

  publish('attendance-changed')
  publish('excuse-changed')
}

/**
 * Lecturer rejects an excuse request → student marked as absent.
 * The excuse record is deleted after rejection.
 */
export async function rejectExcuse(
  excuseId: string,
  lecturerId: string
) {
  const excuse = await prisma.excuseRequest.findUnique({
    where: { id: excuseId },
    include: { session: true },
  })
  if (!excuse) throw new ApiError('Excuse request not found', 404)
  if (excuse.status !== 'pending') {
    throw new ApiError('This request has already been reviewed', 400, 'ALREADY_REVIEWED')
  }
  if (excuse.session.lecturerId !== lecturerId) {
    throw new ApiError('You do not own this session', 403)
  }
  if (excuse.session.status !== 'open') {
    throw new ApiError('Session is no longer open', 400, 'SESSION_CLOSED')
  }

  // Create or update attendance record as absent, then delete the excuse request
  const existingRecord = await prisma.attendanceRecord.findUnique({
    where: { sessionId_studentId: { sessionId: excuse.sessionId, studentId: excuse.studentId } },
  })

  await prisma.$transaction([
    existingRecord
      ? prisma.attendanceRecord.update({
          where: { id: existingRecord.id },
          data: { status: AttendanceStatus.absent },
        })
      : prisma.attendanceRecord.create({
          data: {
            sessionId: excuse.sessionId,
            studentId: excuse.studentId,
            status: AttendanceStatus.absent,
          },
        }),
    prisma.excuseRequest.delete({ where: { id: excuseId } }),
  ])

  publish('attendance-changed')
  publish('excuse-changed')
}

/**
 * Auto-reject all pending excuse requests for a session (called on session close).
 * Each pending request becomes an absent record.
 */
export async function autoRejectPendingExcuses(sessionId: string): Promise<number> {
  const pending = await prisma.excuseRequest.findMany({
    where: { sessionId, status: 'pending' },
  })

  if (pending.length === 0) return 0

  // Batch: create absent records for students with no existing attendance record
  const existingRecords = await prisma.attendanceRecord.findMany({
    where: {
      sessionId,
      studentId: { in: pending.map((p) => p.studentId) },
    },
    select: { studentId: true },
  })
  const alreadyRecorded = new Set(existingRecords.map((r) => r.studentId))

  const toCreate = pending
    .filter((p) => !alreadyRecorded.has(p.studentId))
    .map((p) => ({
      sessionId,
      studentId: p.studentId,
      status: AttendanceStatus.absent,
    }))

  await prisma.$transaction([
    ...(toCreate.length > 0
      ? [prisma.attendanceRecord.createMany({ data: toCreate })]
      : []),
    prisma.excuseRequest.deleteMany({ where: { sessionId, status: 'pending' } }),
  ])

  return pending.length
}
