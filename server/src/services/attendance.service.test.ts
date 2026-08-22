import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../utils/apiResponse'

const { db, writeAuditLog } = vi.hoisted(() => ({
  db: {
    session: { findUnique: vi.fn(), findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    attendanceEdit: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  writeAuditLog: vi.fn(),
}))

vi.mock('../config/db', () => ({ prisma: db }))
vi.mock('../utils/audit', () => ({ writeAuditLog }))

import {
  editAttendance,
  getMyAttendance,
  getSessionAttendance,
  getUnitSummary,
} from './attendance.service'

const lecturer = { id: 'lec-1', role: 'lecturer', facultyId: 'f1' }
const facultyAdmin = { id: 'fa-1', role: 'faculty_admin', facultyId: 'f1' }
const systemAdmin = { id: 'sa-1', role: 'system_admin', facultyId: null }

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    lecturerId: 'lec-1',
    courseUnit: { facultyId: 'f1', sharedFaculties: [] },
    ...overrides,
  }
}

function record(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    status,
    checkedInAt: new Date('2025-03-01T08:01:00Z'),
    student: { id: 'stu-1', regNumber: '2024/BSC/001', fullName: 'Ann', email: 'a@stud.umu.ac.ug' },
    edits: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.session.findUnique.mockResolvedValue(sessionRow())
  db.session.findMany.mockResolvedValue([])
  db.enrollment.findMany.mockResolvedValue([])
  db.attendanceRecord.findMany.mockResolvedValue([])
  db.$transaction.mockResolvedValue([{ id: 'att-1', status: 'excused' }, { id: 'edit-1' }])
})

describe('getSessionAttendance', () => {
  it('rejects an unknown session with 404', async () => {
    db.session.findUnique.mockResolvedValue(null)

    await getSessionAttendance('sess-x', lecturer).catch((err: ApiError) => {
      expect(err.status).toBe(404)
      expect(err.message).toBe('Session not found')
    })
    await expect(getSessionAttendance('sess-x', lecturer)).rejects.toBeInstanceOf(ApiError)
  })

  it('lets the owning lecturer through and tallies statuses', async () => {
    db.attendanceRecord.findMany.mockResolvedValue([
      record('present'),
      record('present', { id: 'att-2' }),
      record('absent', { id: 'att-3' }),
      record('excused', { id: 'att-4' }),
    ])

    const { records, counts } = await getSessionAttendance('sess-1', lecturer)

    expect(records).toHaveLength(4)
    expect(counts).toEqual({ present: 2, absent: 1, excused: 1 })
  })

  it('blocks a lecturer who does not own the session', async () => {
    db.session.findUnique.mockResolvedValue(sessionRow({ lecturerId: 'other' }))

    await expect(getSessionAttendance('sess-1', lecturer)).rejects.toThrow(
      'You can only view attendance for your own sessions'
    )
    expect(db.attendanceRecord.findMany).not.toHaveBeenCalled()
  })

  it('allows a faculty admin in the owning faculty', async () => {
    await expect(getSessionAttendance('sess-1', facultyAdmin)).resolves.toMatchObject({
      counts: { present: 0, absent: 0, excused: 0 },
    })
  })

  it('allows a faculty admin of a shared faculty', async () => {
    db.session.findUnique.mockResolvedValue(
      sessionRow({ courseUnit: { facultyId: 'f9', sharedFaculties: [{ facultyId: 'f1' }] } })
    )

    await expect(getSessionAttendance('sess-1', facultyAdmin)).resolves.toBeDefined()
  })

  it('blocks a faculty admin from another faculty', async () => {
    await expect(
      getSessionAttendance('sess-1', { ...facultyAdmin, facultyId: 'f2' })
    ).rejects.toThrow('Session is outside your faculty')
  })

  it('blocks a faculty admin with no faculty assigned', async () => {
    await expect(
      getSessionAttendance('sess-1', { ...facultyAdmin, facultyId: null })
    ).rejects.toThrow('Session is outside your faculty')
  })

  it('allows a system admin and blocks students', async () => {
    await expect(getSessionAttendance('sess-1', systemAdmin)).resolves.toBeDefined()
    await expect(
      getSessionAttendance('sess-1', { id: 'stu-1', role: 'student', facultyId: null })
    ).rejects.toThrow('Forbidden')
  })
})

describe('getMyAttendance', () => {
  it('returns an empty result for a student with no enrollments', async () => {
    await expect(getMyAttendance('stu-1')).resolves.toEqual({ period: null, units: [] })
    expect(db.session.findMany).not.toHaveBeenCalled()
  })

  it('scopes to the most recent enrolled period only', async () => {
    db.enrollment.findMany.mockResolvedValue([
      {
        courseUnitId: 'cu1',
        courseUnit: { id: 'cu1', code: 'CSC2101', name: 'SE' },
        academicYear: '2024/2025',
        semester: 2,
      },
      {
        courseUnitId: 'cu2',
        courseUnit: { id: 'cu2', code: 'CSC1101', name: 'Intro' },
        academicYear: '2023/2024',
        semester: 1,
      },
    ])

    const result = await getMyAttendance('stu-1')

    expect(result.period).toEqual({ academicYear: '2024/2025', semester: 2 })
    expect(result.units.map((u) => u.courseUnit.id)).toEqual(['cu1'])
    expect(db.session.findMany.mock.calls[0][0].where).toMatchObject({
      academicYear: '2024/2025',
      semester: 2,
      status: 'closed',
    })
  })

  it('counts present and excused records against closed sessions only', async () => {
    db.enrollment.findMany.mockResolvedValue([
      {
        courseUnitId: 'cu1',
        courseUnit: { id: 'cu1', code: 'CSC2101', name: 'SE' },
        academicYear: '2024/2025',
        semester: 1,
      },
    ])
    db.session.findMany.mockResolvedValue([
      { id: 's1', courseUnitId: 'cu1' },
      { id: 's2', courseUnitId: 'cu1' },
      { id: 's3', courseUnitId: 'cu1' },
      { id: 's4', courseUnitId: 'cu1' },
    ])
    db.attendanceRecord.findMany.mockResolvedValue([
      { sessionId: 's1', status: 'present' },
      { sessionId: 's2', status: 'excused' },
      { sessionId: 's3', status: 'absent' },
      // A record for a session outside the period is ignored.
      { sessionId: 'other', status: 'present' },
    ])

    const [unit] = (await getMyAttendance('stu-1')).units

    expect(unit).toMatchObject({ sessionsHeld: 4, attended: 2, percentage: 50, status: 'not_eligible' })
  })

  it('reports 100% before any session has been held', async () => {
    db.enrollment.findMany.mockResolvedValue([
      {
        courseUnitId: 'cu1',
        courseUnit: { id: 'cu1', code: 'CSC2101', name: 'SE' },
        academicYear: '2024/2025',
        semester: 1,
      },
    ])

    const [unit] = (await getMyAttendance('stu-1')).units

    expect(unit).toMatchObject({ sessionsHeld: 0, attended: 0, percentage: 100, status: 'good' })
  })
})

describe('getUnitSummary', () => {
  it('computes a percentage and status per enrolled student', async () => {
    db.enrollment.findMany.mockResolvedValue([
      { student: { id: 'stu-1', regNumber: 'R1', fullName: 'Ann' } },
      { student: { id: 'stu-2', regNumber: 'R2', fullName: 'Ben' } },
    ])
    db.session.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }])
    db.attendanceRecord.findMany.mockResolvedValue([
      { sessionId: 's1', studentId: 'stu-1', status: 'present' },
      { sessionId: 's2', studentId: 'stu-1', status: 'present' },
      { sessionId: 's3', studentId: 'stu-1', status: 'excused' },
      { sessionId: 's4', studentId: 'stu-1', status: 'present' },
      { sessionId: 's1', studentId: 'stu-2', status: 'absent' },
    ])

    const summary = await getUnitSummary('cu1', '2024/2025', 1)

    expect(summary.totalSessions).toBe(4)
    expect(summary.students).toEqual([
      { student: { id: 'stu-1', regNumber: 'R1', fullName: 'Ann' }, percentage: 100, status: 'good' },
      {
        student: { id: 'stu-2', regNumber: 'R2', fullName: 'Ben' },
        percentage: 0,
        status: 'not_eligible',
      },
    ])
  })

  it('counts only closed sessions in the requested period', async () => {
    await getUnitSummary('cu1', '2024/2025', 2)

    expect(db.session.findMany.mock.calls[0][0].where).toEqual({
      courseUnitId: 'cu1',
      academicYear: '2024/2025',
      semester: 2,
      status: 'closed',
    })
  })
})

describe('editAttendance', () => {
  function editableRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'att-1',
      status: 'absent',
      sessionId: 'sess-1',
      session: {
        status: 'open',
        lecturerId: 'lec-1',
        courseUnit: { facultyId: 'f1', sharedFaculties: [] },
      },
      ...overrides,
    }
  }

  beforeEach(() => {
    db.attendanceRecord.findUnique.mockResolvedValue(editableRecord())
  })

  it('requires a non-blank reason', async () => {
    await expect(editAttendance('att-1', 'excused', '   ', lecturer)).rejects.toThrow(
      'A reason is required for attendance edits'
    )
    expect(db.attendanceRecord.findUnique).not.toHaveBeenCalled()
  })

  it('rejects an unknown record with 404', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue(null)

    await editAttendance('att-x', 'excused', 'Sick note', lecturer).catch((err: ApiError) =>
      expect(err.status).toBe(404)
    )
  })

  it('rejects a no-op edit', async () => {
    await expect(editAttendance('att-1', 'absent', 'Sick note', lecturer)).rejects.toThrow(
      'Status is already absent'
    )
  })

  it('records the edit and the audit trail on success', async () => {
    const updated = await editAttendance('att-1', 'excused', '  Sick note  ', lecturer)

    expect(updated).toEqual({ id: 'att-1', status: 'excused' })
    expect(db.attendanceRecord.update).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: { status: 'excused' },
    })
    expect(db.attendanceEdit.create).toHaveBeenCalledWith({
      data: {
        attendanceRecordId: 'att-1',
        changedById: 'lec-1',
        oldStatus: 'absent',
        newStatus: 'excused',
        reason: 'Sick note',
      },
    })
    expect(db.$transaction).toHaveBeenCalledOnce()
    expect(writeAuditLog).toHaveBeenCalledWith(
      'lec-1',
      'ATTENDANCE_EDIT',
      'attendance_record',
      'att-1',
      expect.objectContaining({ sessionId: 'sess-1', from: 'absent', to: 'excused' })
    )
  })

  it('locks a lecturer out once the session is closed', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue(
      editableRecord({
        session: {
          status: 'closed',
          lecturerId: 'lec-1',
          courseUnit: { facultyId: 'f1', sharedFaculties: [] },
        },
      })
    )

    await expect(editAttendance('att-1', 'excused', 'Sick note', lecturer)).rejects.toThrow(
      'This session is closed. Ask your Faculty Admin to correct attendance.'
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('still lets a faculty admin correct a closed session', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue(
      editableRecord({
        session: {
          status: 'closed',
          lecturerId: 'lec-1',
          courseUnit: { facultyId: 'f1', sharedFaculties: [] },
        },
      })
    )

    await expect(editAttendance('att-1', 'excused', 'Sick note', facultyAdmin)).resolves.toEqual({
      id: 'att-1',
      status: 'excused',
    })
  })

  it('blocks a lecturer editing another lecturer\u2019s session', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue(
      editableRecord({
        session: {
          status: 'open',
          lecturerId: 'other',
          courseUnit: { facultyId: 'f1', sharedFaculties: [] },
        },
      })
    )

    await expect(editAttendance('att-1', 'excused', 'Sick note', lecturer)).rejects.toThrow(
      'You can only edit attendance for your own sessions'
    )
  })

  it('blocks a faculty admin outside the owning and shared faculties', async () => {
    await expect(
      editAttendance('att-1', 'excused', 'Sick note', { ...facultyAdmin, facultyId: 'f2' })
    ).rejects.toThrow('This session is outside your faculty')
  })

  it('allows a faculty admin of a shared faculty', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue(
      editableRecord({
        session: {
          status: 'open',
          lecturerId: 'lec-1',
          courseUnit: { facultyId: 'f9', sharedFaculties: [{ facultyId: 'f1' }] },
        },
      })
    )

    await expect(
      editAttendance('att-1', 'excused', 'Sick note', facultyAdmin)
    ).resolves.toBeDefined()
  })

  it('allows a system admin and blocks students', async () => {
    await expect(editAttendance('att-1', 'excused', 'Fix', systemAdmin)).resolves.toBeDefined()
    await expect(
      editAttendance('att-1', 'excused', 'Fix', { id: 'stu-1', role: 'student', facultyId: null })
    ).rejects.toThrow('Forbidden')
  })
})
