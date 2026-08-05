import { prisma } from '../config/db'

import { attendancePercentage, attendanceStatus } from '../utils/attendanceCalc'

function dayRange(daysAgo: number): { start: Date; end: Date } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - daysAgo)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** ─── Student dashboard (FR-09) ─── */
export async function getStudentDashboard(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    select: {
      courseUnitId: true,
      courseUnit: { select: { id: true, code: true, name: true } },
      academicYear: true,
      semester: true,
    },
    orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
  })

  if (enrollments.length === 0) {
    return { period: null, units: [], recentCheckIns: [], weeklyChart: [] }
  }

  const { academicYear, semester } = enrollments[0]
  const units = enrollments.filter((e) => e.academicYear === academicYear && e.semester === semester)

  const closedSessions = await prisma.session.findMany({
    where: {
      courseUnitId: { in: units.map((u) => u.courseUnitId) },
      academicYear,
      semester,
      status: 'closed',
    },
    select: { id: true, courseUnitId: true, openedAt: true },
  })

  const totalByUnit = new Map<string, number>()
  const sessionToUnit = new Map<string, string>()
  for (const s of closedSessions) {
    totalByUnit.set(s.courseUnitId, (totalByUnit.get(s.courseUnitId) ?? 0) + 1)
    sessionToUnit.set(s.id, s.courseUnitId)
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId, sessionId: { in: closedSessions.map((s) => s.id) } },
    select: { sessionId: true, status: true },
  })

  const attendedByUnit = new Map<string, number>()
  for (const r of records) {
    const unitId = sessionToUnit.get(r.sessionId)
    if (unitId && (r.status === 'present' || r.status === 'excused')) {
      attendedByUnit.set(unitId, (attendedByUnit.get(unitId) ?? 0) + 1)
    }
  }

  const unitsSummary = units.map((u) => {
    const total = totalByUnit.get(u.courseUnitId) ?? 0
    const attended = attendedByUnit.get(u.courseUnitId) ?? 0
    const pct = attendancePercentage(attended, total)
    return {
      courseUnit: u.courseUnit,
      sessionsHeld: total,
      attended,
      percentage: Number(pct.toFixed(2)),
      status: attendanceStatus(pct),
    }
  })

  const recentCheckIns = await prisma.attendanceRecord.findMany({
    where: { studentId, checkedInAt: { not: null } },
    select: {
      status: true,
      checkedInAt: true,
      session: {
        select: {
          openedAt: true,
          courseUnit: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { checkedInAt: 'desc' },
    take: 10,
  })

  // Weekly chart: last 7 days, sessions held vs attended (FR-09)
  const weeklyChart: Array<{
    date: string
    sessionsHeld: number
    attended: number
    absent: number
  }> = []
  for (let i = 6; i >= 0; i--) {
    const { start, end } = dayRange(i)
    const daySessions = closedSessions.filter(
      (s) => s.openedAt >= start && s.openedAt < end
    )
    const dayIds = new Set(daySessions.map((s) => s.id))
    let attended = 0
    for (const r of records) {
      if (dayIds.has(r.sessionId) && (r.status === 'present' || r.status === 'excused')) {
        attended++
      }
    }
    weeklyChart.push({
      date: isoDay(start),
      sessionsHeld: daySessions.length,
      attended,
      absent: daySessions.length - attended,
    })
  }

  return {
    period: { academicYear, semester },
    units: unitsSummary,
    recentCheckIns,
    weeklyChart,
  }
}

/** ─── Lecturer dashboard (FR-09) ─── */
export async function getLecturerDashboard(lecturerId: string) {
  const assignments = await prisma.lecturerAssignment.findMany({
    where: { lecturerId },
    select: {
      courseUnitId: true,
      academicYear: true,
      semester: true,
      courseUnit: { select: { id: true, code: true, name: true } },
    },
  })
  const unitIds = assignments.map((a) => a.courseUnitId)

  const { start: todayStart } = dayRange(0)

  const todaySessions = await prisma.session.findMany({
    where: { lecturerId, openedAt: { gte: todayStart } },
    include: {
      courseUnit: { select: { id: true, code: true, name: true } },
      _count: {
        select: { attendanceRecords: { where: { status: 'present' } } },
      },
    },
    orderBy: { openedAt: 'desc' },
  })

  const atRisk = unitIds.length
    ? await prisma.attendanceAlert.findMany({
        where: { courseUnitId: { in: unitIds }, resolved: false },
        include: {
          student: { select: { id: true, fullName: true, regNumber: true } },
          courseUnit: { select: { id: true, code: true, name: true } },
        },
        orderBy: { sentAt: 'desc' },
      })
    : []

  return {
    units: assignments.map((a) => ({
      courseUnit: a.courseUnit,
      academicYear: a.academicYear,
      semester: a.semester,
    })),
    todaySessions,
    atRisk,
  }
}

/** ─── Faculty Admin dashboard (FR-09) ─── */
export async function getFacultyAdminDashboard(adminId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { facultyId: true },
  })

  // Faculty not yet assigned — return a safe empty state so the frontend
  // can show a "contact System Admin" prompt instead of a crash.
  if (!admin?.facultyId) {
    return {
      facultyNotAssigned: true as const,
      overview: { courseUnits: 0, students: 0, lecturers: 0, sessionsToday: 0, activeAlerts: 0 },
      activeAlerts: [],
      lecturerSummary: [],
      programmeSummary: [],
    }
  }

  const facultyId = admin.facultyId

  const { start: todayStart } = dayRange(0)

  const [unitCount, studentCount, lecturerCount, sessionsToday, activeAlerts] = await Promise.all([
    prisma.courseUnit.count({ where: { facultyId } }),
    prisma.user.count({ where: { facultyId, role: 'student', isActive: true } }),
    prisma.user.count({ where: { facultyId, role: 'lecturer', isActive: true } }),
    prisma.session.count({ where: { courseUnit: { facultyId }, openedAt: { gte: todayStart } } }),
    prisma.attendanceAlert.findMany({
      where: { courseUnit: { facultyId }, resolved: false },
      include: {
        student: { select: { id: true, fullName: true, regNumber: true } },
        courseUnit: { select: { id: true, code: true, name: true } },
      },
      orderBy: { sentAt: 'desc' },
    }),
  ])

  const lecturers = await prisma.user.findMany({
    where: { facultyId, role: 'lecturer', isActive: true },
    select: { id: true, fullName: true, email: true },
  })

  const lecturerSummary = []
  for (const l of lecturers) {
    const [units, closedSessions] = await Promise.all([
      prisma.lecturerAssignment.count({ where: { lecturerId: l.id } }),
      prisma.session.findMany({
        where: { lecturerId: l.id, status: 'closed' },
        select: { attendanceRecords: { select: { status: true } } },
      }),
    ])
    let present = 0
    let total = 0
    for (const s of closedSessions) {
      total += s.attendanceRecords.length
      for (const r of s.attendanceRecords) {
        if (r.status === 'present' || r.status === 'excused') present++
      }
    }
    lecturerSummary.push({
      id: l.id,
      fullName: l.fullName,
      email: l.email,
      units,
      sessions: closedSessions.length,
      avgAttendance: total ? Number(((present / total) * 100).toFixed(2)) : null,
    })
  }

  const programmes = await prisma.programme.findMany({
    where: { facultyId },
    select: { id: true, code: true, name: true },
  })

  const programmeSummary = []
  for (const p of programmes) {
    const units = await prisma.curriculumUnit.findMany({
      where: { programmeId: p.id },
      select: { courseUnitId: true },
    })
    const unitIds = [...new Set(units.map((u) => u.courseUnitId))]
    if (unitIds.length === 0) {
      programmeSummary.push({ programme: p, students: 0, avgAttendance: null, unitsBelowThreshold: 0 })
      continue
    }
    const [students, sessions] = await Promise.all([
      prisma.enrollment.count({ where: { courseUnitId: { in: unitIds } } }),
      prisma.session.findMany({
        where: { courseUnitId: { in: unitIds }, status: 'closed' },
        select: { courseUnitId: true, attendanceRecords: { select: { status: true } } },
      }),
    ])
    let present = 0
    let total = 0
    const unitStats = new Map<string, { present: number; total: number }>()
    for (const s of sessions) {
      const stats = unitStats.get(s.courseUnitId) ?? { present: 0, total: 0 }
      stats.total += s.attendanceRecords.length
      for (const r of s.attendanceRecords) {
        if (r.status === 'present' || r.status === 'excused') {
          stats.present++
          present++
        }
      }
      total += s.attendanceRecords.length
      unitStats.set(s.courseUnitId, stats)
    }
    let unitsBelow = 0
    for (const stats of unitStats.values()) {
      const pct = stats.total ? (stats.present / stats.total) * 100 : 100
      if (pct < 75) unitsBelow++
    }
    programmeSummary.push({
      programme: p,
      students,
      avgAttendance: total ? Number(((present / total) * 100).toFixed(2)) : null,
      unitsBelowThreshold: unitsBelow,
    })
  }

  return {
    overview: {
      courseUnits: unitCount,
      students: studentCount,
      lecturers: lecturerCount,
      sessionsToday,
      activeAlerts: activeAlerts.length,
    },
    activeAlerts,
    lecturerSummary,
    programmeSummary,
  }
}

/** ─── System Admin dashboard (FR-09) ─── */
export async function getSystemAdminDashboard() {
  const { start: todayStart } = dayRange(0)

  const [students, lecturers, facultyAdmins, admins, activeSessionsToday, recentImports, recentActivity] =
    await Promise.all([
      prisma.user.count({ where: { role: 'student', isActive: true } }),
      prisma.user.count({ where: { role: 'lecturer', isActive: true } }),
      prisma.user.count({ where: { role: 'faculty_admin', isActive: true } }),
      prisma.user.count({ where: { role: 'system_admin', isActive: true } }),
      prisma.session.count({ where: { status: 'open', openedAt: { gte: todayStart } } }),
      prisma.auditLog.findMany({
        where: { action: 'IMPORT' },
        include: { user: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

  return {
    overview: {
      totalUsers: students + lecturers + facultyAdmins + admins,
      students,
      lecturers,
      facultyAdmins,
      systemAdmins: admins,
      activeSessionsToday,
    },
    recentImports,
    recentActivity,
  }
}
