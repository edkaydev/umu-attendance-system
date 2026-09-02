import { http } from './client'
import type {
  User,
  Campus,
  Faculty,
  Programme,
  CourseUnit,
  CurriculumUnitEntry,
  ElectivesState,
  ElectiveRule,
  ManagedUser,
  Role,
  Session,
  SessionMode,
  SessionAttendanceRecord,
  AttendanceAlert,
  UnitAttendance,
  AttendanceStatus,
  AuditLogEntry,
  ExcuseRequest,
} from '../types'

// ─── Auth ───
export interface LoginResponse {
  user: User
  redirect: string
}

export const authApi = {
  me: async () => {
    const res = await http.get<{ user: User }>('/api/auth/me')
    return res.user
  },
  login: (email: string, password: string) =>
    http.post<LoginResponse>('/api/auth/login', { email, password }),
  logout: () => http.post<{ message: string }>('/api/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    http.post<{ message: string }>('/api/auth/password', { currentPassword, newPassword }),
  devLogin: (role: Role) =>
    http.post<{ user: User; redirect: string }>('/api/auth/dev-login', { role }),
}

// ─── Profile ───
export interface ProfileOptions {
  campuses: (Campus & {
    faculties: (Faculty & {
      programmes: (Programme & { id: string })[]
    })[]
  })[]
}

export interface StudentProfileInput {
  campusCode: string
  facultyId: string
  programmeId: string
  year: number
  semester: number
  regNumber: string
  studentNumber: string
  academicYear: string
}

export const profileApi = {
  options: async () => {
    const res = await http.get<{ campuses: ProfileOptions['campuses'] }>('/api/academic/options')
    return { campuses: res.campuses }
  },
  complete: (data: StudentProfileInput | { facultyIds: string[] }) =>
    http.put<{ message: string }>('/api/profile/complete', data),
  update: (data: StudentProfileInput | { facultyIds: string[] }) =>
    http.put<{ message: string }>('/api/profile', data),
  markTourComplete: () =>
    http.put<{ message: string }>('/api/profile/tour-complete', {}),
}

// ─── Attendance / Check-in ───
export const attendanceApi = {
  my: () =>
    http.get<{ period: { academicYear: string; semester: number } | null; units: UnitAttendance[] }>(
      '/api/attendance/my'
    ),
  checkIn: (code: string, location?: { lat: number; lng: number }) =>
    http.post<{ message: string; courseUnit: CourseUnit; date: string; status: AttendanceStatus }>(
      '/api/checkin',
      location ? { code, lat: location.lat, lng: location.lng } : { code }
    ),
  sessionAttendance: (sessionId: string) =>
    http.get<{ records: SessionAttendanceRecord[]; counts: Record<string, number> }>(
      `/api/attendance/session/${sessionId}`
    ),
  unitSummary: (courseUnitId: string, period: { academicYear: string; semester: number }) =>
    http.get<{
      courseUnitId: string
      totalSessions: number
      students: {
        student: { id: string; regNumber: string | null; fullName: string }
        percentage: number
        status: 'good' | 'warning' | 'not_eligible'
      }[]
    }>(
      `/api/attendance/unit/${courseUnitId}?academicYear=${encodeURIComponent(period.academicYear)}&semester=${period.semester}`
    ),
  edit: (recordId: string, status: AttendanceStatus, reason: string) =>
    http.patch<{ message: string }>(`/api/attendance/${recordId}`, { status, reason }),
}

// ─── Sessions ───
export interface OpenSessionInput {
  courseUnitId: string
  venue?: string
  /** Zoom / Google Meet / Teams join URL — online sessions only */
  meetingLink?: string
  mode?: SessionMode
  startsAt?: string
  academicYear: string
  semester: number
  classDuration?: number
  codeTtl?: number
  /** Lecturer GPS — required for physical sessions */
  lat?: number
  lng?: number
}

export interface SessionDetail extends Session {
  counts: Record<string, number>
  attendanceRecords: SessionAttendanceRecord[]
  lecturer: { id: string; fullName: string; email: string }
}

export interface LiveSessionData {
  session: Session & { codeExpiresAt: string; venue: string | null; classDuration: number; codeTtl: number }
  presentCount: number
  enrolledCount: number
  present: {
    id: string
    checkedInAt: string
    student: { id: string; fullName: string; regNumber: string | null }
  }[]
  pendingExcuses: ExcuseRequest[]
}

export const sessionApi = {
  list: async (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    const res = await http.get<{ sessions: Session[] }>(`/api/sessions${qs ? `?${qs}` : ''}`)
    return res.sessions
  },
  facultySessions: async (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    const res = await http.get<{ sessions: (Session & { lecturer: { id: string; fullName: string } })[] }>(
      `/api/sessions/faculty${qs ? `?${qs}` : ''}`
    )
    return res.sessions
  },
  open: (data: OpenSessionInput) => http.post<{ message: string; session: Session }>('/api/sessions', data),
  get: async (id: string) => {
    const res = await http.get<{ session: SessionDetail }>(`/api/sessions/${id}`)
    return res.session
  },
  live: (id: string) => http.get<LiveSessionData>(`/api/sessions/${id}/live`),
  close: (id: string) =>
    http.patch<{ message: string; session: Session; absenteesAutoMarked: number }>(`/api/sessions/${id}/close`),
  reopen: (id: string) => http.patch<{ message: string; session: Session }>(`/api/sessions/${id}/reopen`),
  extend: (id: string, minutes?: number) =>
    http.patch<{ message: string; session: Session }>(`/api/sessions/${id}/extend`, { minutes: minutes ?? 5 }),
}

// ─── Student live session discovery ───
export interface LiveSessionForStudent {
  id: string
  courseUnit: CourseUnit
  lecturer: { id: string; fullName: string }
  venue: string | null
  meetingLink: string | null
  mode: SessionMode
  startsAt: string | null
  openedAt: string
  codeExpiresAt: string
  classDuration: number
  checkedIn: boolean
  excusePending: boolean
}

export const checkinApi = {
  live: async () => {
    const res = await http.get<{ sessions: LiveSessionForStudent[] }>('/api/checkin/live')
    return res.sessions
  },
}

// ─── Alerts ───
export const alertApi = {
  list: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return http.get<{ alerts: AttendanceAlert[]; total: number; page: number; limit: number }>(
      `/api/alerts${qs ? `?${qs}` : ''}`
    )
  },
}

// ─── Dashboards ───
export const dashboardApi = {
  student: () =>
    http.get<{
      period: { academicYear: string; semester: number } | null
      units: UnitAttendance[]
      recentCheckIns: {
        status: AttendanceStatus
        checkedInAt: string | null
        session: { openedAt: string; courseUnit: CourseUnit }
      }[]
      weeklyChart: { date: string; sessionsHeld: number; attended: number; absent: number }[]
    }>('/api/dashboard/student'),
  lecturer: () =>
    http.get<{
      units: { courseUnit: CourseUnit; academicYear: string; semester: number }[]
      todaySessions: (Session & {
        courseUnit: CourseUnit
        _count: { attendanceRecords: number }
      })[]
      atRisk: AttendanceAlert[]
    }>('/api/dashboard/lecturer'),
  facultyAdmin: () =>
    http.get<{
      overview: {
        courseUnits: number
        students: number
        lecturers: number
        sessionsToday: number
        activeAlerts: number
      }
      activeAlerts: AttendanceAlert[]
      lecturerSummary: {
        id: string
        fullName: string
        email: string
        units: number
        sessions: number
        avgAttendance: number | null
      }[]
      programmeSummary: {
        programme: Programme
        students: number
        avgAttendance: number | null
        unitsBelowThreshold: number
      }[]
      studentSummary: {
        id: string
        fullName: string
        email: string
        regNumber: string | null
        alertStatus: 'warning' | 'critical' | null
      }[]
    }>('/api/dashboard/faculty-admin'),
  systemAdmin: () =>
    http.get<{
      overview: {
        totalUsers: number
        students: number
        lecturers: number
        facultyAdmins: number
        systemAdmins: number
        activeSessionsToday: number
      }
      recentImports: DashboardActivityEntry[]
      recentActivity: DashboardActivityEntry[]
    }>('/api/dashboard/system-admin'),
}

interface DashboardActivityEntry {
  id: string
  userId: string
  action: string
  targetType: string
  targetId: string
  meta: Record<string, unknown> | null
  createdAt: string
  user: { fullName: string; email: string }
}

// ─── Academic structure (System Admin) ───
export const academicApi = {
  campuses: async () => {
    const res = await http.get<{ campuses: Campus[] }>('/api/academic/campuses')
    return res.campuses
  },
  faculties: async () => {
    const res = await http.get<{ faculties: Faculty[] }>('/api/academic/faculties')
    return res.faculties
  },
  createFaculty: async (data: { campusCode: string; name: string; code: string }) => {
    const res = await http.post<{ faculty: Faculty }>('/api/academic/faculties', data)
    return res.faculty
  },
  updateFaculty: async (id: string, data: { campusCode: string; name: string; code: string }) => {
    const res = await http.put<{ faculty: Faculty }>(`/api/academic/faculties/${id}`, data)
    return res.faculty
  },
  programmes: async () => {
    const res = await http.get<{ programmes: Programme[] }>('/api/academic/programmes')
    return res.programmes
  },
  createProgramme: async (data: { facultyId: string; name: string; code: string }) => {
    const res = await http.post<{ programme: Programme }>('/api/academic/programmes', data)
    return res.programme
  },
  updateProgramme: async (id: string, data: { facultyId: string; name: string; code: string }) => {
    const res = await http.put<{ programme: Programme }>(`/api/academic/programmes/${id}`, data)
    return res.programme
  },
  courseUnits: async () => {
    const res = await http.get<{ courseUnits: CourseUnit[] }>('/api/academic/course-units')
    return res.courseUnits
  },
  createCourseUnit: async (data: { facultyId: string; name: string; code: string }) => {
    const res = await http.post<{ courseUnit: CourseUnit }>('/api/academic/course-units', data)
    return res.courseUnit
  },
  updateCourseUnit: async (id: string, data: { facultyId?: string; name: string; code: string }) => {
    const res = await http.put<{ courseUnit: CourseUnit }>(`/api/academic/course-units/${id}`, data)
    return res.courseUnit
  },
  shareCourseUnit: async (id: string, facultyId: string) => {
    const res = await http.post<{ link: unknown }>(`/api/academic/course-units/${id}/faculties`, { facultyId })
    return res.link
  },
  unshareCourseUnit: async (id: string, facultyId: string) => {
    await http.del<{ message: string }>(`/api/academic/course-units/${id}/faculties/${facultyId}`)
  },
  curriculum: async () => {
    const res = await http.get<{ curriculum: CurriculumUnitEntry[] }>('/api/academic/curriculum')
    return res.curriculum
  },
  createCurriculum: (data: {
    courseUnitId: string
    programmeId: string
    year: number
    semester: number
    isElective?: boolean
  }) => http.post<{ curriculumUnit: CurriculumUnitEntry }>('/api/academic/curriculum', data),
  patchCurriculum: (id: string, data: { isElective: boolean }) =>
    http.patch<{ curriculumUnit: CurriculumUnitEntry }>(`/api/academic/curriculum/${id}`, data),
  setElectiveRequirement: (data: { programmeId: string; year: number; semester: number; minPick: number }) =>
    http.put<{ requirement: { minPick: number } | { minPick: 0 } }>('/api/academic/elective-requirement', data),
  electiveRequirements: async (): Promise<ElectiveRule[]> => {
    const res = await http.get<{ requirements: ElectiveRule[] }>('/api/academic/elective-requirements')
    return res.requirements
  },
  removeCurriculum: (id: string) => http.del<{ message: string }>(`/api/academic/curriculum/${id}`),
}

// ─── Electives (student picker) ───
export const electivesApi = {
  get: async (): Promise<ElectivesState | null> => {
    const res = await http.get<ElectivesState | null>('/api/enrollments/electives')
    return res as unknown as ElectivesState | null
  },
  save: (courseUnitIds: string[]) =>
    http.put<{ message: string; state: ElectivesState }>('/api/enrollments/electives', { courseUnitIds }),
}

// ─── Lecturer assignments (Faculty Admin) ───
export interface Assignment {
  id: string
  academicYear: string
  semester: number
  assignedAt: string
  lecturer: { id: string; fullName: string; email: string }
  courseUnit: CourseUnit
  assignedBy: { id: string; fullName: string }
}

export const assignmentApi = {
  list: async () => {
    const res = await http.get<{ assignments: Assignment[] }>('/api/assignments')
    return res.assignments
  },
  create: (data: {
    lecturerId: string
    courseUnitId: string
    academicYear: string
    semester: number
  }) => http.post<{ assignment: Assignment }>('/api/assignments', data),
  remove: (id: string) => http.del<{ message: string }>(`/api/assignments/${id}`),
}

// ─── Faculty unit management (Faculty Admin) ───
export interface FacultyUnitOverview {
  courseUnits: { id: string; code: string; name: string }[]
  students: {
    id: string
    fullName: string
    email: string
    regNumber: string | null
    programme: { id: string; name: string; code: string } | null
    year: number | null
    semester: number | null
    enrollments: {
      id: string
      courseUnitId: string
      academicYear: string
      semester: number
      courseUnit: { id: string; code: string; name: string }
    }[]
  }[]
  lecturers: {
    id: string
    fullName: string
    email: string
    lecturerAssignments: {
      id: string
      courseUnitId: string
      academicYear: string
      semester: number
      courseUnit: { id: string; code: string; name: string }
    }[]
  }[]
}

export const enrollmentApi = {
  overview: async () => {
    const res = await http.get<FacultyUnitOverview>('/api/enrollments/overview')
    return res
  },
  create: (data: {
    studentId: string
    courseUnitId: string
    academicYear: string
    semester: number
  }) => http.post<{ message: string }>('/api/enrollments', data),
  remove: (id: string) => http.del<{ message: string }>(`/api/enrollments/${id}`),
}

// ─── User management (System Admin) ───
export interface AdminUserUpdateInput {
  fullName: string
  email: string
  facultyId?: string | null
  campusCode?: string
  programmeId?: string
  year?: number
  semester?: number
  academicYear?: string
  regNumber?: string
}

export interface CreateUserInput extends AdminUserUpdateInput {
  role: Role
  password?: string
}

export const userApi = {
  list: async (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return http.get<{ users: ManagedUser[]; total: number }>(`/api/users${qs ? `?${qs}` : ''}`)
  },
  create: (data: CreateUserInput) => http.post<{ user: ManagedUser }>('/api/users', data),
  deactivate:   (id: string)              => http.patch<{ user: ManagedUser }>(`/api/users/${id}/deactivate`),
  activate:     (id: string)              => http.patch<{ user: ManagedUser }>(`/api/users/${id}/activate`),
  changeRole:   (id: string, role: Role)  => http.patch<{ user: ManagedUser }>(`/api/users/${id}/role`, { role }),
  assignFaculty:(id: string, facultyId: string | null) =>
    http.patch<{ user: ManagedUser }>(`/api/users/${id}/faculty`, { facultyId }),
  update:       (id: string, data: AdminUserUpdateInput) =>
    http.patch<{ user: ManagedUser }>(`/api/users/${id}`, data),
  remove:       (id: string) => http.del<{ deleted: number }>(`/api/users/${id}`),
  removeMany: (data: { userIds?: string[]; allMatching?: boolean; role?: Role; search?: string }) =>
    http.post<{ result: { deleted: number; skipped: number; errors: { id: string; message: string }[] } }>('/api/users/bulk-delete', data),
  resetPassword: (id: string) =>
    http.patch<{ message: string }>(`/api/users/${id}/reset-password`),
}

// ─── Imports (System Admin) ───
export interface ImportResult {
  imported: number
  failed: number
  errors: { row: number; message: string }[]
}

export const importApi = {
  structure: (type: string, file: File) => {
    const fd = new FormData()
    fd.append('type', type)
    fd.append('file', file)
    return http.upload<{ result: ImportResult }>('/api/academic/import/structure', fd)
  },
  lecturers: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return http.upload<{ result: ImportResult }>('/api/academic/import/lecturers', fd)
  },
  facultyAdmins: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return http.upload<{ result: ImportResult }>('/api/academic/import/faculty-admins', fd)
  },
  students: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return http.upload<{ result: ImportResult }>('/api/academic/import/students', fd)
  },
}

// ─── Reports ───
export const reportApi = {
  lecturer: (id: string, period: { academicYear: string; semester: number }) =>
    http.get<unknown>(`/api/reports/lecturer/${id}?academicYear=${period.academicYear}&semester=${period.semester}`),
  programme: (id: string, period: { academicYear: string; semester: number }) =>
    http.get<unknown>(`/api/reports/programme/${id}?academicYear=${period.academicYear}&semester=${period.semester}`),
  courseUnit: (id: string, period: { academicYear: string; semester: number }) =>
    http.get<unknown>(`/api/reports/course-unit/${id}?academicYear=${period.academicYear}&semester=${period.semester}`),
  student: (id: string, period: { academicYear: string; semester: number }) =>
    http.get<unknown>(`/api/reports/student/${id}?academicYear=${period.academicYear}&semester=${period.semester}`),
  pdfUrl: (type: string, id: string, period: { academicYear: string; semester: number }) =>
    `/api/reports/${type}/${id}/pdf?academicYear=${encodeURIComponent(period.academicYear)}&semester=${period.semester}`,
}

// ─── Audit logs ───
export const auditLogApi = {
  list: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return http.get<{ logs: AuditLogEntry[]; total: number; page: number; limit: number }>(
      `/api/audit-logs${qs ? `?${qs}` : ''}`
    )
  },
}

// ─── Excuse requests ───
export const excuseApi = {
  submit: (sessionId: string, reason: string) =>
    http.post<{ message: string; excuse: ExcuseRequest }>('/api/excuses', { sessionId, reason }),
  approve: (excuseId: string) =>
    http.patch<{ message: string }>(`/api/excuses/${excuseId}/approve`),
  reject: (excuseId: string) =>
    http.patch<{ message: string }>(`/api/excuses/${excuseId}/reject`),
}

// ─── System settings ───
export interface ProfileEditingSettings {
  students: boolean
  lecturers: boolean
  admins: boolean
}
export type ProfileEditingScope = keyof ProfileEditingSettings

export interface CurrentPeriod {
  academicYear: string
  semester: number
}

export const settingsApi = {
  profileEditing: async () => {
    const res = await http.get<{ enabled: ProfileEditingSettings }>('/api/settings/profile-editing')
    return res.enabled
  },
  setProfileEditing: (settings: Partial<ProfileEditingSettings>) =>
    http.patch<{ enabled: ProfileEditingSettings; message: string }>(
      '/api/settings/profile-editing',
      settings
    ),
  currentPeriod: async (): Promise<CurrentPeriod> => {
    const res = await http.get<{ period: CurrentPeriod }>('/api/settings/current-period')
    return res.period
  },
  setCurrentPeriod: (period: CurrentPeriod) =>
    http.patch<{ period: CurrentPeriod; message: string }>(
      '/api/settings/current-period',
      period
    ),
  defaultUserPassword: async () => {
    const res = await http.get<{ defaultUserPassword: { configured: boolean } }>('/api/settings/default-user-password')
    return res.defaultUserPassword
  },
  setDefaultUserPassword: (password: string) =>
    http.patch<{ message: string }>('/api/settings/default-user-password', { password }),
}
