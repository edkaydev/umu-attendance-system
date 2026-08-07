import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { reportToPdf, statusPill, PdfTable, PdfHeader } from '../services/pdf.service'
import {
  getLecturerReport,
  getProgrammeReport,
  getCourseUnitReport,
  getStudentReport,
} from '../services/report.service'

function parsePeriod(query: Record<string, unknown>): { academicYear: string; semester: number } {
  const academicYear = String(query.academicYear ?? '')
  const semester = Number(query.semester ?? '')
  if (!/^\d{4}\/\d{4}$/.test(academicYear)) {
    throw new ApiError('academicYear is required (e.g. 2025/2026)', 400)
  }
  if (!Number.isInteger(semester) || semester < 1 || semester > 2) {
    throw new ApiError('semester is required (1 or 2)', 400)
  }
  return { academicYear, semester }
}

function actor(req: Request) {
  return { id: req.user!.id, role: req.user!.role, facultyId: req.user!.facultyId ?? null }
}

function today(): string {
  return new Date().toLocaleDateString('en-UG', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function facultyName(facultyId: string | null): Promise<string> {
  if (!facultyId) return '—'
  const faculty = await prisma.faculty.findUnique({ where: { id: facultyId }, select: { name: true } })
  return faculty?.name ?? '—'
}

async function sendPdf(res: Response, pdf: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(pdf)
}

export async function lecturerPdfController(req: Request, res: Response, next: NextFunction) {
  try {
    const { lecturerId } = z.object({ lecturerId: z.string().uuid() }).parse(req.params)
    const period = parsePeriod(req.query)
    const data = await getLecturerReport(actor(req), lecturerId, period)
    const header: PdfHeader = {
      title: 'Lecturer Attendance Report',
      facultyName: await facultyName(data.lecturer.facultyId),
      reportDate: today(),
      periodLabel: `${period.academicYear} · Semester ${period.semester}`,
      subtitle: `Lecturer: ${data.lecturer.fullName} · ${data.lecturer.email}`,
    }
    const tables: PdfTable[] = [
      {
        heading: 'Units taught',
        headers: ['Code', 'Course Unit', 'Sessions Held', 'Average Attendance'],
        rows: data.units
          .filter((u) => u.sessionsHeld > 0)
          .map((u) => [
            u.courseUnit.code,
            u.courseUnit.name,
            u.sessionsHeld,
            u.avgAttendance === null ? '—' : `${u.avgAttendance}%`,
          ]),
      },
    ]
    const pdf = await reportToPdf(header, tables)
    await sendPdf(res, pdf, `lecturer-report-${data.lecturer.fullName.replace(/\s+/g, '-').toLowerCase()}.pdf`)
  } catch (e) {
    next(e)
  }
}

export async function programmePdfController(req: Request, res: Response, next: NextFunction) {
  try {
    const { programmeId } = z.object({ programmeId: z.string().uuid() }).parse(req.params)
    const period = parsePeriod(req.query)
    const data = await getProgrammeReport(actor(req), programmeId, period)
    const header: PdfHeader = {
      title: 'Programme Attendance Report',
      facultyName: await facultyName(data.programme.facultyId),
      reportDate: today(),
      periodLabel: `${period.academicYear} · Semester ${period.semester}`,
      subtitle: `${data.programme.code} — ${data.programme.name}`,
    }
    const tables: PdfTable[] = [
      {
        heading: 'Units',
        headers: ['Code', 'Course Unit', 'Sessions Held', 'Average Attendance', 'Below 75%'],
        rows: data.units
          .filter((u) => u.sessionsHeld > 0)
          .map((u) => [
            u.courseUnit.code,
            u.courseUnit.name,
            u.sessionsHeld,
            u.avgAttendance === null ? '—' : `${u.avgAttendance}%`,
            u.belowThreshold ? 'Yes' : 'No',
          ]),
      },
      {
        heading: 'Summary',
        headers: ['Enrolled Students', 'Overall Average', 'Units Below Threshold'],
        rows: [[data.enrolledStudents, data.avgAttendance === null ? '—' : `${data.avgAttendance}%`, data.unitsBelowThreshold]],
      },
    ]
    const pdf = await reportToPdf(header, tables)
    await sendPdf(res, pdf, `programme-report-${data.programme.code.toLowerCase()}.pdf`)
  } catch (e) {
    next(e)
  }
}

export async function courseUnitPdfController(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseUnitId } = z.object({ courseUnitId: z.string().uuid() }).parse(req.params)
    const period = parsePeriod(req.query)
    const data = await getCourseUnitReport(actor(req), courseUnitId, period)
    const header: PdfHeader = {
      title: 'Course Unit Attendance Report',
      facultyName: await facultyName(data.courseUnit.facultyId),
      reportDate: today(),
      periodLabel: `${period.academicYear} · Semester ${period.semester}`,
      subtitle: `${data.courseUnit.code} — ${data.courseUnit.name}`,
    }
    const tables: PdfTable[] = [
      {
        heading: 'Per-student attendance',
        headers: ['Reg Number', 'Student', 'Sessions', 'Attended', '%', 'Status'],
        rows: data.students.map((s) => [
          s.student.regNumber,
          s.student.fullName,
          s.sessionsHeld,
          s.attended,
          s.percentage === null ? '—' : `${s.percentage}%`,
          statusPill(s.status),
        ]),
      },
      {
        heading: 'Sessions',
        headers: ['Date', 'Opened', 'Closed', 'Status', 'Present', 'Excused', 'Absent'],
        rows: data.sessions.map((s) => [
          s.openedAt.toISOString().slice(0, 10),
          s.openedAt.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }),
          s.closedAt ? s.closedAt.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }) : '—',
          s.status,
          s.present,
          s.excused,
          s.absent,
        ]),
      },
    ]
    const pdf = await reportToPdf(header, tables)
    await sendPdf(res, pdf, `course-unit-report-${data.courseUnit.code.toLowerCase()}.pdf`)
  } catch (e) {
    next(e)
  }
}

export async function studentPdfController(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.params)
    const period = parsePeriod(req.query)
    const data = await getStudentReport(actor(req), studentId, period)
    const header: PdfHeader = {
      title: 'Student Attendance Report',
      facultyName: await facultyName(data.student.facultyId),
      reportDate: today(),
      periodLabel: `${period.academicYear} · Semester ${period.semester}`,
      subtitle: `${data.student.fullName} · ${data.student.regNumber ?? '—'} · ${data.student.email}`,
    }
    const activeWeekDays = data.weeklyChart.filter((w) => w.sessionsHeld > 0)
    const tables: PdfTable[] = [
      {
        heading: 'Units',
        headers: ['Code', 'Course Unit', 'Sessions', 'Attended', '%', 'Eligibility'],
        rows: data.units
          .filter((u) => u.sessionsHeld > 0)
          .map((u) => [
            u.courseUnit.code,
            u.courseUnit.name,
            u.sessionsHeld,
            u.attended,
            u.percentage === null ? '—' : `${u.percentage}%`,
            statusPill(u.status),
          ]),
      },
      ...(activeWeekDays.length > 0
        ? [
            {
              heading: 'Weekly activity (last 7 days)',
              headers: ['Date', 'Sessions Held', 'Attended', 'Absent'],
              rows: activeWeekDays.map((w) => [w.date, w.sessionsHeld, w.attended, w.absent]),
            } satisfies PdfTable,
          ]
        : []),
    ]
    const pdf = await reportToPdf(header, tables)
    await sendPdf(res, pdf, `student-report-${data.student.regNumber ?? 'student'}.pdf`)
  } catch (e) {
    next(e)
  }
}
