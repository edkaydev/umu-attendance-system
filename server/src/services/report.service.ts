import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { attendancePercentage, attendanceStatus } from '../utils/attendanceCalc'

interface ReportPeriod {
  academicYear: string
  semester: number
}

interface ReportActor {
  id: string
  role: string
  facultyId: string | null
}

function isGood(r: { status: string }): boolean {
  return r.status === 'present' || r.status === 'excused'
}

async function assertFacultyAdminAccess(actor: ReportActor, facultyId: string | null) {
  if (actor.role !== 'faculty_admin') {
    throw new ApiError('Faculty Admin access required', 403)
  }
  if (!facultyId || actor.facultyId !== facultyId) {
    throw new ApiError('Report is outside your faculty', 403)
  }
}

/** FR-10.6: lecturer report — units taught, sessions held, avg class attendance. */
export async function getLecturerReport(actor: ReportActor, lecturerId: string, period: ReportPeriod) {
  const lecturer = await prisma.user.findUnique({
    where: { id: lecturerId },
    select: { id: true, fullName: true, email: true, facultyId: true, role: true },
  })
  if (!lecturer || lecturer.role !== 'lecturer') {
    throw new ApiError('Lecturer not found', 404)
  }
  await assertFacultyAdminAccess(actor, lecturer.facultyId)

  const assignments = await prisma.lecturerAssignment.findMany({
    where: { lecturerId, academicYear: period.academicYear, semester: period.semester },
    select: {
      courseUnit: { select: { id: true, code: true, name: true } },
    },
  })
  const unitIds = assignments.map((a) => a.courseUnit.id)

  const sessions = await prisma.session.findMany({
    where: { lecturerId, courseUnitId: { in: unitIds }, ...period, status: 'closed' },
    select: {
      courseUnitId: true,
      attendanceRecords: { select: { status: true } },
    },
  })

  const unitStats = new Map<string, { held: number; present: number; total: number }>()
  for (const s of sessions) {
    const st = unitStats.get(s.courseUnitId) ?? { held: 0, present: 0, total: 0 }
    st.held++
    st.total += s.attendanceRecords.length
    for (const r of s.attendanceRecords) if (isGood(r)) st.present++
    unitStats.set(s.courseUnitId, st)
  }

  const units = assignments.map((a) => {
    const st = unitStats.get(a.courseUnit.id) ?? { held: 0, present: 0, total: 0 }
    return {
      courseUnit: a.courseUnit,
      sessionsHeld: st.held,
      avgAttendance: st.total ? Number(((st.present / st.total) * 100).toFixed(2)) : null,
    }
  })

  return {
    lecturer: {
      id: lecturer.id,
      fullName: lecturer.fullName,
      email: lecturer.email,
      facultyId: lecturer.facultyId,
    },
    period,
    units,
    totalSessions: sessions.length,
  }
}

/** FR-10.7: programme report — enrolled students, avg attendance, units below threshold. */
export async function getProgrammeReport(actor: ReportActor, programmeId: string, period: ReportPeriod) {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { id: true, code: true, name: true, facultyId: true },
  })
  if (!programme) throw new ApiError('Programme not found', 404)
  await assertFacultyAdminAccess(actor, programme.facultyId)

  const curriculum = await prisma.curriculumUnit.findMany({
    where: { programmeId, ...period },
    select: {
      courseUnit: { select: { id: true, code: true, name: true } },
      year: true,
    },
  })
  const unitIds = [...new Set(curriculum.map((c) => c.courseUnit.id))]

  let enrolledStudents = 0
  const sessions = await prisma.session.findMany({
    where: { courseUnitId: { in: unitIds }, ...period, status: 'closed' },
    select: {
      courseUnitId: true,
      attendanceRecords: { select: { status: true } },
    },
  })

  const unitStats = new Map<string, { held: number; present: number; total: number }>()
  let present = 0
  let total = 0
  for (const s of sessions) {
    const st = unitStats.get(s.courseUnitId) ?? { held: 0, present: 0, total: 0 }
    st.held++
    st.total += s.attendanceRecords.length
    for (const r of s.attendanceRecords) {
      if (isGood(r)) {
        st.present++
        present++
      }
    }
    total += s.attendanceRecords.length
    unitStats.set(s.courseUnitId, st)
  }

  const units = curriculum.map((c) => {
    const st = unitStats.get(c.courseUnit.id) ?? { held: 0, present: 0, total: 0 }
    const pct = st.total ? (st.present / st.total) * 100 : null
    return {
      courseUnit: c.courseUnit,
      year: c.year,
      sessionsHeld: st.held,
      avgAttendance: pct === null ? null : Number(pct.toFixed(2)),
      belowThreshold: pct !== null && pct < 75,
    }
  })

  if (unitIds.length > 0) {
    enrolledStudents = await prisma.enrollment.count({
      where: { courseUnitId: { in: unitIds }, ...period },
    })
  }

  return {
    programme: {
      id: programme.id,
      code: programme.code,
      name: programme.name,
      facultyId: programme.facultyId,
    },
    period,
    enrolledStudents,
    avgAttendance: total ? Number(((present / total) * 100).toFixed(2)) : null,
    unitsBelowThreshold: units.filter((u) => u.belowThreshold).length,
    units,
  }
}

/** FR-10.8: course unit report — enrolled students, sessions held, per-student attendance. */
export async function getCourseUnitReport(actor: ReportActor, courseUnitId: string, period: ReportPeriod) {
  const unit = await prisma.courseUnit.findUnique({
    where: { id: courseUnitId },
    select: { id: true, code: true, name: true, facultyId: true },
  })
  if (!unit) throw new ApiError('Course unit not found', 404)

  if (actor.role === 'lecturer') {
    const assignment = await prisma.lecturerAssignment.findUnique({
      where: {
        lecturerId_courseUnitId_academicYear_semester: {
          lecturerId: actor.id,
          courseUnitId,
          academicYear: period.academicYear,
          semester: period.semester,
        },
      },
    })
    if (!assignment) throw new ApiError('You are not assigned to this course unit', 403)
  } else if (actor.role === 'faculty_admin') {
    if (unit.facultyId !== actor.facultyId) {
      throw new ApiError('Report is outside your faculty', 403)
    }
  } else {
    throw new ApiError('Forbidden', 403)
  }

  const [sessions, enrollments] = await Promise.all([
    prisma.session.findMany({
      where: { courseUnitId, ...period },
      orderBy: { openedAt: 'asc' },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        status: true,
        venue: true,
        mode: true,
        startsAt: true,
        attendanceRecords: { select: { studentId: true, status: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: { courseUnitId, ...period },
      select: { student: { select: { id: true, regNumber: true, fullName: true } } },
    }),
  ])

  const closedSessions = sessions.filter((s) => s.status === 'closed')
  const closedIds = new Set(closedSessions.map((s) => s.id))

  const presentByStudent = new Map<string, number>()
  let present = 0
  let total = 0
  for (const s of closedSessions) {
    total += s.attendanceRecords.length
    for (const r of s.attendanceRecords) {
      if (isGood(r)) {
        present++
        presentByStudent.set(r.studentId, (presentByStudent.get(r.studentId) ?? 0) + 1)
      }
    }
  }

  const students = enrollments.map((e) => {
    const attended = presentByStudent.get(e.student.id) ?? 0
    const pct = attendancePercentage(attended, closedIds.size)
    return {
      student: e.student,
      sessionsHeld: closedIds.size,
      attended,
      percentage: closedIds.size > 0 ? Number(pct.toFixed(2)) : null,
      status: closedIds.size > 0 ? attendanceStatus(pct) : 'none',
    }
  })

  const sessionList = sessions.map((s) => {
    const presentCount = s.attendanceRecords.filter((r) => r.status === 'present').length
    const excusedCount = s.attendanceRecords.filter((r) => r.status === 'excused').length
    const absentCount = s.attendanceRecords.filter((r) => r.status === 'absent').length
    return {
      id: s.id,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      startsAt: s.startsAt,
      venue: s.venue,
      mode: s.mode,
      status: s.status,
      present: presentCount,
      excused: excusedCount,
      absent: absentCount,
    }
  })

  return {
    courseUnit: { id: unit.id, code: unit.code, name: unit.name, facultyId: unit.facultyId },
    period,
    sessionsHeld: closedIds.size,
    enrolledStudents: enrollments.length,
    avgAttendance: total ? Number(((present / total) * 100).toFixed(2)) : null,
    students,
    sessions: sessionList,
  }
}

/** FR-10.9: student report — units, % per unit, weekly chart, eligibility. */
export async function getStudentReport(actor: ReportActor, studentId: string, period: ReportPeriod) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, email: true, regNumber: true, facultyId: true, role: true },
  })
  if (!student || student.role !== 'student') {
    throw new ApiError('Student not found', 404)
  }
  await assertFacultyAdminAccess(actor, student.facultyId)

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, ...period },
    select: { courseUnit: { select: { id: true, code: true, name: true } } },
  })
  const unitIds = enrollments.map((e) => e.courseUnit.id)

  const sessions = await prisma.session.findMany({
    where: { courseUnitId: { in: unitIds }, ...period },
    select: { id: true, courseUnitId: true, openedAt: true, status: true },
  })
  const closedSessions = sessions.filter((s) => s.status === 'closed')
  const closedIds = new Set(closedSessions.map((s) => s.id))
  const closedByUnit = new Map<string, number>()
  for (const s of closedSessions) {
    closedByUnit.set(s.courseUnitId, (closedByUnit.get(s.courseUnitId) ?? 0) + 1)
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId, sessionId: { in: [...closedIds] } },
    select: { sessionId: true, status: true },
  })

  const sessionToUnit = new Map(sessions.map((s) => [s.id, s.courseUnitId]))
  const attendedByUnit = new Map<string, number>()
  for (const r of records) {
    const unitId = sessionToUnit.get(r.sessionId)
    if (unitId && isGood(r)) {
      attendedByUnit.set(unitId, (attendedByUnit.get(unitId) ?? 0) + 1)
    }
  }

  const units = enrollments.map((e) => {
    const total = closedByUnit.get(e.courseUnit.id) ?? 0
    const attended = attendedByUnit.get(e.courseUnit.id) ?? 0
    const pct = attendancePercentage(attended, total)
    return {
      courseUnit: e.courseUnit,
      sessionsHeld: total,
      attended,
      percentage: total > 0 ? Number(pct.toFixed(2)) : null,
      status: total > 0 ? attendanceStatus(pct) : 'none',
    }
  })

  // Weekly chart: last 7 days across the student's enrolled units
  const weeklyChart: Array<{ date: string; sessionsHeld: number; attended: number; absent: number }> = []
  for (let i = 6; i >= 0; i--) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - i)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const daySessions = closedSessions.filter((s) => s.openedAt >= start && s.openedAt < end)
    const dayIds = new Set(daySessions.map((s) => s.id))
    let attended = 0
    for (const r of records) {
      if (dayIds.has(r.sessionId) && isGood(r)) attended++
    }
    weeklyChart.push({
      date: start.toISOString().slice(0, 10),
      sessionsHeld: daySessions.length,
      attended,
      absent: daySessions.length - attended,
    })
  }

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      regNumber: student.regNumber,
      facultyId: student.facultyId,
    },
    period,
    units,
    weeklyChart,
  }
}
