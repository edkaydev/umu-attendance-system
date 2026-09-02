/**
 * excuse.service unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/db', () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    enrollment: { findUnique: vi.fn() },
    attendanceRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
    excuseRequest: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((ops) => Promise.all(ops)),
  },
}))

vi.mock('./events.service', () => ({ publish: vi.fn() }))

import { prisma } from '../config/db'
import { submitExcuse, approveExcuse, rejectExcuse, autoRejectPendingExcuses } from './excuse.service'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

function makeOpenSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess1',
    courseUnitId: 'cu1',
    lecturerId: 'lec1',
    academicYear: '2025/2026',
    semester: 1,
    status: 'open',
    ...overrides,
  }
}

function makeExcuse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exc1',
    studentId: 'stu1',
    sessionId: 'sess1',
    status: 'pending',
    reason: 'Sick',
    session: makeOpenSession(),
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('submitExcuse', () => {
  it('throws 400 when reason is empty', async () => {
    await expect(submitExcuse('stu1', 'sess1', '   ')).rejects.toMatchObject({ status: 400 })
  })

  it('throws 404 when session not found', async () => {
    db.session.findUnique.mockResolvedValue(null)
    await expect(submitExcuse('stu1', 'sess1', 'Sick')).rejects.toMatchObject({ status: 404 })
  })

  it('throws 400 when session is closed', async () => {
    db.session.findUnique.mockResolvedValue(makeOpenSession({ status: 'closed' }))
    await expect(submitExcuse('stu1', 'sess1', 'Sick')).rejects.toMatchObject({ code: 'SESSION_CLOSED' })
  })

  it('throws 403 when not enrolled', async () => {
    db.session.findUnique.mockResolvedValue(makeOpenSession())
    db.enrollment.findUnique.mockResolvedValue(null)
    await expect(submitExcuse('stu1', 'sess1', 'Sick')).rejects.toMatchObject({ code: 'NOT_ENROLLED' })
  })

  it('throws 409 when already checked in', async () => {
    db.session.findUnique.mockResolvedValue(makeOpenSession())
    db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
    db.attendanceRecord.findUnique.mockResolvedValue({ id: 'rec1', status: 'present' })
    await expect(submitExcuse('stu1', 'sess1', 'Sick')).rejects.toMatchObject({ code: 'ALREADY_CHECKED_IN' })
  })

  it('throws 409 when excuse already pending', async () => {
    db.session.findUnique.mockResolvedValue(makeOpenSession())
    db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
    db.attendanceRecord.findUnique.mockResolvedValue(null)
    db.excuseRequest.findUnique.mockResolvedValue({ id: 'exc1', status: 'pending' })
    await expect(submitExcuse('stu1', 'sess1', 'Sick')).rejects.toMatchObject({ code: 'EXCUSE_ALREADY_PENDING' })
  })

  it('creates a new excuse request', async () => {
    db.session.findUnique.mockResolvedValue(makeOpenSession())
    db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
    db.attendanceRecord.findUnique.mockResolvedValue(null)
    db.excuseRequest.findUnique.mockResolvedValue(null)
    db.excuseRequest.create.mockResolvedValue(makeExcuse())

    await submitExcuse('stu1', 'sess1', 'I am unwell')
    expect(db.excuseRequest.create).toHaveBeenCalledWith({
      data: { studentId: 'stu1', sessionId: 'sess1', reason: 'I am unwell' },
    })
  })

  it('resubmits a previously rejected request', async () => {
    db.session.findUnique.mockResolvedValue(makeOpenSession())
    db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
    db.attendanceRecord.findUnique.mockResolvedValue(null)
    db.excuseRequest.findUnique.mockResolvedValue({ id: 'exc1', status: 'rejected' })
    db.excuseRequest.update.mockResolvedValue({ id: 'exc1', status: 'pending' })

    await submitExcuse('stu1', 'sess1', 'Now I am really sick')
    expect(db.excuseRequest.update).toHaveBeenCalled()
  })
})

describe('approveExcuse', () => {
  it('marks student as excused when no attendance record exists', async () => {
    db.excuseRequest.findUnique.mockResolvedValue(makeExcuse())
    db.attendanceRecord.findUnique.mockResolvedValue(null)
    db.excuseRequest.delete.mockResolvedValue({})

    await approveExcuse('exc1', 'lec1')
    expect(db.attendanceRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentId: 'stu1', sessionId: 'sess1', status: 'excused' }),
      })
    )
  })

  it('throws 403 when lecturer does not own the session', async () => {
    db.excuseRequest.findUnique.mockResolvedValue(
      makeExcuse({ session: makeOpenSession({ lecturerId: 'other' }) })
    )
    await expect(approveExcuse('exc1', 'lec1')).rejects.toMatchObject({ status: 403 })
  })

  it('throws 400 when already reviewed', async () => {
    db.excuseRequest.findUnique.mockResolvedValue(makeExcuse({ status: 'approved' }))
    await expect(approveExcuse('exc1', 'lec1')).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' })
  })
})

describe('rejectExcuse', () => {
  it('marks student as absent when no attendance record exists', async () => {
    db.excuseRequest.findUnique.mockResolvedValue(makeExcuse())
    db.attendanceRecord.findUnique.mockResolvedValue(null)
    db.excuseRequest.delete.mockResolvedValue({})

    await rejectExcuse('exc1', 'lec1')
    expect(db.attendanceRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentId: 'stu1', sessionId: 'sess1', status: 'absent' }),
      })
    )
  })
})

describe('autoRejectPendingExcuses', () => {
  it('creates absent records for pending requests and deletes them', async () => {
    db.excuseRequest.findMany.mockResolvedValue([
      { studentId: 'stu1' },
      { studentId: 'stu2' },
    ])
    db.attendanceRecord.findMany.mockResolvedValue([{ studentId: 'stu1' }]) // stu1 already has a record
    db.excuseRequest.deleteMany.mockResolvedValue({ count: 2 })

    const count = await autoRejectPendingExcuses('sess1')
    expect(count).toBe(2)
    // Only stu2 needs a new absent record
    expect(db.attendanceRecord.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ studentId: 'stu2', status: 'absent' })],
      })
    )
    expect(db.excuseRequest.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: 'sess1', status: 'pending' },
    })
  })

  it('returns 0 when there are no pending requests', async () => {
    db.excuseRequest.findMany.mockResolvedValue([])
    const count = await autoRejectPendingExcuses('sess1')
    expect(count).toBe(0)
    expect(db.attendanceRecord.createMany).not.toHaveBeenCalled()
  })
})
