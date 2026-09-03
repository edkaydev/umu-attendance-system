import { Prisma } from '@prisma/client'
import { prisma } from '../config/db'

export type AuditAction =
  | 'SESSION_OPEN'
  | 'SESSION_CLOSE'
  | 'SESSION_AUTO_CLOSE'
  | 'SESSION_EXTEND'
  | 'USER_UPDATE'
  | 'USER_CREATE'
  | 'USER_DELETE'
  | 'IMPORT'
  | 'RESET_DATABASE'
  | 'MOODLE_SYNC'

/**
 * Write a system-level audit log entry (audit_logs table).
 * Visible to Faculty Admin and System Admin (FR-07.7).
 */
export async function writeAuditLog(
  userId: string,
  action: AuditAction,
  targetType: string,
  targetId: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      targetType,
      targetId,
      meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
}
