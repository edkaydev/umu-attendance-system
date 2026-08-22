import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react'
import { academicApi } from '../api/endpoints'
import { usePeriod } from '../hooks/usePeriod'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { ApiClientError } from '../api/client'
import type { Campus, Faculty, Programme, CourseUnit, CurriculumUnitEntry } from '../types'

type Tab = 'faculties' | 'programmes' | 'course-units' | 'curriculum'

const TABS: { id: Tab; label: string }[] = [
  { id: 'faculties', label: 'Faculties' },
  { id: 'programmes', label: 'Programmes' },
  { id: 'course-units', label: 'Course Units' },
  { id: 'curriculum', label: 'Curriculum' },
]

function FormModal({
  open,
  title,
  onClose,
  onSave,
  saving,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  onSave: () => void
  saving: boolean
  children: ReactNode
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          onSave()
        }}
      >
        {children}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function AcademicSetup() {
  const toast = useToast()
  const { period: globalPeriod } = usePeriod()
  const [tab, setTab] = useState<Tab>('faculties')

  const [campuses, setCampuses] = useState<Campus[]>([])
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [courseUnits, setCourseUnits] = useState<CourseUnit[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumUnitEntry[]>([])

  const [modal, setModal] = useState<string | null>(null) // entity kind being edited
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [campusCode, setCampusCode] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const [courseUnitId, setCourseUnitId] = useState('')
  const [sharedFacultyIds, setSharedFacultyIds] = useState<string[]>([])
  const [originalSharedFacultyIds, setOriginalSharedFacultyIds] = useState<string[]>([])
  const [year, setYear] = useState('1')
  const [semester, setSemester] = useState('1')

  const loadAll = useCallback(async () => {
    try {
      const [c, f, p, u, cur] = await Promise.all([
        academicApi.campuses(),
        academicApi.faculties(),
        academicApi.programmes(),
        academicApi.courseUnits(),
        academicApi.curriculum(),
      ])
      setCampuses(c)
      setFaculties(f)
      setProgrammes(p)
      setCourseUnits(u)
      setCurriculum(cur)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not load university setup — please refresh the page')
    }
  }, [toast])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  function openCreate(kind: string) {
    setModal(kind)
    setEditingId(null)
    setName('')
    setCode('')
    setCampusCode('')
    setFacultyId('')
    setProgrammeId('')
    setCourseUnitId('')
    setSharedFacultyIds([])
    setOriginalSharedFacultyIds([])
    setYear('1')
    setSemester('1')
  }

  function openEdit(kind: string, item: { id: string } & Partial<Campus & Faculty & Programme & CourseUnit>) {
    setModal(kind)
    setEditingId(item.id)
    setName(item.name ?? '')
    setCode(item.code ?? '')
    setCampusCode(item.campusCode ?? '')
    setFacultyId(item.facultyId ?? '')
    const shared = (item.sharedFaculties ?? []).map((sf) => sf.facultyId)
    setSharedFacultyIds(shared)
    setOriginalSharedFacultyIds(shared)
  }

  async function handleSave() {
    if (!modal) return
    setSaving(true)
    try {
      if (modal === 'faculties') {
        const data = { campusCode, name: name.trim(), code: code.trim() }
        if (editingId) await academicApi.updateFaculty(editingId, data)
        else await academicApi.createFaculty(data)
      } else if (modal === 'programmes') {
        const data = { facultyId, name: name.trim(), code: code.trim() }
        if (editingId) await academicApi.updateProgramme(editingId, data)
        else await academicApi.createProgramme(data)
      } else if (modal === 'course-units') {
        const data = { facultyId, name: name.trim(), code: code.trim() }
        let savedUnit: CourseUnit
        if (editingId) {
          savedUnit = await academicApi.updateCourseUnit(editingId, data)
        } else {
          savedUnit = await academicApi.createCourseUnit(data)
        }
        // Sync shared faculties: add new ones, remove removed ones
        const unitId = savedUnit.id
        const toAdd = sharedFacultyIds.filter((id) => !originalSharedFacultyIds.includes(id))
        const toRemove = originalSharedFacultyIds.filter((id) => !sharedFacultyIds.includes(id))
        await Promise.all([
          ...toAdd.map((fid) => academicApi.shareCourseUnit(unitId, fid)),
          ...toRemove.map((fid) => academicApi.unshareCourseUnit(unitId, fid)),
        ])
      } else if (modal === 'curriculum') {
        await academicApi.createCurriculum({
          courseUnitId,
          programmeId,
          year: Number(year),
          semester: Number(semester),
        })
      }
      toast.success('Saved')
      setModal(null)
      void loadAll()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function removeCurriculum(id: string) {
    try {
      await academicApi.removeCurriculum(id)
      toast.success('Curriculum mapping removed')
      void loadAll()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to remove')
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb customLabel="Academic Setup" />
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h2 font-bold text-text-primary">Academic Setup</h1>
          <p className="text-body-sm text-text-secondary">Manage the academic structure of the university.</p>
        </div>
        <Button onClick={() => openCreate(tab === 'curriculum' ? 'curriculum' : tab)}>
          Add {tab === 'course-units' ? 'Course Unit' : tab === 'curriculum' ? 'Mapping' : tab.slice(0, -1)}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`min-h-[44px] rounded px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-umu-red text-white' : 'bg-surface-1 text-text-secondary hover:bg-surface-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {tab === 'faculties' && (
          <EntityTable
            headers={['Faculty', 'Code', 'Campus']}
            rows={faculties.map((f) => [f.name, f.code, f.campusName ?? '—'])}
            onEdit={(i) => openEdit('faculties', faculties[i])}
          />
        )}

        {tab === 'programmes' && (
          <EntityTable
            headers={['Programme', 'Code', 'Faculty']}
            rows={programmes.map((p) => [p.name, p.code, faculties.find((f) => f.id === p.facultyId)?.name ?? '—'])}
            onEdit={(i) => openEdit('programmes', programmes[i])}
          />
        )}

        {tab === 'course-units' && (
          <div>
            {courseUnits.length === 0 ? (
              <p className="py-12 text-center text-body-sm text-text-secondary">Nothing here yet. Add your first entry.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                      <th className="py-2 pr-4">Course Unit</th>
                      <th className="py-2 pr-4">Code</th>
                      <th className="py-2 pr-4">Owning Faculty</th>
                      <th className="py-2 pr-4">Also Shared With</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {courseUnits.map((u, i) => {
                      const shared = u.sharedFaculties ?? []
                      return (
                        <tr key={u.id}>
                          <td className="py-3 pr-4 font-medium text-text-primary">{u.name}</td>
                          <td className="py-3 pr-4 text-text-secondary">{u.code}</td>
                          <td className="py-3 pr-4 text-text-secondary">
                            {u.faculty?.name ?? faculties.find((f) => f.id === u.facultyId)?.name ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-text-secondary">
                            {shared.length === 0
                              ? <span className="text-text-disabled">—</span>
                              : shared.map((sf) => sf.faculty.name).join(', ')}
                          </td>
                          <td className="py-3 text-right">
                            <button onClick={() => openEdit('course-units', courseUnits[i])} className="text-sm font-medium text-umu-red hover:underline">
                              Edit
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'curriculum' && (
          <>
            {curriculum.length === 0 ? (
              <p className="py-12 text-center text-body-sm text-text-secondary">
                No curriculum mappings. Add one to link a course unit to a programme.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                      <th className="py-2 pr-4">Course Unit</th>
                      <th className="py-2 pr-4">Programme</th>
                      <th className="py-2 pr-4">Year</th>
                      <th className="py-2 pr-4">Semester</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {curriculum.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 pr-4">
                          <span className="font-medium text-text-primary">{c.courseUnit.name}</span>{' '}
                          <span className="text-text-secondary">({c.courseUnit.code})</span>
                        </td>
                        <td className="py-3 pr-4 text-text-secondary">{c.programme.name}</td>
                        <td className="py-3 pr-4 text-text-secondary">Year {c.year}</td>
                        <td className="py-3 pr-4 text-text-secondary">Sem {c.semester}</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => removeCurriculum(c.id)}
                            className="text-sm font-medium text-danger hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      <FormModal
        open={Boolean(modal)}
        title={
          modal === 'curriculum'
            ? 'Add curriculum mapping'
            : `${editingId ? 'Edit' : 'Add'} ${(modal ?? '').slice(0, -1)}`
        }
        onClose={() => setModal(null)}
        onSave={handleSave}
        saving={saving}
      >
        {modal === 'faculties' && (
          <>
            <Select label="Campus" value={campusCode} onChange={(e) => setCampusCode(e.target.value)} options={campuses.map((c) => ({ value: c.code, label: c.name }))} />
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Faculty of Science" />
            <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. FOS" />
          </>
        )}
        {modal === 'programmes' && (
          <>
            <Select label="Faculty" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} />
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bachelor of Science in Computer Science" />
            <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BSCS" />
          </>
        )}
        {modal === 'course-units' && (
          <>
            <Select label="Owning Faculty" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} />
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data Structures and Algorithms" />
            <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CS2105" />
            {faculties.filter((f) => f.id !== facultyId).length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 block text-xs font-medium text-text-secondary">Also share with (optional)</p>
                <div className="space-y-2">
                  {faculties
                    .filter((f) => f.id !== facultyId)
                    .map((f) => (
                      <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={sharedFacultyIds.includes(f.id)}
                          onChange={(e) =>
                            setSharedFacultyIds((prev) =>
                              e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id)
                            )
                          }
                          className="h-4 w-4 rounded border-border accent-umu-red"
                        />
                        {f.name}
                      </label>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
        {modal === 'curriculum' && (
          <>
            {globalPeriod && (
              <div className="mb-3 rounded border border-border bg-surface-1 px-4 py-2 text-body-sm text-text-secondary">
                Global period: <span className="font-semibold text-text-primary">{globalPeriod.academicYear} · Semester {globalPeriod.semester}</span>
                <span className="ml-1 text-text-disabled">(pre-filled below; you can change these)</span>
              </div>
            )}
            <Select label="Course Unit" value={courseUnitId} onChange={(e) => setCourseUnitId(e.target.value)} options={courseUnits.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))} />
            <Select label="Programme" value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} options={programmes.map((p) => ({ value: p.id, label: p.name }))} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label="Year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                options={[1, 2, 3, 4, 5, 6].map((y) => ({ value: String(y), label: `Year ${y}` }))}
              />
              <Select
                label="Semester"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                options={[
                  { value: '1', label: 'Sem 1' },
                  { value: '2', label: 'Sem 2' },
                ]}
              />
            </div>
          </>
        )}
      </FormModal>
    </div>
  )
}

function EntityTable({
  headers,
  rows,
  onEdit,
}: {
  headers: string[]
  rows: string[][]
  onEdit: (index: number) => void
}) {
  if (rows.length === 0) {
    return <p className="py-12 text-center text-body-sm text-text-secondary">Nothing here yet. Add your first entry.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-4">
                {h}
              </th>
            ))}
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={`py-3 pr-4 ${j === 0 ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                  {cell}
                </td>
              ))}
              <td className="py-3 text-right">
                <button onClick={() => onEdit(i)} className="text-sm font-medium text-umu-red hover:underline">
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
