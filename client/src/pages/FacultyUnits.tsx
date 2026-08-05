import { useEffect, useMemo, useState } from 'react'
import { enrollmentApi, assignmentApi, FacultyUnitOverview } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { ApiClientError } from '../api/client'

function academicYearOptions(): { value: string; label: string }[] {
  const now = new Date()
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return [startYear - 1, startYear, startYear + 1].map((y) => ({
    value: `${y}/${y + 1}`,
    label: `${y}/${y + 1}`,
  }))
}

const SEMESTER_OPTIONS = [
  { value: '1', label: 'Semester 1' },
  { value: '2', label: 'Semester 2' },
]

type ManageUser =
  | FacultyUnitOverview['students'][number]
  | FacultyUnitOverview['lecturers'][number]

function isStudent(u: ManageUser): u is FacultyUnitOverview['students'][number] {
  return 'regNumber' in u
}

export default function FacultyUnits() {
  const toast = useToast()

  const [data, setData] = useState<FacultyUnitOverview | null>(null)
  const [tab, setTab] = useState<'students' | 'lecturers'>('students')
  const [target, setTarget] = useState<ManageUser | null>(null)

  async function reload() {
    try {
      setData(await enrollmentApi.overview())
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load units')
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const list = data ? (tab === 'students' ? data.students : data.lecturers) : []

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Course Units</h1>
        <p className="mt-1 text-body text-text-secondary">
          Manage the units assigned to students and lecturers in your faculty.
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2">
        {(['students', 'lecturers'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`min-h-[40px] rounded px-4 text-body font-semibold transition-colors ${
              tab === t ? 'bg-umu-red text-white' : 'bg-surface-1 text-text-secondary hover:bg-surface-2'
            }`}
          >
            {t === 'students' ? 'Students' : 'Lecturers'}
          </button>
        ))}
      </div>

      {/* ── User list ── */}
      <Card noPadding>
        {!data ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">Loading…</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">
            No {tab} in this faculty yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    {tab === 'students' ? 'Student' : 'Lecturer'}
                  </th>
                  {tab === 'students' && (
                    <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                      Programme
                    </th>
                  )}
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Units
                  </th>
                  <th className="px-4 py-3 text-right text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((u) => {
                  const count = isStudent(u) ? u.enrollments.length : u.lecturerAssignments.length
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-surface-1">
                      <td className="px-5 py-3">
                        <p className="text-body font-medium text-text-primary">{u.fullName}</p>
                        <p className="text-body-sm text-text-secondary">{u.email}</p>
                        {isStudent(u) && u.regNumber && (
                          <p className="text-body-sm text-text-disabled">{u.regNumber}</p>
                        )}
                      </td>
                      {isStudent(u) && (
                        <td className="px-4 py-3 text-body text-text-secondary">
                          {u.programme ? u.programme.name : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-body text-text-secondary">{count}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            variant="secondary"
                            className="min-h-[32px] px-3 py-1 text-body-sm"
                            onClick={() => setTarget(u)}
                          >
                            Manage Units
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {target && (
        <ManageUnitsModal
          user={target}
          courseUnits={data?.courseUnits ?? []}
          onClose={() => setTarget(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}

function ManageUnitsModal({
  user,
  courseUnits,
  onClose,
  onChanged,
}: {
  user: ManageUser
  courseUnits: FacultyUnitOverview['courseUnits']
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [courseUnitId, setCourseUnitId] = useState('')
  const [academicYear, setAcademicYear] = useState(academicYearOptions()[1].value)
  const [semester, setSemester] = useState('1')

  const student = isStudent(user)
  const current = student ? user.enrollments : user.lecturerAssignments

  const available = useMemo(() => {
    const taken = new Set(current.map((c) => c.courseUnitId))
    return courseUnits.filter((cu) => !taken.has(cu.id))
  }, [courseUnits, current])

  async function handleAdd() {
    if (!courseUnitId) return toast.error('Select a course unit')
    setBusy(true)
    try {
      if (student) {
        await enrollmentApi.create({
          studentId: user.id,
          courseUnitId,
          academicYear,
          semester: Number(semester),
        })
      } else {
        await assignmentApi.create({
          lecturerId: user.id,
          courseUnitId,
          academicYear,
          semester: Number(semester),
        })
      }
      toast.success('Unit added')
      setCourseUnitId('')
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to add unit')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(recordId: string, unitName: string) {
    setBusy(true)
    try {
      if (student) await enrollmentApi.remove(recordId)
      else await assignmentApi.remove(recordId)
      toast.success(`${unitName} removed`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to remove unit')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Units — ${user.fullName}`}>
      <div className="space-y-4">
        <p className="text-body text-text-secondary">
          {student
            ? `${user.programme?.name ?? 'Student'} · ${user.regNumber ?? ''}`.trim()
            : 'Lecturer'}
        </p>

        {/* Current units */}
        <div>
          <p className="mb-2 text-label font-semibold uppercase tracking-wide text-text-secondary">
            Current units ({current.length})
          </p>
          {current.length === 0 ? (
            <p className="text-body-sm text-text-disabled">No units assigned yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {current.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-text-primary">
                      {c.courseUnit.name}
                    </p>
                    <p className="text-body-sm text-text-secondary">
                      {c.courseUnit.code} &middot; {c.academicYear} &middot; Semester {c.semester}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    className="min-h-[28px] shrink-0 px-2.5 py-1 text-body-sm"
                    disabled={busy}
                    onClick={() => handleRemove(c.id, c.courseUnit.name)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add unit */}
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-label font-semibold uppercase tracking-wide text-text-secondary">
            Add unit
          </p>
          <div className="space-y-3">
            <Select
              label="Course Unit"
              placeholder={available.length === 0 ? 'No more units available' : 'Select a unit'}
              value={courseUnitId}
              onChange={(e) => setCourseUnitId(e.target.value)}
              options={available.map((cu) => ({ value: cu.id, label: `${cu.code} — ${cu.name}` }))}
            />
            <div className="grid grid-cols-2 gap-3">
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
                options={SEMESTER_OPTIONS}
              />
            </div>
            <Button
              fullWidth
              loading={busy}
              disabled={!courseUnitId}
              onClick={handleAdd}
              className="!min-h-[40px]"
            >
              Add Unit
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
