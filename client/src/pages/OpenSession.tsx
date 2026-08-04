import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi, sessionApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { ApiClientError } from '../api/client'

function academicYearOptions(): { value: string; label: string }[] {
  const now = new Date()
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return [startYear, startYear + 1].map((y) => ({ value: `${y}/${y + 1}`, label: `${y}/${y + 1}` }))
}

export default function OpenSession() {
  const toast = useToast()
  const navigate = useNavigate()

  const [units, setUnits] = useState<Awaited<ReturnType<typeof dashboardApi.lecturer>>['units']>([])
  const [courseUnitId, setCourseUnitId] = useState('')
  const [venue, setVenue] = useState('')
  const [academicYear, setAcademicYear] = useState(academicYearOptions()[0].value)
  const [semester, setSemester] = useState('1')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    dashboardApi
      .lecturer()
      .then((d) => {
        setUnits(d.units)
        if (d.units.length === 1) {
          setCourseUnitId(d.units[0].courseUnit.id)
          setAcademicYear(d.units[0].academicYear)
          setSemester(String(d.units[0].semester))
        }
      })
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load your units'))
  }, [toast])

  async function handleSubmit() {
    if (!courseUnitId) {
      toast.error('Select a course unit')
      return
    }
    setSubmitting(true)
    try {
      const res = await sessionApi.open({
        courseUnitId,
        venue: venue.trim() || undefined,
        academicYear,
        semester: Number(semester),
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
          Students will see your session code on their dashboard and check in within 5 minutes.
        </p>
      </div>

      <Card>
        <Select
          label="Course Unit"
          placeholder="Select a course unit"
          value={courseUnitId}
          onChange={(e) => setCourseUnitId(e.target.value)}
          options={units.map((a) => ({
            value: a.courseUnit.id,
            label: `${a.courseUnit.name} (${a.courseUnit.code})`,
          }))}
        />
        <Input label="Venue (optional)" placeholder="e.g. Lecture Hall B2" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Academic Year" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} options={academicYearOptions()} />
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
        <Button fullWidth loading={submitting} onClick={handleSubmit}>
          Open Session
        </Button>
      </Card>
    </div>
  )
}
