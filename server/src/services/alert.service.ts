import { AlertType } from '@prisma/client'
import { prisma } from '../config/db'
import { attendancePercentage, ALERT_THRESHOLDS, alertLevelsForPct, isAttended } from '../utils/attendanceCalc'
import { notifyAlertRecipients } from './email.service'

/**
 * FR-08 alert evaluation. Runs after a session closes.
 *
 * Dedup rule: an alert (student + unit + type) is only created while no
 * unresolved alert of that type exists for the pair. When a student
 * recovers above the threshold the active alert is marked resolved, so a
 * later drop can fire a fresh alert (recovery re-fire).
 */
export async function evaluateAttendanceAlerts(courseUnitId: string, academicYear: string, semester: number) {
  // Only closed sessions count towards the percentage (FR-07.3)
  const closedSessions = await prisma.session.findMany({
    where: {
      courseUnitId,
      academicYear,
      semester,
      status: 'closed',
    },
    select: { id: true },
  })
  const totalSessions = closedSessions.length
  if (totalSessions === 0) return { created: [], resolved: [] }

  const enrollments = await prisma.enrollment.findMany({
    where: { courseUnitId, academicYear, semester },
    select: { studentId: true },
  })

  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId: { in: closedSessions.map((s) => s.id) } },
    select: { studentId: true, status: true },
  })

  const counts = new Map<string, number>()
  for (const r of records) {
    if (isAttended(r)) {
      counts.set(r.studentId, (counts.get(r.studentId) ?? 0) + 1)
    }
  }

  const activeAlerts = await prisma.attendanceAlert.findMany({
    where: { courseUnitId, resolved: false },
  })
  const activeByType = new Map<AlertType, Set<string>>()
  for (const a of activeAlerts) {
    const set = activeByType.get(a.alertType) ?? new Set<string>()
    set.add(a.studentId)
    activeByType.set(a.alertType, set)
  }

  const created: Array<{
    studentId: string
    alertType: AlertType
    attendancePct: number
    sessionsMissed: number
  }> = []
  const resolvedIds: string[] = []

  for (const { studentId } of enrollments) {
    const attended = counts.get(studentId) ?? 0
    const pct = attendancePercentage(attended, totalSessions)

    const { warning: needsWarning, critical: needsCritical } = alertLevelsForPct(pct)
    const sessionsMissed = totalSessions - attended

    for (const [alertType, needs] of [
      [AlertType.warning, needsWarning],
      [AlertType.critical, needsCritical],
    ] as const) {
      const active = activeByType.get(alertType)?.has(studentId) ?? false
      if (needs && !active) {
        await prisma.attendanceAlert.create({
          data: {
            studentId,
            courseUnitId,
            alertType,
            attendancePct: Number(pct.toFixed(2)),
          },
        })
        created.push({ studentId, alertType, attendancePct: Number(pct.toFixed(2)), sessionsMissed })
      } else if (!needs && active) {
        // Recovery: student climbed back above the threshold
        const alert = activeAlerts.find(
          (a) => a.alertType === alertType && a.studentId === studentId
        )
        if (alert) resolvedIds.push(alert.id)
      }
    }
  }

  if (resolvedIds.length > 0) {
    await prisma.attendanceAlert.updateMany({
      where: { id: { in: resolvedIds } },
      data: { resolved: true },
    })
  }

  // FR-08.3 / FR-08.7: email the student, lecturers, and Faculty Admin
  for (const alert of created) {
    await notifyAlertRecipients(
      alert.studentId,
      courseUnitId,
      alert.alertType,
      alert.attendancePct,
      alert.sessionsMissed
    )
  }

  return { created, resolved: resolvedIds.length }
}
