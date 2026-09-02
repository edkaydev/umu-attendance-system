/**
 * checkin.service unit tests (FR-06)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/db', () => ({
  prisma: {
    session: { findFirst: vi.fn() },
    enrollment: { findUnique: vi.fn() },
    attendanceRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('./events.service', () => ({ publish: vi.fn() }))
vi.mock('../config/geofence', () => ({
  isWithinCampus: vi.fn().mockReturnValue(true),
  isNearLecturer: vi.fn().mockReturnValue(true),
}))

import { prisma } from '../config/db'
import { isWithinCampus, isNearLecturer } from '../config/geofence'
import { checkIn } from './checkin.service'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const geo = { isWithinCampus, isNearLecturer } as unknown as Record<string, ReturnType<typeof vi.fn>>

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess1',
    courseUnitId: 'cu1',
    academicYear: '2025/2026',
    semester: 1,
    mode: 'online',
    codeExpiresAt: new Date(Date.now() + 30 * 60_000),
    lecturerLat: null,
    lecturerLng: null,
    proximityRadius: null,
    courseUnit: { id: 'cu1', name: 'Intro to CS', code: 'CS101' },
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

// ── code validation ────────────────────────────────────────────────────────

it('throws INVALID_CODE when no matching session found', async () => {
  db.session.findFirst.mockResolvedValue(null)
  await expect(checkIn('stu1', 'BADCOD')).rejects.toMatchObject({ code: 'INVALID_CODE' })
})

// ── online session happy path ──────────────────────────────────────────────

it('marks student present on valid online check-in', async () => {
  db.session.findFirst.mockResolvedValue(makeSession())
  db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
  db.attendanceRecord.findUnique.mockResolvedValue(null)
  db.attendanceRecord.create.mockResolvedValue({ id: 'ar1' })

  const result = await checkIn('stu1', 'ABCDEF')
  expect(result.status).toBe('present')
  expect(result.courseUnit.code).toBe('CS101')
})

// ── enrollment check ───────────────────────────────────────────────────────

it('throws NOT_ENROLLED when student has no enrollment', async () => {
  db.session.findFirst.mockResolvedValue(makeSession())
  db.enrollment.findUnique.mockResolvedValue(null)
  await expect(checkIn('stu1', 'ABCDEF')).rejects.toMatchObject({ code: 'NOT_ENROLLED' })
})

// ── duplicate check-in ─────────────────────────────────────────────────────

it('throws ALREADY_CHECKED_IN when student already present', async () => {
  db.session.findFirst.mockResolvedValue(makeSession())
  db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
  db.attendanceRecord.findUnique.mockResolvedValue({ id: 'ar1', status: 'present' })
  await expect(checkIn('stu1', 'ABCDEF')).rejects.toMatchObject({ code: 'ALREADY_CHECKED_IN' })
})

it('upgrades absent record to present on reopen check-in', async () => {
  db.session.findFirst.mockResolvedValue(makeSession())
  db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
  db.attendanceRecord.findUnique.mockResolvedValue({ id: 'ar1', status: 'absent' })
  db.attendanceRecord.update.mockResolvedValue({ id: 'ar1', status: 'present' })

  const result = await checkIn('stu1', 'ABCDEF')
  expect(result.status).toBe('present')
  expect(db.attendanceRecord.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ status: 'present' }) })
  )
})

// ── physical session geo checks ────────────────────────────────────────────

it('throws LOCATION_REQUIRED for physical session with no location', async () => {
  db.session.findFirst.mockResolvedValue(makeSession({ mode: 'physical' }))
  await expect(checkIn('stu1', 'ABCDEF')).rejects.toMatchObject({ code: 'LOCATION_REQUIRED' })
})

it('throws OUTSIDE_CAMPUS when student is off campus', async () => {
  db.session.findFirst.mockResolvedValue(makeSession({ mode: 'physical' }))
  geo.isWithinCampus.mockReturnValue(false)
  await expect(checkIn('stu1', 'ABCDEF', { lat: 0, lng: 0 })).rejects.toMatchObject({
    code: 'OUTSIDE_CAMPUS',
  })
})

it('throws TOO_FAR_FROM_LECTURER when student is outside proximity radius', async () => {
  db.session.findFirst.mockResolvedValue(
    makeSession({ mode: 'physical', lecturerLat: 0.003, lecturerLng: 32.01, proximityRadius: 50 })
  )
  geo.isWithinCampus.mockReturnValue(true)
  geo.isNearLecturer.mockReturnValue(false)
  await expect(checkIn('stu1', 'ABCDEF', { lat: 0.004, lng: 32.02 })).rejects.toMatchObject({
    code: 'TOO_FAR_FROM_LECTURER',
  })
})

it('allows check-in when student is on campus and near lecturer', async () => {
  db.session.findFirst.mockResolvedValue(
    makeSession({ mode: 'physical', lecturerLat: 0.003, lecturerLng: 32.01, proximityRadius: 50 })
  )
  db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
  db.attendanceRecord.findUnique.mockResolvedValue(null)
  db.attendanceRecord.create.mockResolvedValue({ id: 'ar1' })
  geo.isWithinCampus.mockReturnValue(true)
  geo.isNearLecturer.mockReturnValue(true)

  const result = await checkIn('stu1', 'ABCDEF', { lat: 0.003, lng: 32.01 })
  expect(result.status).toBe('present')
})

// ── code normalisation ─────────────────────────────────────────────────────

it('normalises lowercase codes to uppercase before lookup', async () => {
  db.session.findFirst.mockResolvedValue(makeSession())
  db.enrollment.findUnique.mockResolvedValue({ id: 'enr1' })
  db.attendanceRecord.findUnique.mockResolvedValue(null)
  db.attendanceRecord.create.mockResolvedValue({ id: 'ar1' })

  await checkIn('stu1', '  abcdef  ')
  expect(db.session.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ code: 'ABCDEF' }) })
  )
})
