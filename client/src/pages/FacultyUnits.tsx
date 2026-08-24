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
import type { CurriculumUnitEntry, Programme } from '../types'

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
  const [tab, setTab] = useState<'students' | 'lecturers' | 'pathways'>('students')
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
            {([
              ['students', 'Students'],
              ['lecturers', 'Lecturers'],
              ['pathways', 'Pathways'],
            ] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`min-h-[44px] rounded px-4 text-body font-semibold transition-colors ${
                  tab === t ? 'bg-umu-red text-white' : 'bg-surface-1 text-text-secondary hover:bg-surface-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab !== 'pathways' && (
            <Input
              label="Search"
              placeholder={`Search ${tab} by name, email${tab === 'students' ? ' or reg number' : ''}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-0 md:w-80"
            />
          )}
        </div>
      </Card>

      {tab === 'pathways' ? (
        loaded && data ? (
          <PathwaysTab overview={data} onChanged={reload} />
        ) : (
          <Card noPadding>
            <p className="px-5 py-12 text-center text-body text-text-secondary">Loading…</p>
          </Card>
        )
      ) : (
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
      )}
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

/* ─────────────────────────── Pathways tab ─────────────────────────── */

const PATHWAY_YEARS = [1, 2, 3, 4, 5, 6]

type PathwayAdd =
  | { kind: 'add'; programmeId: string; programmeName: string; year: number; semester: number; unitId: string; unitName: string }
  | { kind: 'remove'; entryId: string; unitName: string; programmeName: string }

/**
 * Curriculum pathway tables — Programme → Year → Semester sections, like the
 * faculty curriculum matrix. Each section is editable by the Faculty Admin:
 * add a unit to the path or remove it. The Students column shows how many
 * students in this faculty are enrolled in the unit for the current period.
 */
function PathwaysTab({ overview, onChanged }: { overview: FacultyUnitOverview; onChanged: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const { period } = usePeriod()
  const [curriculum, setCurriculum] = useState<CurriculumUnitEntry[] | null>(null)
  const [programmes, setProgrammes] = useState<Programme[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PathwayAdd | null>(null)
  /** Per-section selected unit for the inline "add to path" row, keyed by programmeId:year:semester */
  const [addPick, setAddPick] = useState<Record<string, string>>({})
  /** Year/semester chosen in each programme's add-row, keyed by programmeId */
  const [addYear, setAddYear] = useState<Record<string, number>>({})
  const [addSemester, setAddSemester] = useState<Record<string, number>>({})

  useEffect(() => {
    Promise.all([academicApi.curriculum(), academicApi.programmes()])
      .then(([c, p]) => {
        setCurriculum(c)
        setProgrammes(p)
      })
      .catch(() => toast.error('Failed to load the curriculum'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const facultyId = user?.facultyId ?? null

  // Only programmes that belong to this admin's faculty
  const myProgrammes = useMemo(
    () => (programmes ?? []).filter((p) => p.facultyId === facultyId).sort((a, b) => a.name.localeCompare(b.name)),
    [programmes, facultyId]
  )

  // Curriculum entries grouped by programmeId
  const entriesByProgramme = useMemo(() => {
    const map = new Map<string, CurriculumUnitEntry[]>()
    for (const e of curriculum ?? []) {
      const list = map.get(e.programmeId) ?? []
      list.push(e)
      map.set(e.programmeId, list)
    }
    return map
  }, [curriculum])

  // Enrolled-student counts per course unit for the current period
  const enrolledCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (!period) return counts
    for (const s of overview.students) {
      for (const e of s.enrollments) {
        if (e.academicYear === period.academicYear && e.semester === period.semester) {
          counts.set(e.courseUnitId, (counts.get(e.courseUnitId) ?? 0) + 1)
        }
      }
    }
    return counts
  }, [overview, period])

  async function reloadCurriculum() {
    try {
      setCurriculum(await academicApi.curriculum())
    } catch {
      toast.error('Failed to refresh the curriculum')
    }
    onChanged() // also refresh enrollment counts
  }

  async function runPending() {
    if (!pending) return
    setBusy(true)
    try {
      if (pending.kind === 'add') {
        await academicApi.createCurriculum({
          courseUnitId: pending.unitId,
          programmeId: pending.programmeId,
          year: pending.year,
          semester: pending.semester,
        })
        toast.success(`${pending.unitName} added to ${pending.programmeName} · Year ${pending.year} Sem ${pending.semester}`)
      } else {
        await academicApi.removeCurriculum(pending.entryId)
        toast.success(`${pending.unitName} removed from ${pending.programmeName} path`)
      }
      setPending(null)
      await reloadCurriculum()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to update the pathway')
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  if (!curriculum || !programmes) {
    return (
      <Card noPadding>
        <p className="px-5 py-12 text-center text-body text-text-secondary">Loading curriculum…</p>
      </Card>
    )
  }

  if (myProgrammes.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-body-sm text-text-secondary">
          No programmes are linked to your faculty yet. Ask a System Admin to import them.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {period && (
        <div className="rounded border border-border bg-surface-1 px-4 py-2 text-body-sm text-text-secondary">
          Student counts for{' '}
          <span className="font-semibold text-text-primary">
            {period.academicYear} · Semester {period.semester}
          </span>{' '}
          (set by System Admin)
        </div>
      )}

      {myProgrammes.map((prog) => {
        const entries = entriesByProgramme.get(prog.id) ?? []
        // Sections in Excel order: year asc, semester asc
        const sections = new Map<string, CurriculumUnitEntry[]>()
        for (const e of entries) {
          const key = `${e.year}:${e.semester}`
          const list = sections.get(key) ?? []
          list.push(e)
          sections.set(key, list)
        }
        const sortedSections = [...sections.entries()].sort(
          ([aY, aS], [bY, bS]) => Number(aY) - Number(bY) || Number(aS) - Number(bS)
        )
        const mappedUnitIds = new Set(entries.map((e) => e.courseUnitId))
        const year = addYear[prog.id] ?? 1
        const semester = addSemester[prog.id] ?? 1
        const sectionKey = `${prog.id}:${year}:${semester}`
        const sectionUnitIds = new Set(
          entries.filter((e) => e.year === year && e.semester === semester).map((e) => e.courseUnitId)
        )
        const availableUnits = overview.courseUnits.filter((cu) => !sectionUnitIds.has(cu.id))
        const pickedUnitId = addPick[sectionKey] ?? ''

        return (
          <Card key={prog.id} noPadding>
            <div className="border-b border-border bg-surface-1 px-5 py-3">
              <h2 className="text-h4 font-semibold text-text-primary">{prog.name}</h2>
              <p className="text-body-sm text-text-secondary">{prog.code}</p>
            </div>

            {sortedSections.length === 0 ? (
              <p className="px-5 py-6 text-body-sm text-text-secondary">
                No units on this pathway yet — add the first one below.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-2 text-label font-semibold uppercase tracking-wide text-text-secondary">Code</th>
                      <th className="px-4 py-2 text-label font-semibold uppercase tracking-wide text-text-secondary">Course Name</th>
                      <th className="px-4 py-2 text-right text-label font-semibold uppercase tracking-wide text-text-secondary">Students</th>
                      <th className="px-4 py-2" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedSections.flatMap(([key, list]) => {
                      const [y, s] = key.split(':')
                      return [
                        <tr key={`${prog.id}-hdr-${key}`} className="bg-surface-1/60">
                          <td colSpan={4} className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                            Year {y} · Semester {s}
                          </td>
                        </tr>,
                        ...list
                          .slice()
                          .sort((a, b) => a.courseUnit.code.localeCompare(b.courseUnit.code))
                          .map((e) => (
                            <tr key={e.id} className="transition-colors hover:bg-surface-1">
                              <td className="whitespace-nowrap px-5 py-3 text-body font-medium text-text-primary">{e.courseUnit.code}</td>
                              <td className="px-4 py-3 text-body text-text-primary">{e.courseUnit.name}</td>
                              <td className="px-4 py-3 text-right text-body text-text-secondary">
                                {period ? (enrolledCounts.get(e.courseUnitId) ?? 0) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1 text-body-sm"
                                  disabled={busy}
                                  onClick={() =>
                                    setPending({ kind: 'remove', entryId: e.id, unitName: e.courseUnit.name, programmeName: prog.name })
                                  }
                                >
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          )),
                      ]
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add-to-path row */}
            <div className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-4">
              <Select
                label="Year"
                value={String(year)}
                onChange={(e) => setAddYear({ ...addYear, [prog.id]: Number(e.target.value) })}
                options={PATHWAY_YEARS.map((y) => ({ value: String(y), label: `Year ${y}` }))}
                className="mb-0 w-32"
              />
              <Select
                label="Semester"
                value={String(semester)}
                onChange={(e) => setAddSemester({ ...addSemester, [prog.id]: Number(e.target.value) })}
                options={[1, 2].map((s) => ({ value: String(s), label: `Semester ${s}` }))}
                className="mb-0 w-36"
              />
              <Select
                label="Course Unit"
                placeholder={availableUnits.length === 0 ? 'All faculty units are on this path' : 'Select a unit'}
                value={pickedUnitId}
                onChange={(e) => setAddPick({ ...addPick, [sectionKey]: e.target.value })}
                options={availableUnits.map((cu) => ({ value: cu.id, label: `${cu.code} — ${cu.name}` }))}
                className="mb-0 min-w-[240px] flex-1"
              />
              <Button
                disabled={!pickedUnitId || busy}
                onClick={() => {
                  const cu = availableUnits.find((x) => x.id === pickedUnitId)
                  if (cu) setPending({ kind: 'add', programmeId: prog.id, programmeName: prog.name, year, semester, unitId: cu.id, unitName: cu.name })
                }}
              >
                Add to Path
              </Button>
            </div>
            {mappedUnitIds.size > 0 && (
              <p className="px-5 pb-3 text-xs text-text-disabled">
                Units already on another Year/Semester of this path can be repeated there if your curriculum requires it.
              </p>
            )}
          </Card>
        )
      })}

      {/* Confirm modal */}
      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        closeOnOverlay={false}
        closeOnEscape={false}
        title={pending?.kind === 'remove' ? 'Remove from pathway?' : 'Add to pathway?'}
        description={
          pending?.kind === 'remove'
            ? `Remove ${pending.unitName} from the ${pending.programmeName} path.`
            : pending
              ? `Add ${pending.unitName} to ${pending.programmeName} · Year ${pending.year} · Semester ${pending.semester}?`
              : ''
        }
      >
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
          <Button
            variant={pending?.kind === 'remove' ? 'danger' : 'primary'}
            loading={busy}
            onClick={runPending}
          >
            {pending?.kind === 'remove' ? 'Remove' : 'Add'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

type PendingAction =
  | { kind: 'add'; unitId: string; unitName: string }
  | { kind: 'remove'; recordId: string; unitName: string }
