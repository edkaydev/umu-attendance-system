import { Prisma } from '@prisma/client'
import { prisma } from '../config/db'

type AuditLogWithUser = Prisma.AuditLogGetPayload<{
  include: { user: { select: { id: true; fullName: true; email: true; role: true } } }
}>

export interface AuditLogFilters {
  action?: string
  userId?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

/** Serializable shape returned to the client — raw entry + human-readable summary. */
export interface AuditLogEntryView {
  id: string
  createdAt: Date
  action: string
  targetType: string
  targetId: string
  meta: Record<string, unknown> | null
  actor: { id: string; fullName: string | null; email: string | null; role: string } | null
  /** Plain-English description of what happened (for non-technical readers). */
  summary: string
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

  const entries = await toFriendlyEntries(logs)

  return { logs: entries, total, page, limit }
}

/* ─────────────────────────── Friendly summaries ─────────────────────────── */

/**
 * Turn raw audit log rows into human-readable entries. The stored `action` and
 * `meta` are machine-formatted (e.g. `ATTENDANCE_EDIT`, a status enum, UUIDs).
 * A lay person reading the log shouldn't have to decode those, so we map each
 * entry to a plain-English `summary`.
 */
async function toFriendlyEntries(
  logs: AuditLogWithUser[]
): Promise<AuditLogEntryView[]> {
  // Batch-enrich ATTENDANCE_EDIT rows so we can mention the student and course.
  const attendanceRows = logs.filter((l) => l.action === 'ATTENDANCE_EDIT')
  const recordToHuman: Map<string, { student: string; course: string }> = new Map()
  if (attendanceRows.length > 0) {
    const records = await prisma.attendanceRecord.findMany({
      where: { id: { in: attendanceRows.map((l) => l.targetId) } },
      select: {
        id: true,
        student: { select: { fullName: true } },
        session: { select: { courseUnit: { select: { name: true, code: true } } } },
      },
    })
    for (const r of records) {
      recordToHuman.set(r.id, {
        student: r.student?.fullName ?? 'a student',
        course: r.session?.courseUnit?.name ?? r.session?.courseUnit?.code ?? 'a course unit',
      })
    }
  }

  return logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    action: l.action,
    targetType: l.targetType,
    targetId: l.targetId,
    meta: (l.meta ?? null) as Record<string, unknown> | null,
    actor: l.user
      ? { id: l.user.id, fullName: l.user.fullName, email: l.user.email, role: l.user.role }
      : null,
    summary: summarize(l, recordToHuman.get(l.targetId)),
  }))
}

const ACTION_LABEL: Record<string, string> = {
  SESSION_OPEN: 'Opened a class session',
  SESSION_CLOSE: 'Closed a class session',
  SESSION_AUTO_CLOSE: 'Session closed automatically (time ran out)',
  SESSION_EXTEND: 'Extended a class session',
  ATTENDANCE_EDIT: 'Changed a student\'s attendance',
  PDF_DOWNLOAD: 'Downloaded an attendance report',
  PROFILE_COMPLETE: 'Completed profile',
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  USER_CREATE: 'Created an account',
  USER_UPDATE: 'Updated an account',
  USER_DELETE: 'Deleted an account',
  IMPORT: 'Imported data from a CSV file',
  RESET_DATABASE: 'Reset the database',
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
  exempt: 'Exempt',
  mark_late: 'Late',
  mark_absent: 'Absent',
}

function fmtStatus(s: unknown): string {
  if (typeof s !== 'string') return 'a different status'
  return STATUS_LABEL[s] ?? s
}

function summarize(
  l: {
    action: string
    targetType: string
    meta: Prisma.JsonValue | null
  },
  attendance?: { student: string; course: string }
): string {
  const meta = (l.meta ?? {}) as Record<string, unknown>
  const verb = ACTION_LABEL[l.action] ?? `${l.action.replace(/_/g, ' ').toLowerCase()}`

  switch (l.action) {
    case 'ATTENDANCE_EDIT': {
      const student = attendance?.student ?? 'a student'
      const course = attendance?.course ?? 'a course unit'
      const to = typeof meta.to === 'string' ? fmtStatus(meta.to) : null
      if (to) return `${student} marked ${to.toLowerCase()} (${course})`
      return `${student}'s attendance changed (${course})`
    }
    case 'SESSION_OPEN':
      return `${verb} — open for check-in until the class ends`
    case 'SESSION_EXTEND': {
      const minutes = typeof meta.minutes === 'number' ? meta.minutes : 0
      return `${verb} by ${minutes} minute${minutes === 1 ? '' : 's'}`
    }
    case 'SESSION_CLOSE': {
      const absent = typeof meta.absenteesAutoMarked === 'number' ? meta.absenteesAutoMarked : 0
      return `${verb} — ${absent} student${absent === 1 ? '' : 's'} absent`
    }
    case 'SESSION_AUTO_CLOSE': {
      const absent = typeof meta.absenteesAutoMarked === 'number' ? meta.absenteesAutoMarked : 0
      return `${verb} — ${absent} student${absent === 1 ? '' : 's'} marked absent`
    }
    case 'USER_CREATE': {
      const name = typeof meta.fullName === 'string' ? meta.fullName : null
      return name ? `${verb}: ${name}` : verb
    }
    case 'USER_UPDATE': {
      const name = typeof meta.fullName === 'string' ? meta.fullName : null
      return name ? `${verb}: ${name}` : verb
    }
    case 'USER_DELETE': {
      const name = typeof meta.fullName === 'string' ? meta.fullName : null
      return name ? `${verb}: ${name}` : verb
    }
    case 'IMPORT':
      return `${verb} (${String(meta.type ?? l.targetType).replace(/_/g, ' ')})`
    case 'RESET_DATABASE':
      return `${verb} — all data was cleared`
    default:
      return `${verb}, on ${l.targetType.replace(/_/g, ' ')}`
  }
}
