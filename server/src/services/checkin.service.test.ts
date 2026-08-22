import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { ApiError } from '../utils/apiResponse'
import { geofence } from '../config/geofence'

const { db } = vi.hoisted(() => ({
  db: {
    session: { findFirst: vi.fn(), findMany: vi.fn() },
    enrollment: { findUnique: vi.fn(), findMany: vi.fn() },
    attendanceRecord: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('../config/db', () => ({ prisma: db }))

import { checkIn, listLiveForStudent } from './checkin.service'

const courseUnit = { id: 'cu1', name: 'Software Engineering', code: 'CSC2101' }

const onCampus = { lat: geofence.campusLat, lng: geofence.campusLng }

function openSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    courseUnitId: courseUnit.id,
    courseUnit,
    academicYear: '2024/2025',
    semester: 1,
    mode: 'online',
    lecturerLat: null,
    lecturerLng: null,
    proximityRadius: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.session.findFirst.mockResolvedValue(openSession())
  db.enrollment.findUnique.mockResolvedValue({ id: 'enr-1' })
  db.attendanceRecord.findUnique.mockResolvedValue(null)
  db.attendanceRecord.create.mockResolvedValue({ id: 'att-1' })
  db.attendanceRecord.update.mockResolvedValue({ id: 'att-1' })
})

async function expectApiError(promise: Promise<unknown>, code: string, status: number) {
  await expect(promise).rejects.toBeInstanceOf(ApiError)
  await promise.catch((err: ApiError) => {
    expect(err.code).toBe(code)
    expect(err.status).toBe(status)
  })
}

describe('checkIn code lookup', () => {
  it('normalises the code to trimmed uppercase and requires an unexpired open session', async () => {
    await checkIn('stu-1', '  ab3d7f  ')

    const where = db.session.findFirst.mock.calls[0][0].where
    expect(where.code).toBe('AB3D7F')
    expect(where.status).toBe('open')
    expect(where.codeExpiresAt.gt).toBeInstanceOf(Date)
  })

  it('returns the confirmation payload on success', async () => {
    const result = await checkIn('stu-1', 'AB3D7F')

    expect(result).toEqual({
      courseUnit,
      date: new Date().toISOString().slice(0, 10),
      status: 'present',
    })
    expect(db.attendanceRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'sess-1',
        studentId: 'stu-1',
        status: 'present',
      }),
    })
  })

  it('rejects an unknown or expired code with INVALID_CODE', async () => {
    db.session.findFirst.mockResolvedValue(null)
    await expectApiError(checkIn('stu-1', 'AB3D7F'), 'INVALID_CODE', 400)
    expect(db.attendanceRecord.create).not.toHaveBeenCalled()
  })
})

describe('checkIn geo-fencing', () => {
  it('skips location checks for online sessions', async () => {
    await expect(checkIn('stu-1', 'AB3D7F')).resolves.toMatchObject({ status: 'present' })
  })

  it.each([
    ['no location at all', undefined],
    ['a non-finite latitude', { lat: Number.NaN, lng: geofence.campusLng }],
    ['an infinite longitude', { lat: geofence.campusLat, lng: Number.POSITIVE_INFINITY }],
  ])('requires a usable location for physical sessions: %s', async (_label, location) => {
    db.session.findFirst.mockResolvedValue(openSession({ mode: 'physical' }))
    await expectApiError(
      checkIn('stu-1', 'AB3D7F', location as { lat: number; lng: number } | undefined),
      'LOCATION_REQUIRED',
      400
    )
  })

  it('rejects a student outside the campus radius', async () => {
    db.session.findFirst.mockResolvedValue(openSession({ mode: 'physical' }))
    await expectApiError(
      checkIn('stu-1', 'AB3D7F', { lat: geofence.campusLat + 0.02, lng: geofence.campusLng }),
      'OUTSIDE_CAMPUS',
      403
    )
  })

  it('rejects a student on campus but far from the lecturer', async () => {
    db.session.findFirst.mockResolvedValue(
      openSession({
        mode: 'physical',
        lecturerLat: new Prisma.Decimal(geofence.campusLat),
        lecturerLng: new Prisma.Decimal(geofence.campusLng),
        proximityRadius: 50,
      })
    )

    await expectApiError(
      // ~200 m away: inside campus, outside the 50 m classroom radius
      checkIn('stu-1', 'AB3D7F', { lat: geofence.campusLat + 0.0018, lng: geofence.campusLng }),
      'TOO_FAR_FROM_LECTURER',
      403
    )
  })

  it('accepts a student near the lecturer', async () => {
    db.session.findFirst.mockResolvedValue(
      openSession({
        mode: 'physical',
        lecturerLat: new Prisma.Decimal(geofence.campusLat),
        lecturerLng: new Prisma.Decimal(geofence.campusLng),
        proximityRadius: 50,
      })
    )

    await expect(checkIn('stu-1', 'AB3D7F', onCampus)).resolves.toMatchObject({
      status: 'present',
    })
  })

  it('skips the proximity check when the lecturer position was not recorded', async () => {
    db.session.findFirst.mockResolvedValue(openSession({ mode: 'physical' }))

    await expect(
      checkIn('stu-1', 'AB3D7F', { lat: geofence.campusLat + 0.0018, lng: geofence.campusLng })
    ).resolves.toMatchObject({ status: 'present' })
  })
})

describe('checkIn enrollment and duplicate rules', () => {
  it('rejects a student not enrolled for the session period', async () => {
    db.enrollment.findUnique.mockResolvedValue(null)
    await expectApiError(checkIn('stu-1', 'AB3D7F'), 'NOT_ENROLLED', 403)
    expect(db.attendanceRecord.create).not.toHaveBeenCalled()
  })

  it('looks the enrollment up by student, course unit, year and semester', async () => {
    await checkIn('stu-1', 'AB3D7F')

    expect(db.enrollment.findUnique).toHaveBeenCalledWith({
      where: {
        studentId_courseUnitId_academicYear_semester: {
          studentId: 'stu-1',
          courseUnitId: courseUnit.id,
          academicYear: '2024/2025',
          semester: 1,
        },
      },
    })
  })

  it('rejects a second check-in with ALREADY_CHECKED_IN', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue({ id: 'att-1', status: 'present' })
    await expectApiError(checkIn('stu-1', 'AB3D7F'), 'ALREADY_CHECKED_IN', 409)
    expect(db.attendanceRecord.create).not.toHaveBeenCalled()
    expect(db.attendanceRecord.update).not.toHaveBeenCalled()
  })

  it('upgrades an existing absent record to present', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue({ id: 'att-1', status: 'absent' })

    await expect(checkIn('stu-1', 'AB3D7F')).resolves.toMatchObject({ status: 'present' })
    expect(db.attendanceRecord.update).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: expect.objectContaining({ status: 'present' }),
    })
    expect(db.attendanceRecord.create).not.toHaveBeenCalled()
  })

  it('treats a racing unique-constraint violation as ALREADY_CHECKED_IN', async () => {
    db.attendanceRecord.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.16.1',
      })
    )

    await expectApiError(checkIn('stu-1', 'AB3D7F'), 'ALREADY_CHECKED_IN', 409)
  })

  it('propagates other database errors', async () => {
    db.attendanceRecord.create.mockRejectedValue(new Error('db down'))
    await expect(checkIn('stu-1', 'AB3D7F')).rejects.toThrow('db down')
  })
})

describe('listLiveForStudent', () => {
  it('returns nothing when the student has no enrollments', async () => {
    db.enrollment.findMany.mockResolvedValue([])

    await expect(listLiveForStudent('stu-1')).resolves.toEqual([])
    expect(db.session.findMany).not.toHaveBeenCalled()
  })

  it('returns nothing when no open session matches the enrollments', async () => {
    db.enrollment.findMany.mockResolvedValue([
      { courseUnitId: 'cu1', academicYear: '2024/2025', semester: 1 },
    ])
    db.session.findMany.mockResolvedValue([])

    await expect(listLiveForStudent('stu-1')).resolves.toEqual([])
    expect(db.attendanceRecord.findMany).not.toHaveBeenCalled()
  })

  it('filters open sessions by every enrolled course-unit period', async () => {
    db.enrollment.findMany.mockResolvedValue([
      { courseUnitId: 'cu1', academicYear: '2024/2025', semester: 1 },
      { courseUnitId: 'cu2', academicYear: '2024/2025', semester: 2 },
    ])
    db.session.findMany.mockResolvedValue([])

    await listLiveForStudent('stu-1')

    expect(db.session.findMany.mock.calls[0][0].where).toMatchObject({
      status: 'open',
      OR: [
        { courseUnitId: 'cu1', academicYear: '2024/2025', semester: 1 },
        { courseUnitId: 'cu2', academicYear: '2024/2025', semester: 2 },
      ],
    })
  })

  it('flags the sessions the student has already checked in to', async () => {
    const openedAt = new Date('2025-03-01T08:00:00Z')
    db.enrollment.findMany.mockResolvedValue([
      { courseUnitId: 'cu1', academicYear: '2024/2025', semester: 1 },
    ])
    db.session.findMany.mockResolvedValue([
      {
        id: 'sess-1',
        courseUnit,
        lecturer: { id: 'lec-1', fullName: 'Dr Ochieng' },
        venue: 'LT1',
        mode: 'physical',
        startsAt: openedAt,
        openedAt,
        codeExpiresAt: new Date('2025-03-01T08:05:00Z'),
        classDuration: 60,
      },
      {
        id: 'sess-2',
        courseUnit,
        lecturer: { id: 'lec-1', fullName: 'Dr Ochieng' },
        venue: 'LT2',
        mode: 'online',
        startsAt: openedAt,
        openedAt,
        codeExpiresAt: new Date('2025-03-01T08:05:00Z'),
        classDuration: null,
      },
    ])
    db.attendanceRecord.findMany.mockResolvedValue([{ sessionId: 'sess-2' }])

    const live = await listLiveForStudent('stu-1')

    expect(live.map((s) => [s.id, s.checkedIn])).toEqual([
      ['sess-1', false],
      ['sess-2', true],
    ])
    expect(live[0]).toMatchObject({ venue: 'LT1', mode: 'physical', classDuration: 60 })
    expect(db.attendanceRecord.findMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'stu-1',
      sessionId: { in: ['sess-1', 'sess-2'] },
      status: 'present',
    })
  })
})
