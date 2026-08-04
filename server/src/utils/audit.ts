import { prisma } from '../config/db'

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'SESSION_OPEN'
  | 'SESSION_CLOSE'
  | 'ATTENDANCE_EDIT'
  | 'PDF_DOWNLOAD'
  | 'PROFILE_COMPLETE'
  | 'IMPORT'

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
      meta: meta ?? undefined,
    },
  })
}
