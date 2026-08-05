import { useEffect, useMemo, useState } from 'react'
import { enrollmentApi, assignmentApi, FacultyUnitOverview } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
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

function matchesQuery(u: ManageUser, q: string): boolean {
  if (!q) return true
  const haystack = [u.fullName, u.email, isStudent(u) ? u.regNumber ?? '' : '']
    .join(' ')
    .toLowerCase()
  return haystack.includes(q.toLowerCase())
}

export default function FacultyUnits() {
  const toast = useToast()

  const [data, setData] = useState<FacultyUnitOverview | null>(null)
  const [tab, setTab] = useState<'students' | 'lecturers'>('students')
  const [search, setSearch] = useState('')
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

  const list = useMemo(() => {
    if (!data) return []
    const base = tab === 'students' ? data.students : data.lecturers
    return base.filter((u) => matchesQuery(u, search))
  }, [data, tab, search])

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Course Units</h1>
        <p className="mt-1 text-body text-text-secondary">
          Manage the units assigned to students and lecturers in your faculty.
        </p>
      </div>

      {/* ── Tabs + search ── */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
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
          <Input
            label="Search"
            placeholder={`Search ${tab} by name, email${tab === 'students' ? ' or reg number' : ''}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-0 md:w-80"
          />
        </div>
      </Card>

      {/* ── User list ── */}
      <Card noPadding>
        {!data ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">Loading…</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">
            {search ? 'No matching users.' : `No ${tab} in this faculty yet.`}
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

type PendingAction =
  | { kind: 'add'; unitId: string; unitName: string }
  | { kind: 'remove'; recordId: string; unitName: string }

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
  const [unitSearch, setUnitSearch] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)

  const student = isStudent(user)
  const current = student ? user.enrollments : user.lecturerAssignments

  // Only units the user already has in the SAME year + semester are hidden,
  // so the same unit can still be added for a different period.
  const available = useMemo(() => {
    const taken = new Set(
      current
        .filter((c) => c.academicYear === academicYear && c.semester === Number(semester))
        .map((c) => c.courseUnitId)
    )
    return courseUnits.filter((cu) => !taken.has(cu.id))
  }, [courseUnits, current, academicYear, semester])

  const filteredAvailable = useMemo(() => {
    const q = unitSearch.trim().toLowerCase()
    if (!q) return available
    return available.filter(
      (cu) => cu.name.toLowerCase().includes(q) || cu.code.toLowerCase().includes(q)
    )
  }, [available, unitSearch])

  async function runAdd() {
    if (!pending || pending.kind !== 'add') return
    setBusy(true)
    try {
      if (student) {
        await enrollmentApi.create({
          studentId: user.id,
          courseUnitId: pending.unitId,
          academicYear,
          semester: Number(semester),
        })
      } else {
        await assignmentApi.create({
          lecturerId: user.id,
          courseUnitId: pending.unitId,
          academicYear,
          semester: Number(semester),
        })
      }
      toast.success('Unit added')
      setCourseUnitId('')
      setUnitSearch('')
      setPending(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to add unit')
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  async function runRemove() {
    if (!pending || pending.kind !== 'remove') return
    setBusy(true)
    try {
      if (student) await enrollmentApi.remove(pending.recordId)
      else await assignmentApi.remove(pending.recordId)
      toast.success(`${pending.unitName} removed`)
      setPending(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to remove unit')
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const pendingUnit = pending?.kind === 'add' ? pending.unitName : ''

  return (
    <>
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
                      variant="secondary"
                      className="min-h-[28px] shrink-0 px-2.5 py-1 text-body-sm"
                      disabled={busy}
                      onClick={() =>
                        setPending({ kind: 'remove', recordId: c.id, unitName: c.courseUnit.name })
                      }
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
              <Input
                label="Search units"
                placeholder="Search by code or name"
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
                className="mb-0"
              />
              <Select
                label="Course Unit"
                placeholder={
                  filteredAvailable.length === 0
                    ? unitSearch
                      ? 'No units match your search'
                      : 'No more units for this period'
                    : 'Select a unit'
                }
                value={courseUnitId}
                onChange={(e) => setCourseUnitId(e.target.value)}
                options={filteredAvailable.map((cu) => ({
                  value: cu.id,
                  label: `${cu.code} — ${cu.name}`,
                }))}
              />
              {available.length === 0 && !unitSearch && (
                <p className="text-body-sm text-text-disabled">
                  All faculty units are already assigned for {academicYear} &middot; Semester{' '}
                  {semester}. Try another period.
                </p>
              )}
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
                disabled={!courseUnitId}
                className="!min-h-[40px]"
                onClick={() => {
                  const cu = available.find((x) => x.id === courseUnitId)
                  if (cu) setPending({ kind: 'add', unitId: cu.id, unitName: cu.name })
                }}
              >
                Add Unit
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm popup */}
      <Modal open={Boolean(pending)} onClose={() => setPending(null)}>
        <div className="space-y-4">
          <h2 className="text-h2 font-semibold">
            {pending?.kind === 'remove' ? 'Remove this unit?' : 'Add this unit?'}
          </h2>
          <p className="text-body text-text-secondary">
            {pending?.kind === 'remove' ? (
              <>
                Remove <span className="font-semibold text-text-primary">{pending?.unitName}</span>{' '}
                from {user.fullName}?
              </>
            ) : (
              <>
                Assign{' '}
                <span className="font-semibold text-text-primary">{pendingUnit || 'this unit'}</span>{' '}
                to {user.fullName} for {academicYear} &middot; Semester {semester}?
              </>
            )}
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending?.kind === 'remove' ? 'danger' : 'primary'}
              loading={busy}
              onClick={pending?.kind === 'remove' ? runRemove : runAdd}
            >
              {pending?.kind === 'remove' ? 'Remove' : 'Add Unit'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
