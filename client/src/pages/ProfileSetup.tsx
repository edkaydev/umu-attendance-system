import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { profileApi, StudentProfileInput, ProfileOptions, settingsApi } from '../api/endpoints'
import { usePeriod } from '../hooks/usePeriod'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card } from '../components/ui/Card'
import { ApiClientError } from '../api/client'

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6].map((y) => ({ value: String(y), label: `Year ${y}` }))

export default function ProfileSetup({ edit = false }: { edit?: boolean }) {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { period: globalPeriod } = usePeriod()

  const [options, setOptions] = useState<ProfileOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingDisabled, setEditingDisabled] = useState(false)

  const [campusId, setCampusId] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const [year, setYear] = useState('')
  const [regNumber, setRegNumber] = useState('')

  useEffect(() => {
    if (edit && user) {
      const scope = user.role === 'student' ? 'students' : 'lecturers'
      settingsApi
        .profileEditing()
        .then((s) => setEditingDisabled(!s[scope]))
        .catch(() => setEditingDisabled(false))
    }
  }, [edit, user])

  useEffect(() => {
    profileApi
      .options()
      .then((opts) => {
        setOptions(opts)
        if (edit && user) {
          setFacultyId(user.facultyId ?? '')
          setProgrammeId(user.programmeId ?? '')
          setYear(user.year ? String(user.year) : '')
          setRegNumber(user.regNumber ?? '')
          if (user.facultyId) {
            for (const c of opts.campuses) {
              if (c.faculties.some((f) => f.id === user.facultyId)) {
                setCampusId(c.id)
                break
              }
            }
          }
        }
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit])

  const isStudent = user?.role === 'student'

  const faculties = useMemo(() => {
    if (!options) return []
    return options.campuses.find((c) => c.id === campusId)?.faculties ?? []
  }, [options, campusId])

  const programmes = useMemo(() => {
    if (!options || !facultyId) return []
    for (const c of options.campuses) {
      for (const f of c.faculties) {
        if (f.id === facultyId) return f.programmes
      }
    }
    return []
  }, [options, facultyId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  async function handleSubmit() {
    if (editingDisabled) {
      toast.error('Profile editing is currently disabled by the System Admin')
      return
    }
    if (isStudent) {
      if (!campusId || !facultyId || !programmeId || !year || !regNumber.trim()) {
        toast.error('Please complete all fields')
        return
      }
      if (!globalPeriod) {
        toast.error('System period not loaded yet, please wait')
        return
      }
      const data: StudentProfileInput = {
        campusId,
        facultyId,
        programmeId,
        year: Number(year),
        semester: globalPeriod.semester,
        regNumber: regNumber.trim(),
        academicYear: globalPeriod.academicYear,
      }
      setSaving(true)
      try {
        await (edit ? profileApi.update(data) : profileApi.complete(data))
        await refresh()
        toast.success('Profile saved')
        navigate('/student')
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to save profile')
      } finally {
        setSaving(false)
      }
    } else {
      if (!facultyId) {
        toast.error('Please select your faculty')
        return
      }
      setSaving(true)
      try {
        await (edit ? profileApi.update({ facultyId }) : profileApi.complete({ facultyId }))
        await refresh()
        toast.success('Profile saved')
        navigate('/lecturer')
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to save profile')
      } finally {
        setSaving(false)
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-h1 font-bold text-text-primary">Welcome, {user?.fullName}!</h1>
        <p className="mt-1 mb-6 text-body-lg text-text-secondary">
          {edit
            ? 'Update your academic details — your enrolled units will be recalculated.'
            : 'Complete your profile to continue.'}
        </p>

        <Card>
          {editingDisabled && (
            <div className="mb-4 rounded border border-warning-border bg-warning-light px-4 py-3 text-body-sm text-warning">
              Profile editing is currently disabled by the System Admin.
            </div>
          )}

          {/* Read-only current period banner */}
          {isStudent && globalPeriod && (
            <div className="mb-4 rounded border border-border bg-surface-1 px-4 py-3 text-body-sm text-text-secondary">
              Academic period:{' '}
              <span className="font-semibold text-text-primary">
                {globalPeriod.academicYear} · Semester {globalPeriod.semester}
              </span>
              <span className="ml-1 text-text-disabled">(set by System Admin)</span>
            </div>
          )}

          {isStudent ? (
            <>
              <Select
                label="Campus"
                placeholder="Select campus"
                value={campusId}
                onChange={(e) => { setCampusId(e.target.value); setFacultyId(''); setProgrammeId('') }}
                options={(options?.campuses ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                label="Faculty"
                placeholder="Select faculty"
                value={facultyId}
                onChange={(e) => { setFacultyId(e.target.value); setProgrammeId('') }}
                options={faculties.map((f) => ({ value: f.id, label: f.name }))}
              />
              <Select
                label="Programme"
                placeholder="Select programme"
                value={programmeId}
                onChange={(e) => setProgrammeId(e.target.value)}
                options={programmes.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Select
                label="Year of Study"
                placeholder="Select year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                options={YEAR_OPTIONS}
              />
              <Input
                label="Reg Number"
                placeholder="e.g. BSCS/2024/0123"
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value)}
              />
            </>
          ) : (
            <>
              <Select
                label="Faculty"
                placeholder="Select your faculty"
                value={facultyId}
                onChange={(e) => setFacultyId(e.target.value)}
                options={(options?.campuses ?? [])
                  .flatMap((c) => c.faculties)
                  .map((f) => ({ value: f.id, label: f.name }))}
              />
              <p className="mb-4 text-body-sm text-text-secondary">
                Your unit assignments will be set by the Faculty Admin.
              </p>
            </>
          )}

          <Button fullWidth loading={saving} disabled={editingDisabled} onClick={handleSubmit}>
            Save &amp; Continue
          </Button>
        </Card>
      </div>
    </div>
  )
}
