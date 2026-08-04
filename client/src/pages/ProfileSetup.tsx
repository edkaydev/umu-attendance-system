import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { profileApi, StudentProfileInput, ProfileOptions } from '../api/endpoints'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card } from '../components/ui/Card'
import { ApiClientError } from '../api/client'

function academicYearOptions(): { value: string; label: string }[] {
  const now = new Date()
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return [startYear - 1, startYear, startYear + 1].map((y) => ({
    value: `${y}/${y + 1}`,
    label: `${y}/${y + 1}`,
  }))
}

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6].map((y) => ({ value: String(y), label: `Year ${y}` }))
const SEMESTER_OPTIONS = [
  { value: '1', label: 'Semester 1' },
  { value: '2', label: 'Semester 2' },
]

export default function ProfileSetup() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [options, setOptions] = useState<ProfileOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [campusId, setCampusId] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const [year, setYear] = useState('')
  const [semester, setSemester] = useState('')
  const [academicYear, setAcademicYear] = useState(academicYearOptions()[1].value)
  const [regNumber, setRegNumber] = useState('')

  useEffect(() => {
    profileApi
      .options()
      .then(setOptions)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [toast])

  const isStudent = user?.role === 'student'

  const programmes = useMemo(() => {
    if (!options || !facultyId) return []
    for (const c of options.campuses) {
      for (const f of c.faculties) {
        if (f.id === facultyId) return f.programmes
      }
    }
    return []
  }, [options, facultyId])

  const faculties = useMemo(() => {
    if (!options) return []
    const campus = options.campuses.find((c) => c.id === campusId)
    return campus?.faculties ?? []
  }, [options, campusId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  async function handleSubmit() {
    if (isStudent) {
      if (!campusId || !facultyId || !programmeId || !year || !semester || !regNumber.trim()) {
        toast.error('Please complete all fields')
        return
      }
      const data: StudentProfileInput = {
        campusId,
        facultyId,
        programmeId,
        year: Number(year),
        semester: Number(semester),
        regNumber: regNumber.trim(),
        academicYear,
      }
      setSaving(true)
      try {
        await profileApi.complete(data)
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
        await profileApi.complete({ facultyId })
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
        <p className="mt-1 mb-6 text-body-lg text-text-secondary">Complete your profile to continue.</p>

        <Card>
          {isStudent ? (
            <>
              <Select
                label="Campus"
                placeholder="Select campus"
                value={campusId}
                onChange={(e) => {
                  setCampusId(e.target.value)
                  setFacultyId('')
                  setProgrammeId('')
                }}
                options={(options?.campuses ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                label="Faculty"
                placeholder="Select faculty"
                value={facultyId}
                onChange={(e) => {
                  setFacultyId(e.target.value)
                  setProgrammeId('')
                }}
                options={faculties.map((f) => ({ value: f.id, label: f.name }))}
              />
              <Select
                label="Programme"
                placeholder="Select programme"
                value={programmeId}
                onChange={(e) => setProgrammeId(e.target.value)}
                options={programmes.map((p) => ({ value: p.id, label: p.name }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Year" placeholder="Select" value={year} onChange={(e) => setYear(e.target.value)} options={YEAR_OPTIONS} />
                <Select label="Semester" placeholder="Select" value={semester} onChange={(e) => setSemester(e.target.value)} options={SEMESTER_OPTIONS} />
              </div>
              <Select label="Academic Year" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} options={academicYearOptions()} />
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

          <Button fullWidth loading={saving} onClick={handleSubmit}>
            Save &amp; Continue
          </Button>
        </Card>
      </div>
    </div>
  )
}
