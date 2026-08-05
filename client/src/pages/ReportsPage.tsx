import { useEffect, useMemo, useState } from 'react'
import { reportApi, dashboardApi, assignmentApi, attendanceApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { ApiClientError } from '../api/client'
import type { UnitStatus } from '../types'

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportType = 'programme' | 'course-unit' | 'lecturer' | 'student'

const REPORT_TABS: { type: ReportType; label: string; desc: string }[] = [
  { type: 'programme',   label: 'Programme',   desc: 'Average attendance and units below threshold' },
  { type: 'course-unit', label: 'Course Unit',  desc: 'All enrolled students and their attendance %' },
  { type: 'lecturer',    label: 'Lecturer',     desc: 'Sessions held and average attendance per unit' },
  { type: 'student',     label: 'Student',      desc: 'Full per-unit breakdown with eligibility status' },
]

interface StudentRow {
  courseUnit: { id: string; code: string; name: string }
  sessionsHeld: number
  attended: number
  percentage: number
  status: UnitStatus
}

interface UnitStudent {
  student: { id: string; regNumber: string | null; fullName: string }
  percentage: number
  status: UnitStatus
}

function academicYearOptions(): { value: string; label: string }[] {
  const now = new Date()
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return [startYear - 1, startYear].map((y) => ({
    value: `${y}/${y + 1}`,
    label: `${y}/${y + 1}`,
  }))
}

// ─── InfoPill ────────────────────────────────────────────────────────────────
function InfoPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 px-4 py-2">
      <span className="text-h4 font-bold text-text-primary">{value}</span>
      <span className="ml-1.5 text-body-sm text-text-secondary">{label}</span>
    </div>
  )
}

// ─── Table shell ─────────────────────────────────────────────────────────────
function ReportTable({
  headers,
  children,
}: {
  headers: string[]
  children: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-surface-1">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary first:pl-5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  )
}

// ─── Report renderers ────────────────────────────────────────────────────────

function ProgrammeReport({ data }: { data: unknown }) {
  const r = data as {
    programme: { code: string; name: string }
    period: { academicYear: string; semester: number }
    enrolledStudents: number
    avgAttendance: number | null
    unitsBelowThreshold: number
    units: {
      courseUnit: { id: string; code: string; name: string }
      year: number
      sessionsHeld: number
      avgAttendance: number | null
      belowThreshold: boolean
    }[]
  }
  return (
    <div className="space-y-4">
      <p className="text-body text-text-secondary">
        {r.programme.name} ({r.programme.code}) &middot; {r.period.academicYear} &middot; Semester {r.period.semester}
      </p>
      <div className="flex flex-wrap gap-3">
        <InfoPill label="Enrolled students" value={r.enrolledStudents} />
        <InfoPill label="Faculty average"   value={r.avgAttendance === null ? '—' : `${r.avgAttendance}%`} />
        <InfoPill label="Units below 75%"   value={r.unitsBelowThreshold} />
      </div>
      <ReportTable headers={['Unit', 'Year', 'Sessions', 'Avg Attendance', 'Status']}>
        {r.units.map((u) => (
          <tr key={u.courseUnit.id} className="hover:bg-surface-1">
            <td className="px-4 py-3 pl-5">
              <span className="text-body font-medium text-text-primary">{u.courseUnit.name}</span>{' '}
              <span className="text-body-sm text-text-secondary">({u.courseUnit.code})</span>
            </td>
            <td className="px-4 py-3 text-body text-text-secondary">Year {u.year}</td>
            <td className="px-4 py-3 text-body text-text-secondary">{u.sessionsHeld}</td>
            <td className="px-4 py-3">
              <span
                className={`text-body font-semibold ${
                  u.avgAttendance === null
                    ? 'text-text-disabled'
                    : u.avgAttendance < 75
                    ? 'text-danger'
                    : u.avgAttendance <= 80
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {u.avgAttendance === null ? '—' : `${u.avgAttendance}%`}
              </span>
            </td>
            <td className="px-4 py-3">
              {u.belowThreshold ? <Badge status="critical" /> : <Badge status="good" />}
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  )
}

function LecturerReport({ data }: { data: unknown }) {
  const r = data as {
    lecturer: { fullName: string; email: string }
    period: { academicYear: string; semester: number }
    totalSessions: number
    units: {
      courseUnit: { id: string; code: string; name: string }
      sessionsHeld: number
      avgAttendance: number | null
    }[]
  }
  return (
    <div className="space-y-4">
      <p className="text-body text-text-secondary">
        {r.lecturer.fullName} &middot; {r.lecturer.email}
      </p>
      <InfoPill label="Total sessions this semester" value={r.totalSessions} />
      <ReportTable headers={['Course Unit', 'Sessions Held', 'Average Attendance']}>
        {r.units.map((u) => (
          <tr key={u.courseUnit.id} className="hover:bg-surface-1">
            <td className="px-4 py-3 pl-5">
              <span className="text-body font-medium text-text-primary">{u.courseUnit.name}</span>{' '}
              <span className="text-body-sm text-text-secondary">({u.courseUnit.code})</span>
            </td>
            <td className="px-4 py-3 text-body text-text-secondary">{u.sessionsHeld}</td>
            <td className="px-4 py-3">
              <span
                className={`text-body font-semibold ${
                  u.avgAttendance === null
                    ? 'text-text-disabled'
                    : u.avgAttendance < 75
                    ? 'text-danger'
                    : u.avgAttendance <= 80
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {u.avgAttendance === null ? '—' : `${u.avgAttendance}%`}
              </span>
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  )
}

function CourseUnitReport({ data }: { data: unknown }) {
  const r = data as {
    courseUnit: { code: string; name: string }
    sessionsHeld: number
    enrolledStudents: number
    avgAttendance: number | null
    students: {
      student: { id: string; regNumber: string | null; fullName: string }
      sessionsHeld: number
      attended: number
      percentage: number
      status: UnitStatus
    }[]
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <InfoPill label="Sessions held"      value={r.sessionsHeld} />
        <InfoPill label="Enrolled students"  value={r.enrolledStudents} />
        <InfoPill label="Class average"      value={r.avgAttendance === null ? '—' : `${r.avgAttendance}%`} />
      </div>
      <ReportTable headers={['Student', 'Reg Number', 'Sessions', 'Attended', '%', 'Status']}>
        {r.students.map((s) => (
          <tr key={s.student.id} className="hover:bg-surface-1">
            <td className="px-4 py-3 pl-5 text-body font-medium text-text-primary">
              {s.student.fullName}
            </td>
            <td className="px-4 py-3 text-body text-text-secondary">
              {s.student.regNumber ?? '—'}
            </td>
            <td className="px-4 py-3 text-body text-text-secondary">{s.sessionsHeld}</td>
            <td className="px-4 py-3 text-body text-text-secondary">{s.attended}</td>
            <td className="px-4 py-3">
              <span
                className={`text-body font-semibold ${
                  s.percentage < 75
                    ? 'text-danger'
                    : s.percentage <= 80
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {s.percentage}%
              </span>
            </td>
            <td className="px-4 py-3">
              <Badge status={s.status} />
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  )
}

function StudentReport({ data }: { data: unknown }) {
  const r = data as {
    student: { fullName: string; regNumber: string | null }
    period: { academicYear: string; semester: number }
    units: StudentRow[]
  }
  return (
    <div className="space-y-4">
      <p className="text-body text-text-secondary">
        {r.student.fullName}
        {r.student.regNumber ? ` · ${r.student.regNumber}` : ''}
        {' · '}{r.period.academicYear} · Semester {r.period.semester}
      </p>
      <ReportTable headers={['Course Unit', 'Sessions', 'Attended', '%', 'Status']}>
        {r.units.map((u) => (
          // key on courseUnit.id — not student.id (that was the bug)
          <tr key={u.courseUnit.id} className="hover:bg-surface-1">
            <td className="px-4 py-3 pl-5">
              <span className="text-body font-medium text-text-primary">{u.courseUnit.name}</span>{' '}
              <span className="text-body-sm text-text-secondary">({u.courseUnit.code})</span>
            </td>
            <td className="px-4 py-3 text-body text-text-secondary">{u.sessionsHeld}</td>
            <td className="px-4 py-3 text-body text-text-secondary">{u.attended}</td>
            <td className="px-4 py-3">
              <span
                className={`text-body font-semibold ${
                  u.percentage < 75
                    ? 'text-danger'
                    : u.percentage <= 80
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {u.percentage}%
              </span>
            </td>
            <td className="px-4 py-3">
              <Badge status={u.status} />
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const toast = useToast()

  const [tab, setTab]                 = useState<ReportType>('programme')
  const [academicYear, setAcademicYear] = useState(academicYearOptions()[0].value)
  const [semester, setSemester]       = useState('1')

  const [programmes,   setProgrammes]   = useState<Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>['programmeSummary']>([])
  const [lecturers,    setLecturers]    = useState<Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>['lecturerSummary']>([])
  const [courseUnits,  setCourseUnits]  = useState<{ id: string; code: string; name: string }[]>([])
  const [unitStudents, setUnitStudents] = useState<UnitStudent[]>([])

  const [programmeId,  setProgrammeId]  = useState('')
  const [courseUnitId, setCourseUnitId] = useState('')
  const [lecturerId,   setLecturerId]   = useState('')
  const [studentId,    setStudentId]    = useState('')

  const [result,  setResult]  = useState<unknown | null>(null)
  const [loading, setLoading] = useState(false)

  // Load selectable items on mount
  useEffect(() => {
    dashboardApi
      .facultyAdmin()
      .then((d) => {
        setProgrammes(d.programmeSummary)
        setLecturers(d.lecturerSummary)
      })
      .catch((e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load report options')
      )

    assignmentApi
      .list()
      .then((assignments) => {
        const seen = new Map<string, { id: string; code: string; name: string }>()
        for (const a of assignments) seen.set(a.courseUnit.id, a.courseUnit)
        setCourseUnits([...seen.values()])
      })
      .catch(() => {})
  }, [toast])

  // When course unit changes, load students for the student report selector
  useEffect(() => {
    if (!courseUnitId) {
      setUnitStudents([])
      setStudentId('')
      return
    }
    attendanceApi
      .unitSummary(courseUnitId, { academicYear, semester: Number(semester) })
      .then((r) => {
        setUnitStudents(r.students)
        setStudentId('')
      })
      .catch(() => setUnitStudents([]))
  }, [courseUnitId, academicYear, semester])

  const period = useMemo(
    () => ({ academicYear, semester: Number(semester) }),
    [academicYear, semester]
  )

  // Derive the selected entity ID for PDF link
  const selectedId =
    tab === 'programme'   ? programmeId  :
    tab === 'course-unit' ? courseUnitId :
    tab === 'lecturer'    ? lecturerId   :
    studentId

  async function generate() {
    if (!selectedId) {
      toast.error('Select an item first')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const methods = {
        programme:    reportApi.programme.bind(reportApi),
        'course-unit': reportApi.courseUnit.bind(reportApi),
        lecturer:     reportApi.lecturer.bind(reportApi),
        student:      reportApi.student.bind(reportApi),
      }
      setResult(await methods[tab](selectedId, period))
      toast.success('Report generated')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Reports</h1>
        <p className="mt-1 text-body text-text-secondary">
          Generate and download attendance reports for your faculty.
        </p>
      </div>

      {/* ── Report type tabs ── */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        {REPORT_TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => { setTab(t.type); setResult(null) }}
            className={`min-h-[40px] rounded-sm px-4 py-2 text-body font-medium transition-colors ${
              tab === t.type
                ? 'bg-umu-red text-white'
                : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Filters card ── */}
      <Card>
        <p className="mb-4 text-body-sm text-text-secondary">
          {REPORT_TABS.find((t) => t.type === tab)?.desc}
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Entity selector */}
          {tab === 'programme' && (
            <Select
              label="Programme"
              placeholder="Select programme"
              value={programmeId}
              onChange={(e) => setProgrammeId(e.target.value)}
              options={programmes.map((p) => ({ value: p.programme.id, label: p.programme.name }))}
            />
          )}
          {tab === 'course-unit' && (
            <Select
              label="Course Unit"
              placeholder="Select course unit"
              value={courseUnitId}
              onChange={(e) => setCourseUnitId(e.target.value)}
              options={courseUnits.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
            />
          )}
          {tab === 'lecturer' && (
            <Select
              label="Lecturer"
              placeholder="Select lecturer"
              value={lecturerId}
              onChange={(e) => setLecturerId(e.target.value)}
              options={lecturers.map((l) => ({ value: l.id, label: l.fullName }))}
            />
          )}
          {tab === 'student' && (
            <>
              <Select
                label="Course Unit"
                placeholder="Select course unit first"
                value={courseUnitId}
                onChange={(e) => setCourseUnitId(e.target.value)}
                options={courseUnits.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
              />
              <Select
                label="Student"
                placeholder={
                  courseUnitId
                    ? unitStudents.length
                      ? 'Select student'
                      : 'No students enrolled'
                    : 'Select a course unit first'
                }
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                options={unitStudents.map((s) => ({
                  value: s.student.id,
                  label: `${s.student.fullName}${s.student.regNumber ? ` (${s.student.regNumber})` : ''}`,
                }))}
              />
            </>
          )}

          {/* Period selectors */}
          <Select
            label="Academic Year"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            options={academicYearOptions()}
          />
          <Select
            label="Semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            options={[
              { value: '1', label: 'Semester 1' },
              { value: '2', label: 'Semester 2' },
            ]}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button loading={loading} onClick={generate} disabled={!selectedId}>
            Generate Report
          </Button>
          {selectedId && (
            <a
              href={reportApi.pdfUrl(tab, selectedId, period)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded border border-umu-red px-6 text-body font-semibold text-umu-red transition-colors hover:bg-[#FFF4F4]"
            >
              {/* Download icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PDF
            </a>
          )}
        </div>
      </Card>

      {/* ── Report preview ── */}
      {result !== null && (
        <Card title="Report Preview" noPadding>
          <div className="p-5 pb-0">
            {tab === 'programme'   && <ProgrammeReport   data={result} />}
            {tab === 'lecturer'    && <LecturerReport    data={result} />}
            {tab === 'course-unit' && <CourseUnitReport  data={result} />}
            {tab === 'student'     && <StudentReport     data={result} />}
          </div>
          {/* PDF download at bottom of preview too */}
          {selectedId && (
            <div className="border-t border-border px-5 py-3 text-right">
              <a
                href={reportApi.pdfUrl(tab, selectedId, period)}
                className="text-body font-medium text-umu-red hover:underline"
              >
                Download this report as PDF →
              </a>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
