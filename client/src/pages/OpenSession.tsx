import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi, sessionApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { ApiClientError } from '../api/client'
import { SessionMode } from '../types'

type Assignment = Awaited<ReturnType<typeof dashboardApi.lecturer>>['units'][number]

const CLASS_DURATION_OPTIONS = [
  { value: '', label: 'No auto-close' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1 hour 30 min' },
  { value: '120', label: '2 hours' },
  { value: '150', label: '2 hours 30 min' },
  { value: '180', label: '3 hours (max)' },
]

const CODE_TTL_OPTIONS = [
  { value: '60', label: '60 minutes (max)' },
  { value: '45', label: '45 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '20', label: '20 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '5',  label: '5 minutes' },
]

export default function OpenSession() {
  const toast = useToast()
  const navigate = useNavigate()

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [mode, setMode] = useState<SessionMode>('physical')
  const [venue, setVenue] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [classDuration, setClassDuration] = useState('60')
  const [codeTtl, setCodeTtl] = useState('20')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    dashboardApi
      .lecturer()
      .then((d) => {
        setAssignments(d.units)
        if (d.units.length === 1) setSelectedId(d.units[0].courseUnit.id)
      })
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load your units'))
  }, [toast])

  const assignment = assignments.find((a) => a.courseUnit.id === selectedId) ?? null

  async function handleSubmit() {
    if (!assignment) {
      toast.error('Select a course unit')
      return
    }
    setSubmitting(true)
    try {
      const res = await sessionApi.open({
        courseUnitId: assignment.courseUnit.id,
        mode,
        venue: mode === 'physical' ? (venue.trim() || undefined) : undefined,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        academicYear: assignment.academicYear,
        semester: assignment.semester,
        classDuration: classDuration ? Number(classDuration) : undefined,
        codeTtl: Number(codeTtl),
      })
      toast.success('Session opened — code ' + res.session.code)
      navigate(`/lecturer/sessions/${res.session.id}/live`)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to open session')
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Open a Session</h1>
        <p className="text-body-sm text-text-secondary">
          Set the class duration and how long the check-in code stays valid.
        </p>
      </div>

      <Card>
        {assignments.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-text-secondary">
            You have no course units assigned. Contact your Faculty Admin.
          </p>
        ) : (
          <>
            <Select
              label="Course Unit"
              placeholder="Select a course unit"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              options={assignments.map((a) => ({
                value: a.courseUnit.id,
                label: `${a.courseUnit.name} (${a.courseUnit.code}) · ${a.academicYear} Sem ${a.semester}`,
              }))}
            />

            {assignment && (
              <p className="mb-4 -mt-2 text-xs text-text-secondary">
                Academic Year <span className="font-medium text-text-primary">{assignment.academicYear}</span>
                {' · '}Semester <span className="font-medium text-text-primary">{assignment.semester}</span>
              </p>
            )}

            {/* Mode */}
            <div className="mb-4">
              <p className="mb-1.5 block text-xs font-medium text-text-secondary">Mode</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['physical', 'online'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`min-h-[44px] rounded border-[1.5px] text-sm font-semibold transition-colors ${
                      mode === m
                        ? 'border-umu-red bg-[#FFF4F4] text-umu-red'
                        : 'border-border bg-white text-text-secondary hover:bg-surface-1'
                    }`}
                  >
                    {m === 'physical' ? 'Physical (In-Person)' : 'Online'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'physical' && (
              <Input
                label="Venue (optional)"
                placeholder="e.g. Lecture Hall B2"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
            )}

            <Input
              label="Session Start Time (optional)"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />

            {/* Duration + code TTL side-by-side */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="Class Duration"
                value={classDuration}
                onChange={(e) => setClassDuration(e.target.value)}
                options={CLASS_DURATION_OPTIONS}
              />
              <Select
                label="Code Validity"
                value={codeTtl}
                onChange={(e) => setCodeTtl(e.target.value)}
                options={CODE_TTL_OPTIONS}
              />
            </div>

            <p className="mb-4 text-xs text-text-secondary">
              <span className="font-medium text-text-primary">Class Duration</span> — how long the session runs
              {classDuration ? ` (${classDuration} min)` : ' (no auto-close)'}. {' '}
              <span className="font-medium text-text-primary">Code Validity</span> — how long students have
              to enter the code before it expires ({codeTtl} min).
              Use <em>Extend</em> on the live screen to refresh it.
            </p>

            <Button fullWidth loading={submitting} disabled={!assignment} onClick={handleSubmit}>
              Open Session
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
