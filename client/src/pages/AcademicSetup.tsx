import { useCallback, useEffect, useState } from 'react'
import { academicApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { ApiClientError } from '../api/client'
import type { Faculty, Programme, CourseUnit, CurriculumUnitEntry } from '../types'

type Tab = 'faculties' | 'programmes' | 'course-units' | 'curriculum'

const TABS: { id: Tab; label: string }[] = [
  { id: 'faculties', label: 'Faculties' },
  { id: 'programmes', label: 'Programmes' },
  { id: 'course-units', label: 'Course Units' },
  { id: 'curriculum', label: 'Curriculum' },
]

export default function AcademicSetup() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('faculties')

  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [courseUnits, setCourseUnits] = useState<CourseUnit[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumUnitEntry[]>([])

  const loadAll = useCallback(async () => {
    try {
      const [f, p, u, cur] = await Promise.all([
        academicApi.faculties(),
        academicApi.programmes(),
        academicApi.courseUnits(),
        academicApi.curriculum(),
      ])
      setFaculties(f)
      setProgrammes(p)
      setCourseUnits(u)
      setCurriculum(cur)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not load academic structure — please refresh the page')
    }
  }, [toast])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  return (
    <div className="space-y-6">
      <Breadcrumb customLabel="Academic Structure" />
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Academic Structure</h1>
        <p className="text-body-sm text-text-secondary">
          Read-only view of the Moodle-synced academic hierarchy. Structure is managed via Moodle
          category sync — edit directly in Moodle.
        </p>
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
          <ReadOnlyTable
            headers={['Faculty', 'Code', 'Campus']}
            rows={faculties.map((f) => [f.name, f.code, f.campusName ?? '—'])}
            emptyMessage="No faculties synced yet. Run a Moodle sync to populate."
          />
        )}

        {tab === 'programmes' && (
          <ReadOnlyTable
            headers={['Programme', 'Code', 'Faculty']}
            rows={programmes.map((p) => [p.name, p.code, faculties.find((f) => f.id === p.facultyId)?.name ?? '—'])}
            emptyMessage="No programmes synced yet. Run a Moodle sync to populate."
          />
        )}

        {tab === 'course-units' && (
          <ReadOnlyTable
            headers={['Course Unit', 'Code', 'Owning Faculty']}
            rows={courseUnits.map((u) => [u.name, u.code, u.faculty?.name ?? faculties.find((f) => f.id === u.facultyId)?.name ?? '—'])}
            emptyMessage="No course units synced yet. Run a Moodle sync to populate."
          />
        )}

        {tab === 'curriculum' && (
          <CurriculumMatrix
            curriculum={curriculum}
            programmes={programmes}
          />
        )}
      </Card>
    </div>
  )
}

function ReadOnlyTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[]
  rows: string[][]
  emptyMessage: string
}) {
  if (rows.length === 0) {
    return <p className="py-12 text-center text-body-sm text-text-secondary">{emptyMessage}</p>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CurriculumMatrix({
  curriculum,
  programmes,
}: {
  curriculum: CurriculumUnitEntry[]
  programmes: Programme[]
}) {
  const byProgramme = new Map<string, CurriculumUnitEntry[]>()
  for (const p of programmes) byProgramme.set(p.id, [])
  for (const c of curriculum) {
    const list = byProgramme.get(c.programmeId)
    if (list) list.push(c)
  }

  if (programmes.length === 0) {
    return (
      <p className="py-12 text-center text-body-sm text-text-secondary">
        No programmes synced yet. Run a Moodle sync to populate.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {programmes.map((p) => {
        const rows = (byProgramme.get(p.id) ?? []).slice().sort(
          (a, b) => a.year - b.year || a.semester - b.semester || a.courseUnit.code.localeCompare(b.courseUnit.code)
        )
        return (
          <div key={p.id} className="rounded-lg border border-border">
            <div className="border-b border-border bg-surface-1 px-4 py-3">
              <p className="font-semibold text-text-primary">{p.name}</p>
              <p className="text-xs text-text-secondary">{p.code} · {rows.length} unit{rows.length === 1 ? '' : 's'}</p>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-body-sm text-text-secondary">
                No units mapped yet for this programme.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                      <th className="px-4 py-2">Year</th>
                      <th className="px-4 py-2">Sem</th>
                      <th className="px-4 py-2">Course Unit</th>
                      <th className="px-4 py-2">Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5 text-text-secondary">Year {c.year}</td>
                        <td className="px-4 py-2.5 text-text-secondary">Sem {c.semester}</td>
                        <td className="px-4 py-2.5 font-medium text-text-primary">{c.courseUnit.name}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{c.courseUnit.code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
