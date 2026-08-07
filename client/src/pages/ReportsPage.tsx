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

// ─── StatCard — big number, small label below ────────────────────────────────
function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string | number
  valueClass?: string
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-white px-5 py-4 shadow-sm">
      <span className={`text-3xl font-extrabold leading-none ${valueClass ?? 'text-text-primary'}`}>
        {value}
      </span>
      <span className="mt-1.5 text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </span>
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

// ─── pctClass helper ─────────────────────────────────────────────────────────
function pctClass(pct: number | null): string {
  if (pct === null) return 'text-text-disabled'
  if (pct < 75) return 'text-danger'
  if (pct < 80) return 'text-warning'
  return 'text-success'
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

  // Only show units that have had at least one session — units with 0 sessions add no signal
  const activeUnits = r.units.filter((u) => u.sessionsHeld > 0)

  return (
    <div className="space-y-6 pb-2">
      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Enrolled Students" value={r.enrolledStudents} />
        <StatCard
          label="Programme Average"
          value={r.avgAttendance === null ? '—' : `${r.avgAttendance}%`}
          valueClass={pctClass(r.avgAttendance)}
        />
        <StatCard
          label="Units Below 75%"
          value={r.unitsBelowThreshold}
          valueClass={r.unitsBelowThreshold > 0 ? 'text-danger' : 'text-success'}
        />
      </div>

      {/* Units table — only units with sessions */}
      {activeUnits.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-text-secondary">
          No sessions have been held yet this semester.
        </p>
      ) : (
        <ReportTable headers={['Course Unit', 'Year', 'Sessions', 'Avg Attendance']}>
          {activeUnits.map((u) => (
            <tr key={u.courseUnit.id} className="hover:bg-surface-1">
              <td className="px-4 py-3 pl-5">
                <span className="text-body font-semibold text-text-primary">{u.courseUnit.name}</span>
                <span className="ml-2 text-body-sm text-text-secondary">{u.courseUnit.code}</span>
              </td>
              <td className="px-4 py-3 text-body text-text-secondary">Year {u.year}</td>
              <td className="px-4 py-3 text-body text-text-secondary">{u.sessionsHeld}</td>
              <td className="px-4 py-3">
                <span className={`text-lg font-bold ${pctClass(u.avgAttendance)}`}>
                  {u.avgAttendance === null ? '—' : `${u.avgAttendance}%`}
                </span>
              </td>
            </tr>
          ))}
        </ReportTable>
      )}
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

  const activeUnits = r.units.filter((u) => u.sessionsHeld > 0)
  const overallAvg =
    activeUnits.length > 0
      ? activeUnits.reduce((sum, u) => sum + (u.avgAttendance ?? 0), 0) / activeUnits.length
      : null

  return (
    <div className="space-y-6 pb-2">
      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Units Assigned" value={r.units.length} />
        <StatCard label="Sessions This Semester" value={r.totalSessions} />
        <StatCard
          label="Overall Avg Attendance"
          value={overallAvg === null ? '—' : `${overallAvg.toFixed(1)}%`}
          valueClass={pctClass(overallAvg)}
        />
      </div>

      {activeUnits.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-text-secondary">
          No sessions have been held yet this semester.
        </p>
      ) : (
        <ReportTable headers={['Course Unit', 'Sessions Held', 'Avg Attendance']}>
          {activeUnits.map((u) => (
            <tr key={u.courseUnit.id} className="hover:bg-surface-1">
              <td className="px-4 py-3 pl-5">
                <span className="text-body font-semibold text-text-primary">{u.courseUnit.name}</span>
                <span className="ml-2 text-body-sm text-text-secondary">{u.courseUnit.code}</span>
              </td>
              <td className="px-4 py-3 text-body text-text-secondary">{u.sessionsHeld}</td>
              <td className="px-4 py-3">
                <span className={`text-lg font-bold ${pctClass(u.avgAttendance)}`}>
                  {u.avgAttendance === null ? '—' : `${u.avgAttendance}%`}
                </span>
              </td>
            </tr>
          ))}
        </ReportTable>
      )}
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

  const atRisk = r.students.filter((s) => s.status === 'warning' || s.status === 'not_eligible').length

  return (
    <div className="space-y-6 pb-2">
      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Sessions Held" value={r.sessionsHeld} />
        <StatCard label="Enrolled Students" value={r.enrolledStudents} />
        <StatCard
          label="Class Average"
          value={r.avgAttendance === null ? '—' : `${r.avgAttendance}%`}
          valueClass={pctClass(r.avgAttendance)}
        />
        <StatCard
          label="Students At Risk"
          value={atRisk}
          valueClass={atRisk > 0 ? 'text-danger' : 'text-success'}
        />
      </div>

      {r.sessionsHeld === 0 ? (
        <p className="py-6 text-center text-body-sm text-text-secondary">
          No closed sessions yet — attendance will appear after the lecturer closes a session.
        </p>
      ) : (
        <ReportTable headers={['Student', 'Reg No.', 'Attended', '%', 'Status']}>
          {r.students.map((s) => (
            <tr key={s.student.id} className="hover:bg-surface-1">
              <td className="px-4 py-3 pl-5 text-body font-semibold text-text-primary">
                {s.student.fullName}
              </td>
              <td className="px-4 py-3 text-body-sm text-text-secondary">
                {s.student.regNumber ?? '—'}
              </td>
              <td className="px-4 py-3 text-body text-text-secondary">
                {s.attended} / {s.sessionsHeld}
              </td>
              <td className="px-4 py-3">
                <span className={`text-lg font-bold ${pctClass(s.percentage)}`}>
                  {s.percentage === null ? '—' : `${s.percentage}%`}
                </span>
              </td>
              <td className="px-4 py-3">
                <Badge status={s.status} />
              </td>
            </tr>
          ))}
        </ReportTable>
      )}
    </div>
  )
}

function StudentReport({ data }: { data: unknown }) {
  const r = data as {
    student: { fullName: string; regNumber: string | null }
    period: { academicYear: string; semester: number }
    units: StudentRow[]
  }

  const activeUnits = r.units.filter((u) => u.sessionsHeld > 0)
  const atRisk = activeUnits.filter((u) => u.status === 'warning' || u.status === 'not_eligible').length
  const avgPct =
    activeUnits.length > 0
      ? activeUnits.reduce((sum, u) => sum + (u.percentage ?? 0), 0) / activeUnits.length
      : null

  return (
    <div className="space-y-6 pb-2">
      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Units Enrolled" value={r.units.length} />
        <StatCard label="Units with Sessions" value={activeUnits.length} />
        <StatCard
          label="Overall Average"
          value={avgPct === null ? '—' : `${avgPct.toFixed(1)}%`}
          valueClass={pctClass(avgPct)}
        />
        <StatCard
          label="Units At Risk"
          value={atRisk}
          valueClass={atRisk > 0 ? 'text-danger' : 'text-success'}
        />
      </div>

      {activeUnits.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-text-secondary">
          No closed sessions yet this semester.
        </p>
      ) : (
        <ReportTable headers={['Course Unit', 'Attended / Sessions', '%', 'Status']}>
          {activeUnits.map((u) => (
            <tr key={u.courseUnit.id} className="hover:bg-surface-1">
              <td className="px-4 py-3 pl-5">
                <span className="text-body font-semibold text-text-primary">{u.courseUnit.name}</span>
                <span className="ml-2 text-body-sm text-text-secondary">{u.courseUnit.code}</span>
              </td>
              <td className="px-4 py-3 text-body text-text-secondary">
                {u.attended} / {u.sessionsHeld}
              </td>
              <td className="px-4 py-3">
                <span className={`text-lg font-bold ${pctClass(u.percentage)}`}>
                  {u.percentage === null ? '—' : `${u.percentage}%`}
                </span>
              </td>
              <td className="px-4 py-3">
                <Badge status={u.status} />
              </td>
            </tr>
          ))}
        </ReportTable>
      )}
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
