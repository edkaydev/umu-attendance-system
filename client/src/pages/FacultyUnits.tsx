import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { enrollmentApi, assignmentApi, academicApi, FacultyUnitOverview } from '../api/endpoints'
import { usePeriod } from '../hooks/usePeriod'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { ApiClientError } from '../api/client'

type ManageUser =
  | FacultyUnitOverview['students'][number]
  | FacultyUnitOverview['lecturers'][number]

type UnitEntry = {
  id: string
  courseUnitId: string
  academicYear: string
  semester: number
  courseUnit: { id: string; code: string; name: string }
}

function isStudent(u: ManageUser): u is FacultyUnitOverview['students'][number] {
  return 'regNumber' in u
}

/* ─────────────────────────── Add unit form ─────────────────────────── */

function AddCourseUnitCard({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user?.facultyId) {
    return (
      <Card title="Add a New Course Unit">
        <p className="text-body-sm text-text-secondary">
          Your account is not linked to a faculty yet, so you cannot create units.
          Ask a System Admin to assign your faculty first.
        </p>
      </Card>
    )
  }

  async function handleCreate() {
    const trimmedName = name.trim()
    const trimmedCode = code.trim().toUpperCase()
    if (!trimmedName || !trimmedCode) {
      toast.error('Enter both a unit name and a unit code')
      return
    }
    setBusy(true)
    try {
      await academicApi.createCourseUnit({
        facultyId: user!.facultyId!,
        name: trimmedName,
        code: trimmedCode,
      })
      toast.success(`Unit ${trimmedCode} created`)
      setName('')
      setCode('')
      onCreated()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to create unit')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add a New Course Unit">
      <p className="mb-3 text-body-sm text-text-secondary">
        Missing a unit from the import? Create it here — it goes straight into your faculty and
        becomes available in the Add-unit dropdowns.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Unit name"
          placeholder="e.g. Database Systems"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Unit code"
          placeholder="e.g. BCS2201"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className=""
        />
      </div>
      <div className="mt-3">
        <Button loading={busy} disabled={!name.trim() || !code.trim()} onClick={handleCreate}>
          Create Unit
        </Button>
      </div>
    </Card>
  )
}

function matchesQuery(u: ManageUser, q: string): boolean {
  if (!q) return true
  const haystack = [u.fullName, u.email, isStudent(u) ? u.regNumber ?? '' : '']
    .join(' ')
    .toLowerCase()
  return haystack.includes(q.toLowerCase())
}

/* ─────────────────────────── List page ─────────────────────────── */

export default function FacultyUnits() {
  const toast = useToast()
  const navigate = useNavigate()

  const [data, setData] = useState<FacultyUnitOverview | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<'students' | 'lecturers'>('students')
  const [search, setSearch] = useState('')

  async function reload() {
    try {
      setData(await enrollmentApi.overview())
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load units')
    } finally {
      setLoaded(true)
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
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Course Units</h1>
        <p className="mt-1 text-body text-text-secondary">
          Manage the units assigned to students and lecturers in your faculty.
        </p>
      </div>

      <AddCourseUnitCard onCreated={reload} />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {(['students', 'lecturers'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`min-h-[44px] rounded px-4 text-body font-semibold transition-colors ${
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

      <Card noPadding>
        {!loaded ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">Loading…</p>
        ) : !data ? (
          <div className="px-5 py-12 text-center text-body text-text-secondary">
            <p>Could not load units. Please refresh the page.</p>
            <button onClick={() => window.location.reload()} className="mt-3 min-h-[44px] rounded px-3 font-semibold text-umu-red hover:bg-[#FFF4F4]">Try again</button>
          </div>
        ) : list.length === 0 ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">
            {search ? 'No matching users.' : `No ${tab} in this faculty yet.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    {tab === 'students' ? 'Student' : 'Lecturer'}
                  </th>
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
                      <td className="px-4 py-3 text-body text-text-secondary">{count}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            variant="secondary"
                            className="px-3 py-1 text-body-sm"
                            onClick={() => navigate(`/faculty-admin/units/${u.id}`)}
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
    </div>
  )
}

/* ─────────────────────────── User edit page ─────────────────────────── */

export function FacultyUserUnits() {
  const toast = useToast()
  const { userId } = useParams<{ userId: string }>()
  const [data, setData] = useState<FacultyUnitOverview | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function reload() {
    try {
      setData(await enrollmentApi.overview())
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load units')
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const user = useMemo(() => {
    if (!data || !userId) return null
    return (
      data.students.find((s) => s.id === userId) ??
      data.lecturers.find((l) => l.id === userId) ??
      null
    )
  }, [data, userId])

  if (!loaded) {
    return <p className="py-12 text-center text-body text-text-secondary">Loading…</p>
  }

  if (!data) {
    return (
      <div className="py-12 text-center text-body text-text-secondary">
        <p>Could not load units. Please refresh the page.</p>
        <button onClick={() => window.location.reload()} className="mt-3 min-h-[44px] rounded px-3 font-semibold text-umu-red hover:bg-[#FFF4F4]">Try again</button>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-body text-text-secondary">User not found in your faculty.</p>
        <Link to="/faculty-admin/units" className="inline-flex min-h-[44px] items-center justify-center rounded border-[1.5px] border-umu-red bg-white px-6 py-3 text-sm font-semibold text-umu-red hover:bg-[#FFF4F4]">
          Back to Units
        </Link>
      </div>
    )
  }

  return (
    <UserUnitsEditor
      user={user}
      courseUnits={data.courseUnits}
      allLecturers={data.lecturers}
      onChanged={reload}
    />
  )
}

function UserUnitsEditor({
  user,
  courseUnits,
  allLecturers,
  onChanged,
}: {
  user: ManageUser
  courseUnits: FacultyUnitOverview['courseUnits']
  /** All lecturers in the faculty — used to detect units already taken by someone else */
  allLecturers: FacultyUnitOverview['lecturers']
  onChanged: () => void
}) {
  const toast = useToast()
  const { period: globalPeriod } = usePeriod()
  const [busy, setBusy] = useState(false)
  const [courseUnitId, setCourseUnitId] = useState('')
  const [unitSearch, setUnitSearch] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)

  const student = isStudent(user)
  const current: UnitEntry[] = student ? user.enrollments : user.lecturerAssignments

  const academicYear = globalPeriod?.academicYear ?? ''
  const semester = globalPeriod?.semester ?? 1

  // Units the current user already has in this period
  const takenByThisUser = useMemo(
    () =>
      new Set(
        current
          .filter((c) => c.academicYear === academicYear && c.semester === semester)
          .map((c) => c.courseUnitId)
      ),
    [current, academicYear, semester]
  )

  // For lecturers: units already claimed by a DIFFERENT lecturer for this period
  // (unit exclusivity — one lecturer per unit per period)
  const takenByOtherLecturer = useMemo(() => {
    if (student) return new Set<string>() // students share units freely
    const taken = new Set<string>()
    for (const l of allLecturers) {
      if (l.id === user.id) continue // skip self
      for (const a of l.lecturerAssignments) {
        if (a.academicYear === academicYear && a.semester === semester) {
          taken.add(a.courseUnitId)
        }
      }
    }
    return taken
  }, [student, allLecturers, user.id, academicYear, semester])

  const available = useMemo(
    () =>
      courseUnits.filter(
        (cu) => !takenByThisUser.has(cu.id) && !takenByOtherLecturer.has(cu.id)
      ),
    [courseUnits, takenByThisUser, takenByOtherLecturer]
  )

  const filteredAvailable = useMemo(() => {
    const q = unitSearch.trim().toLowerCase()
    if (!q) return available
    return available.filter(
      (cu) => cu.name.toLowerCase().includes(q) || cu.code.toLowerCase().includes(q)
    )
  }, [available, unitSearch])

  async function runAdd() {
    if (!pending || pending.kind !== 'add') return
    if (!globalPeriod) { toast.error('Academic year not set yet — please wait a moment and try again'); return }
    setBusy(true)
    try {
      if (student) {
        await enrollmentApi.create({
          studentId: user.id,
          courseUnitId: pending.unitId,
          academicYear,
          semester,
        })
      } else {
        await assignmentApi.create({
          lecturerId: user.id,
          courseUnitId: pending.unitId,
          academicYear,
          semester,
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
    <div className="space-y-6">
      <div>
        <Link to="/faculty-admin/units" className="text-body-sm font-medium text-umu-red hover:underline">
          ← Back to Units
        </Link>
        <h1 className="mt-2 text-h1 font-bold text-text-primary">{user.fullName}</h1>
        <p className="mt-1 text-body text-text-secondary">
          {user.email}
          {student && user.regNumber ? ` · ${user.regNumber}` : ''}
        </p>
      </div>

      {/* Period banner */}
      {globalPeriod && (
        <div className="rounded border border-border bg-surface-1 px-4 py-2 text-body-sm text-text-secondary">
          Period: <span className="font-semibold text-text-primary">{globalPeriod.academicYear} · Semester {globalPeriod.semester}</span>
          <span className="ml-1 text-text-disabled">(set by System Admin)</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Current units */}
        <Card title={`Current units (${current.length})`} className="lg:col-span-3">
          {current.length === 0 ? (
            <p className="text-body-sm text-text-disabled">No units assigned yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {current.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-text-primary">{c.courseUnit.name}</p>
                    <p className="text-body-sm text-text-secondary">
                      {c.courseUnit.code} &middot; {c.academicYear} &middot; Semester {c.semester}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="shrink-0 px-3 py-1 text-body-sm"
                    disabled={busy}
                    onClick={() => setPending({ kind: 'remove', recordId: c.id, unitName: c.courseUnit.name })}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Add unit */}
        <Card title="Add unit" className="lg:col-span-2">
          <div className="space-y-3">
            <Input
              label="Search units"
              placeholder="Search by code or name"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
            />
            <Select
              label="Course Unit"
              placeholder={
                filteredAvailable.length === 0
                  ? unitSearch ? 'No units match' : 'All units assigned for this period'
                  : 'Select a unit'
              }
              value={courseUnitId}
              onChange={(e) => setCourseUnitId(e.target.value)}
              options={filteredAvailable.map((cu) => ({ value: cu.id, label: `${cu.code} — ${cu.name}` }))}
            />
            <Button
              fullWidth
              disabled={!courseUnitId || !globalPeriod}
              className=""
              onClick={() => {
                const cu = available.find((x) => x.id === courseUnitId)
                if (cu) setPending({ kind: 'add', unitId: cu.id, unitName: cu.name })
              }}
            >
              Add Unit
            </Button>
          </div>
        </Card>
      </div>

      {/* Confirm modal */}
      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        closeOnOverlay={pending?.kind !== 'remove'}
        closeOnEscape={pending?.kind !== 'remove'}
        title={pending?.kind === 'remove' ? 'Remove this unit?' : 'Add this unit?'}
        description={
          pending?.kind === 'remove'
            ? `Remove ${pending.unitName} from ${user.fullName}.`
            : `Assign ${pendingUnit} to ${user.fullName} for ${academicYear}, semester ${semester}.`
        }
      >
        <div className="space-y-4">
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
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
    </div>
  )
}

type PendingAction =
  | { kind: 'add'; unitId: string; unitName: string }
  | { kind: 'remove'; recordId: string; unitName: string }
