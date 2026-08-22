import { AlertType } from '@prisma/client'
import { sendEmail } from '../config/mailer'
import { prisma } from '../config/db'
import { errorMessage, logError } from '../utils/errors'

const alertLabels: Record<AlertType, string> = {
  warning: 'WARNING',
  critical: 'CRITICAL',
}

const alertColors: Record<AlertType, string> = {
  warning: '#C8860A',
  critical: '#CC0000',
}

interface AlertEmailData {
  studentName: string
  regNumber: string
  courseUnitName: string
  courseUnitCode: string
  pct: number
  sessionsMissed: number
  alertType: AlertType
}

/** FR-08.8: alert email content (student name, reg number, unit, %, sessions missed). */
function buildAlertHtml(data: AlertEmailData): string {
  const label = alertLabels[data.alertType]
  return `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
    <div style="background: #CC0000; color: #fff; padding: 16px 24px; font-size: 18px; font-weight: bold;">
      UMU Attendance System
    </div>
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 12px; color: ${alertColors[data.alertType]};">Attendance ${label} Alert</h2>
      <p>Your attendance in <strong>${data.courseUnitCode} — ${data.courseUnitName}</strong> has dropped below the required threshold.</p>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #666;">Student</td><td style="padding: 6px 0;"><strong>${data.studentName}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Reg Number</td><td style="padding: 6px 0;"><strong>${data.regNumber}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Course Unit</td><td style="padding: 6px 0;"><strong>${data.courseUnitCode}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Current Attendance</td><td style="padding: 6px 0;"><strong>${data.pct.toFixed(2)}%</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Sessions Missed</td><td style="padding: 6px 0;"><strong>${data.sessionsMissed}</strong></td></tr>
      </table>
      <p style="margin-top: 16px; font-size: 13px; color: #888;">Uganda Martyrs University — Nkozi Campus</p>
    </div>
  </div>`
}

export type NotifyResult =
  | { sent: true }
  | { sent: false; reason: 'incomplete_recipient_data' }
  | { sent: false; reason: 'delivery_failed'; message: string }

/**
 * FR-08.3: notify the student, the unit's lecturers, and the Faculty Admin.
 *
 * Only mail *delivery* is treated as non-fatal (SMTP outages must not undo a
 * closed session); the caller is told about it through the return value.
 * Database and programming errors propagate so they surface as real failures
 * instead of a log line nobody reads.
 */
export async function notifyAlertRecipients(
  studentId: string,
  courseUnitId: string,
  alertType: AlertType,
  pct: number,
  sessionsMissed: number
): Promise<NotifyResult> {
  const [student, courseUnit, lecturers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      select: { fullName: true, regNumber: true, email: true },
    }),
    prisma.courseUnit.findUnique({
      where: { id: courseUnitId },
      select: { id: true, code: true, name: true, facultyId: true },
    }),
    prisma.lecturerAssignment.findMany({
      where: { courseUnitId },
      select: { lecturer: { select: { email: true, fullName: true } } },
    }),
  ])

  if (!student || !courseUnit || !student.email || !student.regNumber) {
    return { sent: false, reason: 'incomplete_recipient_data' }
  }

  const html = buildAlertHtml({
    studentName: student.fullName,
    regNumber: student.regNumber,
    courseUnitName: courseUnit.name,
    courseUnitCode: courseUnit.code,
    pct,
    sessionsMissed,
    alertType,
  })

  const recipients = new Set<string>([student.email])
  for (const l of lecturers) if (l.lecturer.email) recipients.add(l.lecturer.email)

  // Faculty Admin(s) of the unit's faculty
  const admins = await prisma.user.findMany({
    where: { role: 'faculty_admin', facultyId: courseUnit.facultyId, isActive: true },
    select: { email: true },
  })
  for (const a of admins) if (a.email) recipients.add(a.email)

  try {
    await sendEmail({
      to: Array.from(recipients),
      subject: `[UMU Attendance] ${alertLabels[alertType]} — ${courseUnit.code}`,
      html,
    })
  } catch (error) {
    logError('email:alert-delivery', error, {
      studentId,
      courseUnitId,
      alertType,
      recipients: recipients.size,
    })
    return { sent: false, reason: 'delivery_failed', message: errorMessage(error, 'Email delivery failed') }
  }

  return { sent: true }
}
