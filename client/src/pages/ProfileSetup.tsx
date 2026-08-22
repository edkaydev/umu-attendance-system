import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { profileApi, StudentProfileInput, ProfileOptions, settingsApi } from '../api/endpoints'
import { usePeriod } from '../hooks/usePeriod'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card } from '../components/ui/Card'
import { errorMessage } from '../api/client'
import { LoadingState } from '../components/ui/Spinner'

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6].map((y) => ({ value: String(y), label: `Year ${y}` }))

export default function ProfileSetup({ edit = false }: { edit?: boolean }) {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const { period: globalPeriod } = usePeriod()

  const [options, setOptions] = useState<ProfileOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingDisabled, setEditingDisabled] = useState(false)

  const [campusCode, setCampusCode] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const [year, setYear] = useState('')
  const [regNumber, setRegNumber] = useState('')
  const [studentNumber, setStudentNumber] = useState('')

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
          setStudentNumber(user.studentNumber ?? '')
          if (user.facultyId) {
            for (const c of opts.campuses) {
              if (c.faculties.some((f) => f.id === user.facultyId)) {
                setCampusCode(c.code)
                break
              }
            }
          }
        }
      })
      .catch((e) => toast.error(errorMessage(e, 'Failed to load profile options. Please refresh the page.')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit])

  const isStudent = user?.role === 'student'

  const faculties = useMemo(() => {
    if (!options) return []
    return options.campuses.find((c) => c.code === campusCode)?.faculties ?? []
  }, [options, campusCode])

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
      <LoadingState label="Loading profile options…" fullScreen />
    )
  }

  async function handleSubmit() {
    if (editingDisabled) {
      toast.error('Profile editing is currently disabled by the System Admin')
      return
    }
    if (isStudent) {
      if (!campusCode || !facultyId || !programmeId || !year || !regNumber.trim() || !studentNumber.trim()) {
        toast.error('Please complete all fields')
        return
      }
      if (!globalPeriod) {
        toast.error('System period not loaded yet, please wait')
        return
      }
      const data: StudentProfileInput = {
        campusCode,
        facultyId,
        programmeId,
        year: Number(year),
        semester: globalPeriod.semester,
        regNumber: regNumber.trim(),
        studentNumber: studentNumber.trim(),
        academicYear: globalPeriod.academicYear,
      }
      setSaving(true)
      try {
        await (edit ? profileApi.update(data) : profileApi.complete(data))
        await refresh()
        toast.success('Profile saved')
        // RequireAuth will redirect to the dashboard once profileComplete = true
      } catch (e) {
        toast.error(errorMessage(e, 'Failed to save profile'))
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
        // RequireAuth will redirect to /lecturer once profileComplete = true
      } catch (e) {
        toast.error(errorMessage(e, 'Failed to save profile'))
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
                value={campusCode}
                onChange={(e) => { setCampusCode(e.target.value); setFacultyId(''); setProgrammeId('') }}
                options={(options?.campuses ?? []).map((c) => ({ value: c.code, label: c.name }))}
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
              <Input
                label="Student Number"
                placeholder="e.g. 2024012301"
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
              />
            </>
          ) : edit ? (
            /* Lecturer edit mode — faculty is assigned by System Admin, read-only */
            <>
              <div className="mb-4">
                <p className="mb-1 text-body-sm font-medium text-text-secondary">Faculty</p>
                <div className="rounded border border-border bg-surface-1 px-3 py-2 text-body text-text-primary">
                  {(options?.campuses ?? [])
                    .flatMap((c) => c.faculties)
                    .find((f) => f.id === facultyId)?.name ?? (
                    <span className="text-text-disabled">Not yet assigned</span>
                  )}
                </div>
                <p className="mt-1 text-body-sm text-text-disabled">
                  Your faculty is assigned by the System Admin and cannot be changed here.
                </p>
              </div>
            </>
          ) : (
            /* Lecturer first-time profile setup — choose faculty */
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

          {/* Lecturer in edit mode has nothing to save — faculty is read-only */}
          {!(!isStudent && edit) && (
            <Button fullWidth loading={saving} disabled={editingDisabled} onClick={handleSubmit}>
              Save &amp; Continue
            </Button>
          )}
        </Card>
      </div>
    </div>
  )
}
