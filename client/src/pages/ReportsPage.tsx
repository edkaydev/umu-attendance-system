import { useEffect, useMemo, useState } from 'react'
import { reportApi, dashboardApi, assignmentApi, attendanceApi } from '../api/endpoints'
import { usePeriod } from '../hooks/usePeriod'
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
  percentage: number | null
  status: UnitStatus
}

interface UnitStudent {
  student: { id: string; regNumber: string | null; fullName: string }
  percentage: number
  status: UnitStatus
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
                    : u.avgAttendance < 80
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
                    : u.avgAttendance < 80
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
      percentage: number | null
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
                  s.percentage === null
                    ? 'text-text-disabled'
                    : s.percentage < 75
                    ? 'text-danger'
                    : s.percentage < 80
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {s.percentage === null ? '—' : `${s.percentage}%`}
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
                  u.percentage === null
                    ? 'text-text-disabled'
                    : u.percentage < 75
                    ? 'text-danger'
                    : u.percentage < 80
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {u.percentage === null ? '—' : `${u.percentage}%`}
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
  const { period: globalPeriod } = usePeriod()

  const [tab, setTab]                 = useState<ReportType>('programme')

  // Period is read from the System Admin setting — users cannot change it
  const academicYear = globalPeriod?.academicYear ?? ''
  const semester     = String(globalPeriod?.semester ?? 1)

  const [programmes,   setProgrammes]   = useState<Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>['programmeSummary']>([])
  const [lecturers,    setLecturers]    = useState<Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>['lecturerSummary']>([])
  const [courseUnits,  setCourseUnits]  = useState<{ id: string; code: string; name: string }[]>([])
  const [unitStudents, setUnitStudents] = useState<UnitStudent[]>([])

  const [programmeId,  setProgrammeId]  = useState('')
  const [courseUnitId, setCourseUnitId] = useState('')
  const [lecturerId,   setLecturerId]   = useState('')
  const [studentId,    setStudentId]    = useState('')

  // Search strings for each entity selector
  const [programmeSearch,  setProgrammeSearch]  = useState('')
  const [courseUnitSearch, setCourseUnitSearch] = useState('')
  const [lecturerSearch,   setLecturerSearch]   = useState('')
  const [studentSearch,    setStudentSearch]    = useState('')

  const [result,  setResult]  = useState<unknown | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfDownloading, setPdfDownloading] = useState(false)

  // Filtered lists
  const filteredProgrammes = useMemo(() => {
    const q = programmeSearch.trim().toLowerCase()
    return q ? programmes.filter((p) => p.programme.name.toLowerCase().includes(q) || p.programme.code.toLowerCase().includes(q)) : programmes
  }, [programmes, programmeSearch])

  const filteredCourseUnits = useMemo(() => {
    const q = courseUnitSearch.trim().toLowerCase()
    return q ? courseUnits.filter((u) => u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q)) : courseUnits
  }, [courseUnits, courseUnitSearch])

  const filteredLecturers = useMemo(() => {
    const q = lecturerSearch.trim().toLowerCase()
    return q ? lecturers.filter((l) => l.fullName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)) : lecturers
  }, [lecturers, lecturerSearch])

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    return q
      ? unitStudents.filter((s) =>
          s.student.fullName.toLowerCase().includes(q) ||
          (s.student.regNumber ?? '').toLowerCase().includes(q)
        )
      : unitStudents
  }, [unitStudents, studentSearch])

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

  async function downloadPdf() {
    if (!selectedId) return
    setPdfDownloading(true)
    try {
      const url = reportApi.pdfUrl(tab, selectedId, period)
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      // Build a readable filename from the tab + entity name
      const r = result as Record<string, { name?: string; code?: string; fullName?: string; regNumber?: string }> | null
      let label: string = tab
      if (r) {
        if (tab === 'programme' && r.programme) label = r.programme.code ?? tab
        else if (tab === 'course-unit' && r.courseUnit) label = r.courseUnit.code ?? tab
        else if (tab === 'lecturer' && r.lecturer) label = (r.lecturer.fullName ?? tab).replace(/\s+/g, '-')
        else if (tab === 'student' && r.student) label = r.student.regNumber ?? tab
      }
      const safeYear = period.academicYear.replace('/', '_')
      a.download = `${label}-report-${safeYear}-sem${period.semester}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to download PDF')
    } finally {
      setPdfDownloading(false)
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
          {/* Entity selector — with inline search */}
          {tab === 'programme' && (
            <div>
              <input
                placeholder="Search programmes…"
                value={programmeSearch}
                onChange={(e) => { setProgrammeSearch(e.target.value); setProgrammeId('') }}
                className="mb-1 w-full rounded border border-border bg-white px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled focus:border-umu-red focus:outline-none"
              />
              <Select
                label="Programme"
                placeholder="Select programme"
                value={programmeId}
                onChange={(e) => { setProgrammeId(e.target.value); setResult(null) }}
                options={filteredProgrammes.map((p) => ({ value: p.programme.id, label: p.programme.name }))}
              />
            </div>
          )}
          {tab === 'course-unit' && (
            <div>
              <input
                placeholder="Search course units…"
                value={courseUnitSearch}
                onChange={(e) => { setCourseUnitSearch(e.target.value); setCourseUnitId('') }}
                className="mb-1 w-full rounded border border-border bg-white px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled focus:border-umu-red focus:outline-none"
              />
              <Select
                label="Course Unit"
                placeholder="Select course unit"
                value={courseUnitId}
                onChange={(e) => { setCourseUnitId(e.target.value); setResult(null) }}
                options={filteredCourseUnits.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
              />
            </div>
          )}
          {tab === 'lecturer' && (
            <div>
              <input
                placeholder="Search lecturers…"
                value={lecturerSearch}
                onChange={(e) => { setLecturerSearch(e.target.value); setLecturerId('') }}
                className="mb-1 w-full rounded border border-border bg-white px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled focus:border-umu-red focus:outline-none"
              />
              <Select
                label="Lecturer"
                placeholder="Select lecturer"
                value={lecturerId}
                onChange={(e) => { setLecturerId(e.target.value); setResult(null) }}
                options={filteredLecturers.map((l) => ({ value: l.id, label: l.fullName }))}
              />
            </div>
          )}
          {tab === 'student' && (
            <>
              <div>
                <input
                  placeholder="Search course units…"
                  value={courseUnitSearch}
                  onChange={(e) => { setCourseUnitSearch(e.target.value); setCourseUnitId('') }}
                  className="mb-1 w-full rounded border border-border bg-white px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled focus:border-umu-red focus:outline-none"
                />
                <Select
                  label="Course Unit"
                  placeholder="Select course unit first"
                  value={courseUnitId}
                  onChange={(e) => { setCourseUnitId(e.target.value); setResult(null) }}
                  options={filteredCourseUnits.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                />
              </div>
              <div>
                <input
                  placeholder="Search students…"
                  value={studentSearch}
                  onChange={(e) => { setStudentSearch(e.target.value); setStudentId('') }}
                  className="mb-1 w-full rounded border border-border bg-white px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled focus:border-umu-red focus:outline-none"
                  disabled={!courseUnitId}
                />
                <Select
                  label="Student"
                  placeholder={
                    courseUnitId
                      ? unitStudents.length ? 'Select student' : 'No students enrolled'
                      : 'Select a course unit first'
                  }
                  value={studentId}
                  onChange={(e) => { setStudentId(e.target.value); setResult(null) }}
                  options={filteredStudents.map((s) => ({
                    value: s.student.id,
                    label: `${s.student.fullName}${s.student.regNumber ? ` (${s.student.regNumber})` : ''}`,
                  }))}
                />
              </div>
            </>
          )}

          {/* Period — read-only, set by System Admin */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Academic Year</span>
            <div className="flex min-h-[42px] items-center rounded border border-border bg-surface-1 px-3 text-body text-text-primary">
              {academicYear || '—'}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Semester</span>
            <div className="flex min-h-[42px] items-center rounded border border-border bg-surface-1 px-3 text-body text-text-primary">
              Semester {semester}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button loading={loading} onClick={generate} disabled={!selectedId}>
            Generate Report
          </Button>
          {/* PDF only available after report is generated */}
          {result !== null && selectedId && (
            <Button variant="secondary" loading={pdfDownloading} onClick={downloadPdf}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {pdfDownloading ? 'Downloading…' : 'Download PDF'}
            </Button>
          )}
          {!result && selectedId && (
            <span className="text-body-sm text-text-disabled">Generate the report first to unlock PDF download</span>
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
              <button
                onClick={downloadPdf}
                disabled={pdfDownloading}
                className="text-body font-medium text-umu-red hover:underline disabled:opacity-50"
              >
                {pdfDownloading ? 'Downloading…' : 'Download this report as PDF →'}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
