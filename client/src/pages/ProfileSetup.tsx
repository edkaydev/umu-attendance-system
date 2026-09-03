import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { profileApi, StudentProfileInput, ProfileOptions, settingsApi } from '../api/endpoints'
import { usePeriod } from '../hooks/usePeriod'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card } from '../components/ui/Card'
import { ApiClientError } from '../api/client'
import { Skeleton, SkeletonScreen } from '../components/ui/Skeleton'

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

  // Lecturer faculty selection — primary + up to 2 additional faculties
  const [primaryFacultyId, setPrimaryFacultyId] = useState('')
  const [extraFaculty1, setExtraFaculty1] = useState('')
  const [extraFaculty2, setExtraFaculty2] = useState('')

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
          // Lecturer prefill: primary + previously chosen additional faculties
          setPrimaryFacultyId(user.facultyId ?? '')
          const extras = (user.lecturerFaculties ?? []).filter((m) => !m.isPrimary)
          setExtraFaculty1(extras[0]?.facultyId ?? '')
          setExtraFaculty2(extras[1]?.facultyId ?? '')
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
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load profile options. Please refresh the page.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit])

  const isStudent = user?.role === 'student'

  const faculties = useMemo(() => {
    if (!options) return []
    return options.campuses.find((c) => c.code === campusCode)?.faculties ?? []
  }, [options, campusCode])

  const allFaculties = useMemo(
    () => (options?.campuses ?? []).flatMap((c) => c.faculties),
    [options]
  )

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
      <SkeletonScreen label="Loading profile options…" className="py-16">
        <div className="mx-auto max-w-xl space-y-6">
          <div className="space-y-2 text-center">
            <Skeleton className="mx-auto h-8 w-64 max-w-full" />
            <Skeleton className="mx-auto h-4 w-80 max-w-full" />
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full rounded" />
            </div>
          ))}
          <Skeleton className="h-12 w-full rounded" />
        </div>
      </SkeletonScreen>
    )
  }

  async function handleSubmit() {
    if (editingDisabled) {
      toast.error('Profile editing is currently disabled by the System Admin')
      return
    }
    if (isStudent) {
      if (!studentNumber.trim()) {
        toast.error('Please enter your Student Number')
        return
      }
      // For non-Moodle students doing first-time setup, also require path fields
      if (!user?.moodleLinked && !edit) {
        if (!campusCode || !facultyId || !programmeId || !year) {
          toast.error('Please complete all fields')
          return
        }
        if (!regNumber.trim()) {
          toast.error('Please enter your Reg Number')
          return
        }
      }
      if (!globalPeriod) {
        toast.error('Academic year not set yet — please wait a moment and try again')
        return
      }
      const data: StudentProfileInput = {
        campusCode: campusCode || (user?.faculty ? 'NKZ' : ''),
        facultyId: facultyId || user?.facultyId || '',
        programmeId: programmeId || user?.programmeId || '',
        year: Number(year) || user?.year || 1,
        semester: globalPeriod.semester,
        regNumber: regNumber.trim() || user?.regNumber || '',
        studentNumber: studentNumber.trim(),
        academicYear: globalPeriod.academicYear,
      }
      setSaving(true)
      try {
        await (edit ? profileApi.update(data) : profileApi.complete(data))
        await refresh()
        toast.success('Profile saved')
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to save profile')
      } finally {
        setSaving(false)
      }
    } else {
      const facultyIds = [primaryFacultyId, extraFaculty1, extraFaculty2].filter(Boolean)
      if (!primaryFacultyId) {
        toast.error('Please select your primary faculty')
        return
      }
      setSaving(true)
      try {
        await (edit ? profileApi.update({ facultyIds }) : profileApi.complete({ facultyIds }))
        await refresh()
        toast.success('Profile saved')
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
            ? isStudent && user?.moodleLinked
              ? 'Update your Student Number below.'
              : isStudent
              ? 'Only your Reg Number and Student Number can be changed.'
              : 'Update the faculties you teach in.'
            : isStudent && user?.moodleLinked
            ? 'Your study path is set from Moodle. Just enter your Student Number to finish.'
            : 'Complete your profile to continue.'}
        </p>

        <Card>
          {editingDisabled && (
            <div className="mb-4 rounded bg-warning-light px-4 py-3 text-body-sm text-warning">
              Profile editing is currently disabled by the System Admin.
            </div>
          )}

          {/* Read-only current period banner */}
          {isStudent && globalPeriod && (
            <div className="mb-4 rounded bg-surface-1 px-4 py-3 text-body-sm text-text-secondary">
              Academic period:{' '}
              <span className="font-semibold text-text-primary">
                {globalPeriod.academicYear} · Semester {globalPeriod.semester}
              </span>
              <span className="ml-1 text-text-disabled">(set by System Admin)</span>
            </div>
          )}

          {isStudent ? (
            user?.moodleLinked ? (
              /* ── Moodle-synced student: path already set, just need student number ── */
              <>
                <div className="mb-5 rounded-md border border-border bg-surface-1 px-4 py-3">
                  <p className="text-body-sm font-semibold text-text-primary">Your study path (from Moodle)</p>
                  <div className="mt-2 space-y-1 text-body-sm text-text-secondary">
                    {user.faculty && <p>Faculty: <span className="font-medium text-text-primary">{user.faculty.name}</span></p>}
                    {user.programme && <p>Programme: <span className="font-medium text-text-primary">{user.programme.name}</span></p>}
                    {user.year && <p>Year: <span className="font-medium text-text-primary">{user.year}</span></p>}
                    {user.regNumber && <p>Reg Number: <span className="font-medium text-text-primary">{user.regNumber}</span></p>}
                  </div>
                  <p className="mt-2 text-xs text-text-disabled">These details are managed in Moodle and cannot be changed here.</p>
                </div>
                <Input
                  label="Student Number"
                  placeholder="e.g. 2024012301"
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                  autoFocus
                />
                <p className="mb-4 text-xs text-text-secondary">
                  Your student number is your UMU identity number (not your reg number). Check your admission letter or student ID card.
                </p>
              </>
            ) : edit ? (
              /* ── Non-Moodle student edit: show read-only path + editable identity fields ── */
              <>
                <div className="mb-4 rounded bg-surface-1 px-4 py-3 text-body-sm">
                  <p className="font-medium text-text-primary">Your study path</p>
                  <p className="mt-1 text-text-secondary">
                    {allFaculties.find((f) => f.id === facultyId)?.name ?? 'Faculty'} ·{' '}
                    {user?.programme?.name ?? 'Programme'}
                    {user?.year ? ` · Year ${user.year}` : ''}
                  </p>
                  <p className="mt-1 text-text-disabled">
                    Your units follow the curriculum for this path and cannot be changed here.
                  </p>
                </div>
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
            ) : (
              /* ── Non-Moodle student first-time setup: full cascade ── */
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
            )
          ) : (
            /* Lecturer — choose a primary faculty plus up to two more (max 3) */
            <>
              <Select
                label="Primary Faculty"
                placeholder="Select your primary faculty"
                value={primaryFacultyId}
                onChange={(e) => setPrimaryFacultyId(e.target.value)}
                options={allFaculties
                  .filter((f) => f.id !== extraFaculty1 && f.id !== extraFaculty2)
                  .map((f) => ({ value: f.id, label: f.name }))}
              />
              <Select
                label="Additional Faculty (optional)"
                placeholder="None"
                value={extraFaculty1}
                onChange={(e) => setExtraFaculty1(e.target.value)}
                options={[{ value: '', label: 'None' }, ...allFaculties
                  .filter((f) => f.id !== primaryFacultyId && f.id !== extraFaculty2)
                  .map((f) => ({ value: f.id, label: f.name }))]}
              />
              <Select
                label="Additional Faculty (optional)"
                placeholder="None"
                value={extraFaculty2}
                onChange={(e) => setExtraFaculty2(e.target.value)}
                options={[{ value: '', label: 'None' }, ...allFaculties
                  .filter((f) => f.id !== primaryFacultyId && f.id !== extraFaculty1)
                  .map((f) => ({ value: f.id, label: f.name }))]}
              />
              <p className="mb-4 text-body-sm text-text-secondary">
                You can belong to up to 3 faculties. Your unit assignments are set by the Faculty Admin.
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
