import { Prisma } from '@prisma/client'
import { prisma } from '../config/db'

export interface AuditLogFilters {
  action?: string
  userId?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export interface AuditLogCaller {
  role: string
  facultyId: string | null
}

/**
 * Paginated audit log with role-based scoping (FR-07.7, FR-03 permissions matrix).
 *
 * system_admin  → sees everything
 * faculty_admin → sees only ATTENDANCE_EDIT actions for records in their faculty
 */
export async function listAuditLogs(
  filters: AuditLogFilters = {},
  caller: AuditLogCaller
) {
  const page  = Math.max(1, filters.page  ?? 1)
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25))

  // ── Base where clause from filters ──────────────────────────────────────
  const where: Prisma.AuditLogWhereInput = {}

  if (filters.action) where.action = { contains: filters.action }
  if (filters.userId) where.userId = filters.userId
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
    }
  }

  // ── Role scoping ─────────────────────────────────────────────────────────
  if (caller.role === 'faculty_admin') {
    if (!caller.facultyId) {
      // Admin has no faculty assigned — return empty result safely
      return { logs: [], total: 0, page, limit }
    }

    // Faculty admin may only see ATTENDANCE_EDIT entries.
    // We scope to attendance_records whose session belongs to a course unit
    // in their faculty — done via a subquery on targetId.
    where.action = 'ATTENDANCE_EDIT'

    // Collect all attendance_record IDs for sessions in this faculty
    const facultyRecords = await prisma.attendanceRecord.findMany({
      where: {
        session: {
          courseUnit: { facultyId: caller.facultyId },
        },
      },
      select: { id: true },
    })

    const recordIds = facultyRecords.map((r) => r.id)

    if (recordIds.length === 0) {
      return { logs: [], total: 0, page, limit }
    }

    // targetType for attendance edits is 'attendance_record'
    where.targetType = 'attendance_record'
    where.targetId   = { in: recordIds }
  }
  // system_admin: no additional filter — sees all logs

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  return { logs, total, page, limit }
}
