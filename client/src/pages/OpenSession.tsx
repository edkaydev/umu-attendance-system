import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi, sessionApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { ApiClientError, errorMessage } from '../api/client'
import { getCurrentPosition, GeoError } from '../utils/geo'
import type { SessionMode } from '../types'

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
  { value: '5',  label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '20', label: '20 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes (max)' },
]

export default function OpenSession() {
  const toast = useToast()
  const navigate = useNavigate()

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedId, setSelectedId]   = useState('')
  const [mode, setMode]               = useState<SessionMode>('physical')
  const [venue, setVenue]             = useState('')
  const [startsAt, setStartsAt]       = useState('')
  const [classDuration, setClassDuration] = useState('60')
  const [codeTtl, setCodeTtl]         = useState('10')
  const [submitting, setSubmitting]   = useState(false)
  const [geoStatus, setGeoStatus]     = useState<'idle' | 'locating' | 'ready' | 'error'>('idle')
  const [geoError, setGeoError]       = useState<string | null>(null)

  useEffect(() => {
    dashboardApi
      .lecturer()
      .then((d) => {
        setAssignments(d.units)
        if (d.units.length === 1) setSelectedId(d.units[0].courseUnit.id)
      })
      .catch((e) => toast.error(errorMessage(e, 'Failed to load your units')))
  }, [toast])

  const assignment = assignments.find((a) => a.courseUnit.id === selectedId) ?? null
  const classDurationMinutes = classDuration ? Number(classDuration) : null
  const codeValidityMinutes = Number(codeTtl)
  const codeOutlivesClass = classDurationMinutes !== null && codeValidityMinutes > classDurationMinutes

  async function handleSubmit() {
    if (!assignment) {
      toast.error('Select a course unit')
      return
    }
    if (codeOutlivesClass) {
      toast.error('Code validity cannot be longer than the class duration.')
      return
    }

    setSubmitting(true)
    setGeoError(null)

    try {
      let lat: number | undefined
      let lng: number | undefined

      // Physical sessions: capture location before submitting
      if (mode === 'physical') {
        setGeoStatus('locating')
        try {
          const coords = await getCurrentPosition(12_000)
          lat = coords.lat
          lng = coords.lng
          setGeoStatus('ready')
        } catch (err) {
          const msg = err instanceof GeoError
            ? err.message
            : 'Could not get your location. Please enable location access and try again.'
          setGeoError(msg)
          setGeoStatus('error')
          setSubmitting(false)
          return
        }
      }

      const res = await sessionApi.open({
        courseUnitId: assignment.courseUnit.id,
        mode,
        venue: mode === 'physical' ? (venue.trim() || undefined) : undefined,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        academicYear: assignment.academicYear,
        semester: assignment.semester,
        classDuration: classDuration ? Number(classDuration) : undefined,
        codeTtl: Number(codeTtl),
        lat,
        lng,
      })

      toast.success('Session opened — code ' + res.session.code)
      navigate(`/lecturer/sessions/${res.session.id}/live`)
    } catch (e) {
      const msg = errorMessage(e, 'Failed to open session')
      // Geo-related server rejections — show inline rather than toast
      if (e instanceof ApiClientError && (
        e.code === 'LECTURER_OUTSIDE_CAMPUS' || e.code === 'LOCATION_REQUIRED'
      )) {
        setGeoError(msg)
        setGeoStatus('error')
      } else {
        toast.error(msg)
      }
      setSubmitting(false)
    }
  }

  // Reset geo state when switching to online (no location needed)
  function handleModeChange(m: SessionMode) {
    setMode(m)
    if (m === 'online') {
      setGeoStatus('idle')
      setGeoError(null)
    }
  }

  const isLocating = submitting && geoStatus === 'locating'

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
            <fieldset className="mb-4">
              <legend className="mb-1.5 block text-xs font-medium text-text-secondary">Mode</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['physical', 'online'] as const).map((m) => (
                  <div key={m}>
                    <input
                      id={`session-mode-${m}`}
                      name="session-mode"
                      type="radio"
                      value={m}
                      checked={mode === m}
                      onChange={() => handleModeChange(m)}
                      className="peer sr-only"
                    />
                    <label
                      htmlFor={`session-mode-${m}`}
                      className="flex min-h-[44px] cursor-pointer items-center justify-center rounded border-[1.5px] border-border bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-1 peer-checked:border-umu-red peer-checked:bg-[#FFF4F4] peer-checked:text-umu-red peer-focus-visible:ring-4 peer-focus-visible:ring-umu-red/30"
                    >
                      {m === 'physical' ? 'Physical (In-Person)' : 'Online'}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>

            {/* Location note for physical sessions */}
            {mode === 'physical' && (
              <div className={`mb-4 rounded border px-4 py-3 text-body-sm ${
                geoStatus === 'error'
                  ? 'border-danger-border bg-danger-light text-danger'
                  : 'border-border bg-surface-1 text-text-secondary'
              }`}>
                {geoStatus === 'locating' ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-umu-red border-t-transparent" />
                    Getting your location…
                  </span>
                ) : geoStatus === 'error' && geoError ? (
                  geoError
                ) : (
                  <>
                    <span className="font-medium text-text-primary">Location required.</span>{' '}
                    Your location will be recorded when you open the session so students can be checked against it.
                  </>
                )}
              </div>
            )}

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
                label="Class ends after"
                id="class-duration"
                value={classDuration}
                onChange={(e) => setClassDuration(e.target.value)}
                options={CLASS_DURATION_OPTIONS}
              />
              <Select
                label="Students can use code for"
                id="code-validity"
                value={codeTtl}
                onChange={(e) => setCodeTtl(e.target.value)}
                options={CODE_TTL_OPTIONS}
                error={codeOutlivesClass ? 'Choose a code window no longer than the class duration.' : undefined}
              />
            </div>

            <p className="mb-4 text-xs text-text-secondary">
              <span className="font-medium text-text-primary">Class ends after</span> — how long the session runs
              {classDuration ? ` (${classDuration} min)` : ' (no auto-close)'}. {' '}
              <span className="font-medium text-text-primary">Students can use code for</span> — how long students have
              to enter the code before it expires ({codeTtl} min).
              Use <em>Extend</em> on the live screen to refresh it.
            </p>
            <p className="mb-4 rounded-md border border-info-border bg-info-light px-3 py-2 text-xs text-info">
              Example: for a 60-minute class, a 5-minute code gives students a short check-in window while the class remains open for the full hour.
            </p>

            <Button
              fullWidth
              loading={isLocating || (submitting && geoStatus !== 'error')}
              disabled={!assignment}
              onClick={handleSubmit}
            >
              {isLocating ? 'Getting location…' : 'Open Session'}
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
