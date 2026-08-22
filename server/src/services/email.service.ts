import { AlertType, AttendanceStatus, SessionStatus } from '@prisma/client'
import { sendEmail } from '../config/mailer'
import { prisma } from '../config/db'
import { getCurrentPeriod } from './settings.service'
import { attendancePercentage, attendanceStatus } from '../utils/attendanceCalc'

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

/** FR-08.3: notify the student, the unit's lecturers, and the Faculty Admin. */
export async function notifyAlertRecipients(
  studentId: string,
  courseUnitId: string,
  alertType: AlertType,
  pct: number,
  sessionsMissed: number
): Promise<void> {
  try {
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

    if (!student || !courseUnit || !student.email) return
    if (!student.regNumber) return

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

    await sendEmail({
      to: Array.from(recipients),
      subject: `[UMU Attendance] ${alertLabels[alertType]} — ${courseUnit.code}`,
      html,
    })
  } catch (error) {
    console.warn('[email] alert notification failed:', (error as Error).message)
  }
}

// ─── Notification policy ─────────────────────────────────────────────────────
// Deliberately minimal:
//   1. Email when a session opens, including its check-in closing time.
//   2. Weekly attendance summary per student.
//   3. NO email when a session ends — the dashboard is the live source of truth.
//   4. NEVER include the check-in code in any email — codes are shown in class
//      and on the dashboard only.

/** Format a Date as a readable East Africa Time timestamp (UMU is in Uganda). */
function formatEAT(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

const SHELL_TOP = `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
    <div style="background: #CC0000; color: #fff; padding: 16px 24px; font-size: 18px; font-weight: bold;">
      UMU Attendance System
    </div>
    <div style="padding: 24px;">`

const SHELL_BOTTOM = `
      <p style="margin-top: 16px; font-size: 13px; color: #888;">Uganda Martyrs University — Nkozi Campus</p>
    </div>
  </div>`

/**
 * FR-05.x: email all enrolled students when a lecturer opens a session.
 * Tells them check-in is open and WHEN IT CLOSES; never contains the code.
 * Fire-and-forget from the open-session path — failures are logged, never thrown.
 */
export async function notifySessionOpened(sessionId: string): Promise<void> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        courseUnitId: true,
        academicYear: true,
        semester: true,
        venue: true,
        mode: true,
        startsAt: true,
        codeExpiresAt: true,
        courseUnit: { select: { code: true, name: true } },
        lecturer: { select: { fullName: true } },
      },
    })
    if (!session || !session.codeExpiresAt) return

    // Enrolment is keyed by unit + period, not by session — resolve recipients
    // the same way the auto-close absentee pass does.
    const enrollments = await prisma.enrollment.findMany({
      where: {
        courseUnitId: session.courseUnitId,
        academicYear: session.academicYear,
        semester: session.semester,
      },
      select: { student: { select: { email: true, isActive: true } } },
    })

    const recipients = enrollments
      .filter((e) => e.student.isActive)
      .map((e) => e.student.email)
      .filter((email): email is string => Boolean(email))
    if (recipients.length === 0) return

    const closesAtEAT = formatEAT(session.codeExpiresAt)
    const whenLine = session.startsAt
      ? `<tr><td style="padding: 6px 0; color: #666;">Class starts</td><td style="padding: 6px 0;"><strong>${formatEAT(session.startsAt)}</strong></td></tr>`
      : ''
    const venueLine = session.venue
      ? `<tr><td style="padding: 6px 0; color: #666;">Venue</td><td style="padding: 6px 0;"><strong>${session.venue}</strong></td></tr>`
      : ''

    const html = `${SHELL_TOP}
      <h2 style="margin: 0 0 12px; color: #CC0000;">Check-in is now open</h2>
      <p><strong>${session.courseUnit.code} — ${session.courseUnit.name}</strong></p>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #666;">Lecturer</td><td style="padding: 6px 0;"><strong>${session.lecturer.fullName}</strong></td></tr>
        ${whenLine}
        ${venueLine}
        <tr><td style="padding: 6px 0; color: #666;">Check-in closes</td><td style="padding: 6px 0;"><strong style="color:#CC0000;">${closesAtEAT} (EAT)</strong></td></tr>
      </table>
      <p style="margin-top: 16px;">Open the dashboard and enter the <strong>6-character code shown in class</strong> before the closing time.
      Codes are never sent by email.</p>
      ${SHELL_BOTTOM}`

    await sendEmail({
      to: recipients,
      subject: `[UMU Attendance] Check-in open — ${session.courseUnit.code} (closes ${closesAtEAT} EAT)`,
      html,
    })
  } catch (error) {
    console.warn('[email] session-open notification failed:', (error as Error).message)
  }
}

interface WeeklyUnitRow {
  code: string
  name: string
  held: number
  attended: number
}

/**
 * Weekly attendance summary for every active student (FR-08.x digest).
 * Covers the current academic period; students with no sessions this period
 * are skipped. Returns the number of summaries sent (for logging/tests).
 */
export async function sendWeeklyAttendanceSummaries(): Promise<number> {
  try {
    const period = await getCurrentPeriod()

    // All attendance records in closed sessions for the current period,
    // with just enough context to compute per-student and per-unit stats.
    const records = await prisma.attendanceRecord.findMany({
      where: {
        session: {
          status: SessionStatus.closed,
          academicYear: period.academicYear,
          semester: period.semester,
        },
      },
      select: {
        studentId: true,
        status: true,
        session: {
          select: { courseUnit: { select: { code: true, name: true } } },
        },
      },
    })
    if (records.length === 0) return 0

    // Group by student → unit rollups + overall totals.
    const byStudent = new Map<string, Map<string, WeeklyUnitRow>>()
    for (const r of records) {
      let units = byStudent.get(r.studentId)
      if (!units) {
        units = new Map()
        byStudent.set(r.studentId, units)
      }
      const key = r.session.courseUnit.code
      const row = units.get(key) ?? { ...r.session.courseUnit, held: 0, attended: 0 }
      row.held += 1
      if (r.status === AttendanceStatus.present || r.status === AttendanceStatus.excused) {
        row.attended += 1
      }
      units.set(key, row)
    }

    const studentIds = Array.from(byStudent.keys())
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds }, isActive: true },
      select: { id: true, email: true },
    })

    let sent = 0
    const CHUNK = 10
    for (let i = 0; i < students.length; i += CHUNK) {
      const chunk = students.slice(i, i + CHUNK)
      await Promise.all(
        chunk.map(async (s) => {
          try {
            if (!s.email) return
            const units = Array.from(byStudent.get(s.id)?.values() ?? [])
            const held = units.reduce((n, u) => n + u.held, 0)
            if (held === 0) return
            const attended = units.reduce((n, u) => n + u.attended, 0)
            const pct = attendancePercentage(attended, held)
            const label = attendanceStatus(pct)
            const statusColour =
              label === 'good' ? '#1a7f37' : label === 'warning' ? '#C8860A' : '#CC0000'
            const statusText =
              label === 'good' ? 'On track' : label === 'warning' ? 'Warning — below 80%' : 'Not eligible — below 75%'

            const rows = [...units]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map(
                (u) => `
              <tr>
                <td style="padding: 6px 12px 6px 0; color: #666;">${u.code}</td>
                <td style="padding: 6px 12px 6px 0;">${u.name}</td>
                <td style="padding: 6px 0; text-align: right;"><strong>${attendancePercentage(u.attended, u.held).toFixed(1)}%</strong></td>
                <td style="padding: 6px 0 6px 12px; text-align: right; color: #666;">${u.attended}/${u.held}</td>
              </tr>`,
              )
              .join('')

            const html = `${SHELL_TOP}
      <h2 style="margin: 0 0 12px; color: #CC0000;">Your weekly attendance summary</h2>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #666;">Overall (${period.academicYear}, Semester ${period.semester})</td>
            <td style="padding: 6px 0;"><strong style="color:${statusColour};">${pct.toFixed(1)}%</strong> — ${statusText}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Sessions recorded</td><td style="padding: 6px 0;"><strong>${attended} attended of ${held}</strong></td></tr>
      </table>
      <h3 style="margin: 20px 0 8px; font-size: 15px;">By course unit</h3>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tr style="color: #666;"><td style="padding: 4px 12px 4px 0;">Code</td><td style="padding: 4px 12px 4px 0;">Unit</td><td style="padding: 4px 0; text-align: right;">Attendance</td><td style="padding: 4px 0 4px 12px; text-align: right;">Present/Held</td></tr>
        ${rows}
      </table>
      <p style="margin-top: 16px; font-size: 13px; color: #888;">Live figures are always available on your dashboard.</p>
      ${SHELL_BOTTOM}`

            await sendEmail({
              to: s.email,
              subject: `[UMU Attendance] Weekly summary — ${pct.toFixed(0)}% overall`,
              html,
            })
            sent += 1
          } catch (e) {
            console.warn('[email] weekly summary failed for a student:', (e as Error).message)
          }
        }),
      )
    }
    return sent
  } catch (error) {
    console.warn('[email] weekly summary run failed:', (error as Error).message)
    return 0
  }
}
