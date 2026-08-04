import { prisma } from '../config/db'

export interface AuditLogFilters {
  action?: string
  userId?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

/** Paginated audit log with filters (FR-07.7). */
export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20))

  const where: Record<string, unknown> = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
  }

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
