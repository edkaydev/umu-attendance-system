import { useEffect, useMemo, useState } from 'react'
import {
  reportApi,
  dashboardApi,
  assignmentApi,
  attendanceApi,
} from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { ApiClientError } from '../api/client'
import type { UnitStatus } from '../types'

type ReportType = 'programme' | 'course-unit' | 'lecturer' | 'student'

const REPORT_TABS: { type: ReportType; label: string }[] = [
  { type: 'programme', label: 'Programme' },
  { type: 'course-unit', label: 'Course Unit' },
  { type: 'lecturer', label: 'Lecturer' },
  { type: 'student', label: 'Student' },
]

function academicYearOptions(): { value: string; label: string }[] {
  const now = new Date()
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return [startYear - 1, startYear].map((y) => ({ value: `${y}/${y + 1}`, label: `${y}/${y + 1}` }))
}

interface StudentRow {
  student: { id: string; regNumber: string | null; fullName: string }
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

const REPORT_METHOD: Record<ReportType, string> = {
  programme: 'programme',
  'course-unit': 'courseUnit',
  lecturer: 'lecturer',
  student: 'student',
}

export default function ReportsPage() {
  const toast = useToast()

  const [tab, setTab] = useState<ReportType>('programme')
  const [academicYear, setAcademicYear] = useState(academicYearOptions()[0].value)
  const [semester, setSemester] = useState('1')

  const [programmes, setProgrammes] = useState<Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>['programmeSummary']>([])
  const [lecturers, setLecturers] = useState<Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>['lecturerSummary']>([])
  const [courseUnits, setCourseUnits] = useState<{ id: string; code: string; name: string }[]>([])
  const [unitStudents, setUnitStudents] = useState<UnitStudent[]>([])

  const [programmeId, setProgrammeId] = useState('')
  const [courseUnitId, setCourseUnitId] = useState('')
  const [lecturerId, setLecturerId] = useState('')
  const [studentId, setStudentId] = useState('')

  const [result, setResult] = useState<unknown | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    dashboardApi
      .facultyAdmin()
      .then((d) => {
        setProgrammes(d.programmeSummary)
        setLecturers(d.lecturerSummary)
      })
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load options'))
    assignmentApi
      .list()
      .then((assignments) => {
        const seen = new Map<string, { id: string; code: string; name: string }>()
        for (const a of assignments) seen.set(a.courseUnit.id, a.courseUnit)
        setCourseUnits([...seen.values()])
      })
      .catch(() => {})
  }, [toast])

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

  const period = useMemo(() => ({ academicYear, semester: Number(semester) }), [academicYear, semester])

  async function generate() {
    let id: string | null = null
    switch (tab) {
      case 'programme':
        id = programmeId
        break
      case 'course-unit':
        id = courseUnitId
        break
      case 'lecturer':
        id = lecturerId
        break
      case 'student':
        id = studentId
        break
    }
    if (!id) {
      toast.error('Select an item first')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const fn = (reportApi as unknown as Record<string, (id: string, p: { academicYear: string; semester: number }) => Promise<unknown>>)[REPORT_METHOD[tab]]
      setResult(await fn(id, period))
      toast.success('Report generated')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Reports</h1>
        <p className="text-body-sm text-text-secondary">Generate attendance reports for your faculty.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REPORT_TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => {
              setTab(t.type)
              setResult(null)
            }}
            className={`min-h-[40px] rounded px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.type ? 'bg-umu-red text-white' : 'bg-surface-1 text-text-secondary hover:bg-surface-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-2">
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
                placeholder={unitStudents.length ? 'Select student' : 'No enrolled students found'}
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                options={unitStudents.map((s) => ({
                  value: s.student.id,
                  label: `${s.student.fullName} (${s.student.regNumber ?? '—'})`,
                }))}
              />
            </>
          )}
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button loading={loading} onClick={generate}>
            Generate Report
          </Button>
          {(tab === 'programme' && programmeId) ||
          (tab === 'course-unit' && courseUnitId) ||
          (tab === 'lecturer' && lecturerId) ||
          (tab === 'student' && studentId) ? (
            <a
              href={reportApi.pdfUrl(tab, (tab === 'programme' ? programmeId : tab === 'course-unit' ? courseUnitId : tab === 'lecturer' ? lecturerId : studentId), period)}
              className="inline-flex min-h-[44px] items-center rounded border-[1.5px] border-umu-red px-6 py-3 text-sm font-semibold text-umu-red hover:bg-[#FFF4F4]"
            >
              Download PDF
            </a>
          ) : null}
        </div>
      </Card>

      {result !== null && (
        <Card title="Report Preview">
          <ReportView type={tab} data={result} />
        </Card>
      )}
    </div>
  )
}

function ReportView({ type, data }: { type: ReportType; data: unknown }) {
  if (type === 'programme') {
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
        <p className="text-body-sm text-text-secondary">
          {r.programme.name} ({r.programme.code}) · {r.period.academicYear} · Semester {r.period.semester}
        </p>
        <div className="flex flex-wrap gap-3">
          <InfoPill label="Enrolled" value={r.enrolledStudents} />
          <InfoPill label="Average" value={r.avgAttendance === null ? '—' : `${r.avgAttendance}%`} />
          <InfoPill label="Units below 75%" value={r.unitsBelowThreshold} />
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-text-secondary">
              <th className="py-2 pr-4">Unit</th>
              <th className="py-2 pr-4">Year</th>
              <th className="py-2 pr-4">Sessions</th>
              <th className="py-2 pr-4">Avg</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.units.map((u) => (
              <tr key={u.courseUnit.id}>
                <td className="py-2 pr-4">
                  <span className="font-medium text-text-primary">{u.courseUnit.name}</span>{' '}
                  <span className="text-text-secondary">({u.courseUnit.code})</span>
                </td>
                <td className="py-2 pr-4 text-text-secondary">Year {u.year}</td>
                <td className="py-2 pr-4 text-text-secondary">{u.sessionsHeld}</td>
                <td className="py-2 pr-4 text-text-secondary">{u.avgAttendance === null ? '—' : `${u.avgAttendance}%`}</td>
                <td className="py-2">{u.belowThreshold ? <Badge status="critical" /> : <Badge status="good" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (type === 'lecturer') {
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
        <p className="text-body-sm text-text-secondary">
          {r.lecturer.fullName} · {r.lecturer.email}
        </p>
        <InfoPill label="Total sessions" value={r.totalSessions} />
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-text-secondary">
              <th className="py-2 pr-4">Unit</th>
              <th className="py-2 pr-4">Sessions Held</th>
              <th className="py-2">Average Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.units.map((u) => (
              <tr key={u.courseUnit.id}>
                <td className="py-2 pr-4">
                  <span className="font-medium text-text-primary">{u.courseUnit.name}</span>{' '}
                  <span className="text-text-secondary">({u.courseUnit.code})</span>
                </td>
                <td className="py-2 pr-4 text-text-secondary">{u.sessionsHeld}</td>
                <td className="py-2 text-text-secondary">{u.avgAttendance === null ? '—' : `${u.avgAttendance}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (type === 'course-unit') {
    const r = data as {
      courseUnit: { code: string; name: string }
      sessionsHeld: number
      enrolledStudents: number
      avgAttendance: number | null
      students: StudentRow[]
    }
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <InfoPill label="Sessions held" value={r.sessionsHeld} />
          <InfoPill label="Enrolled" value={r.enrolledStudents} />
          <InfoPill label="Average" value={r.avgAttendance === null ? '—' : `${r.avgAttendance}%`} />
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-text-secondary">
              <th className="py-2 pr-4">Student</th>
              <th className="py-2 pr-4">Reg Number</th>
              <th className="py-2 pr-4">Sessions</th>
              <th className="py-2 pr-4">Attended</th>
              <th className="py-2 pr-4">%</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.students.map((s) => (
              <tr key={s.student.id}>
                <td className="py-2 pr-4 font-medium text-text-primary">{s.student.fullName}</td>
                <td className="py-2 pr-4 text-text-secondary">{s.student.regNumber ?? '—'}</td>
                <td className="py-2 pr-4 text-text-secondary">{s.sessionsHeld}</td>
                <td className="py-2 pr-4 text-text-secondary">{s.attended}</td>
                <td className="py-2 pr-4 text-text-secondary">{s.percentage}%</td>
                <td className="py-2">
                  <Badge status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const r = data as {
    student: { fullName: string; regNumber: string | null }
    period: { academicYear: string; semester: number }
    units: StudentRow[]
  }
  return (
    <div className="space-y-4">
      <p className="text-body-sm text-text-secondary">
        {r.student.fullName} · {r.student.regNumber ?? '—'} · {r.period.academicYear} · Semester {r.period.semester}
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-text-secondary">
            <th className="py-2 pr-4">Unit</th>
            <th className="py-2 pr-4">Sessions</th>
            <th className="py-2 pr-4">Attended</th>
            <th className="py-2 pr-4">%</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {r.units.map((u) => (
            <tr key={u.student.id}>
              <td className="py-2 pr-4">
                <span className="font-medium text-text-primary">{u.student.fullName}</span>{' '}
                <span className="text-text-secondary">({u.student.regNumber ?? ''})</span>
              </td>
              <td className="py-2 pr-4 text-text-secondary">{u.sessionsHeld}</td>
              <td className="py-2 pr-4 text-text-secondary">{u.attended}</td>
              <td className="py-2 pr-4 text-text-secondary">{u.percentage}%</td>
              <td className="py-2">
                <Badge status={u.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border bg-surface-1 px-4 py-2">
      <span className="text-sm font-semibold text-text-primary">{value}</span>{' '}
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  )
}
