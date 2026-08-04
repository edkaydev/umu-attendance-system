import { AlertType, Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'

/**
 * List attendance alerts scoped to the actor's role (FR-08.3/08.4):
 *   student       → own alerts
 *   lecturer      → alerts for assigned course units
 *   faculty_admin → alerts within own faculty
 *   system_admin  → forbidden (does not receive attendance alerts)
 */
export async function listAlerts(
  actor: { id: string; role: Role; facultyId: string | null },
  filters?: {
    status?: 'active' | 'resolved'
    alertType?: AlertType
    page?: number
    limit?: number
  }
) {
  const page = Math.max(1, filters?.page ?? 1)
  const limit = Math.min(100, Math.max(1, filters?.limit ?? 20))

  let unitIds: string[] | undefined
  if (actor.role === 'lecturer') {
    const assignments = await prisma.lecturerAssignment.findMany({
      where: { lecturerId: actor.id },
      select: { courseUnitId: true },
    })
    unitIds = assignments.map((a) => a.courseUnitId)
    if (unitIds.length === 0) return { alerts: [], total: 0, page, limit }
  } else if (actor.role === 'faculty_admin') {
    const units = await prisma.courseUnit.findMany({
      where: { facultyId: actor.facultyId ?? 'none' },
      select: { id: true },
    })
    unitIds = units.map((u) => u.id)
    if (unitIds.length === 0) return { alerts: [], total: 0, page, limit }
  } else if (actor.role === 'system_admin') {
    throw new ApiError('System Admin does not receive attendance alerts', 403)
  }

  const where = {
    ...(actor.role === 'student' ? { studentId: actor.id } : { courseUnitId: { in: unitIds } }),
    ...(filters?.status === 'resolved'
      ? { resolved: true }
      : filters?.status === 'active'
        ? { resolved: false }
        : {}),
    ...(filters?.alertType ? { alertType: filters.alertType } : {}),
  }

  const [alerts, total] = await Promise.all([
    prisma.attendanceAlert.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, regNumber: true } },
        courseUnit: { select: { id: true, code: true, name: true } },
      },
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.attendanceAlert.count({ where }),
  ])

  return { alerts, total, page, limit }
}
