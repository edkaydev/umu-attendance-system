import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Role } from '@prisma/client'
import { ApiError } from '../utils/apiResponse'

const { db } = vi.hoisted(() => ({
  db: {
    lecturerAssignment: { findMany: vi.fn() },
    courseUnit: { findMany: vi.fn() },
    attendanceAlert: { findMany: vi.fn(), count: vi.fn() },
  },
}))

vi.mock('../config/db', () => ({ prisma: db }))

import { listAlerts } from './alert-list.service'

const student = { id: 'stu-1', role: Role.student, facultyId: null }
const lecturer = { id: 'lec-1', role: Role.lecturer, facultyId: 'f1' }
const facultyAdmin = { id: 'fa-1', role: Role.faculty_admin, facultyId: 'f1' }

beforeEach(() => {
  vi.clearAllMocks()
  db.attendanceAlert.findMany.mockResolvedValue([{ id: 'al-1' }])
  db.attendanceAlert.count.mockResolvedValue(1)
  db.lecturerAssignment.findMany.mockResolvedValue([{ courseUnitId: 'cu1' }])
  db.courseUnit.findMany.mockResolvedValue([{ id: 'cu1' }, { id: 'cu2' }])
})

describe('scoping', () => {
  it('limits a student to their own alerts', async () => {
    await listAlerts(student)

    expect(db.attendanceAlert.findMany.mock.calls[0][0].where).toEqual({ studentId: 'stu-1' })
    expect(db.lecturerAssignment.findMany).not.toHaveBeenCalled()
  })

  it('limits a lecturer to their assigned course units', async () => {
    await listAlerts(lecturer)

    expect(db.attendanceAlert.findMany.mock.calls[0][0].where).toEqual({
      courseUnitId: { in: ['cu1'] },
    })
  })

  it('returns an empty page for a lecturer with no assignments', async () => {
    db.lecturerAssignment.findMany.mockResolvedValue([])

    await expect(listAlerts(lecturer)).resolves.toEqual({
      alerts: [],
      total: 0,
      page: 1,
      limit: 20,
    })
    expect(db.attendanceAlert.findMany).not.toHaveBeenCalled()
  })

  it('limits a faculty admin to course units in their faculty', async () => {
    await listAlerts(facultyAdmin)

    expect(db.courseUnit.findMany).toHaveBeenCalledWith({
      where: { facultyId: 'f1' },
      select: { id: true },
    })
    expect(db.attendanceAlert.findMany.mock.calls[0][0].where).toEqual({
      courseUnitId: { in: ['cu1', 'cu2'] },
    })
  })

  it('matches no faculty when a faculty admin has no faculty assigned', async () => {
    db.courseUnit.findMany.mockResolvedValue([])

    await expect(listAlerts({ ...facultyAdmin, facultyId: null })).resolves.toMatchObject({
      alerts: [],
      total: 0,
    })
    expect(db.courseUnit.findMany).toHaveBeenCalledWith({
      where: { facultyId: 'none' },
      select: { id: true },
    })
  })

  it('forbids system admins outright', async () => {
    await expect(listAlerts({ id: 'sa-1', role: Role.system_admin, facultyId: null })).rejects.toBeInstanceOf(
      ApiError
    )
    await listAlerts({ id: 'sa-1', role: Role.system_admin, facultyId: null }).catch(
      (err: ApiError) => expect(err.status).toBe(403)
    )
  })
})

describe('filters and pagination', () => {
  it('filters on resolved status', async () => {
    await listAlerts(student, { status: 'resolved' })
    expect(db.attendanceAlert.findMany.mock.calls[0][0].where).toMatchObject({ resolved: true })

    await listAlerts(student, { status: 'active' })
    expect(db.attendanceAlert.findMany.mock.calls[1][0].where).toMatchObject({ resolved: false })
  })

  it('filters on alert type', async () => {
    await listAlerts(student, { alertType: 'critical' })

    expect(db.attendanceAlert.findMany.mock.calls[0][0].where).toMatchObject({
      alertType: 'critical',
    })
  })

  it('defaults to page 1 with 20 per page, newest first', async () => {
    const result = await listAlerts(student)

    expect(db.attendanceAlert.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { sentAt: 'desc' },
      skip: 0,
      take: 20,
    })
    expect(result).toMatchObject({ page: 1, limit: 20, total: 1 })
  })

  it('translates page and limit into skip/take', async () => {
    await listAlerts(student, { page: 3, limit: 10 })

    expect(db.attendanceAlert.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 })
  })

  it.each([
    [{ page: 0 }, 1],
    [{ page: -5 }, 1],
  ])('clamps a non-positive page (%o) to page 1', async (filters, expected) => {
    const result = await listAlerts(student, filters)
    expect(result.page).toBe(expected)
  })

  it.each([
    [{ limit: 500 }, 100],
    [{ limit: 0 }, 1],
  ])('clamps an out-of-range limit (%o)', async (filters, expected) => {
    const result = await listAlerts(student, filters)
    expect(result.limit).toBe(expected)
    expect(db.attendanceAlert.findMany.mock.calls[0][0].take).toBe(expected)
  })

  it('counts with the same filter as the page query', async () => {
    await listAlerts(student, { status: 'active' })

    expect(db.attendanceAlert.count.mock.calls[0][0].where).toEqual(
      db.attendanceAlert.findMany.mock.calls[0][0].where
    )
  })
})
