import { http } from './client'
import type {
  User,
  Campus,
  Faculty,
  Programme,
  CourseUnit,
  CurriculumUnitEntry,
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
export const authApi = {
  me: async () => {
    const res = await http.get<{ user: User }>('/api/auth/me')
    return res.user
  },
  logout: () => http.post<{ message: string }>('/api/auth/logout'),
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

// ─── Academic structure (System Admin — read-only; writes managed by Moodle sync) ───
export const academicApi = {
  campuses: async () => {
    const res = await http.get<{ campuses: Campus[] }>('/api/academic/campuses')
    return res.campuses
  },
  faculties: async () => {
    const res = await http.get<{ faculties: Faculty[] }>('/api/academic/faculties')
    return res.faculties
  },
  programmes: async () => {
    const res = await http.get<{ programmes: Programme[] }>('/api/academic/programmes')
    return res.programmes
  },
  courseUnits: async () => {
    const res = await http.get<{ courseUnits: CourseUnit[] }>('/api/academic/course-units')
    return res.courseUnits
  },
  curriculum: async () => {
    const res = await http.get<{ curriculum: CurriculumUnitEntry[] }>('/api/academic/curriculum')
    return res.curriculum
  },
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
}

// ─── Imports (System Admin) ───
export interface ImportResult {
  imported: number
  failed: number
  errors: { row: number; message: string }[]
}

export const importApi = {
  facultyAdmins: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return http.upload<{ result: ImportResult }>('/api/academic/import/faculty-admins', fd)
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

// ─── Moodle sync (System Admin) ───
export interface MoodleConfigInfo {
  configured: boolean
  baseUrl?: string
  wsService?: string
  tokenSet?: boolean
}

export interface MoodleConnectionTest {
  configured: boolean
  siteName?: string
  siteUrl?: string
  release?: string
  serviceUsername?: string
  availableFunctions?: string[]
}

export interface MoodleSyncStats {
  fetched: number
  created: number
  updated: number
  unchanged: number
  skipped: number
  conflicts: number
  errors: number
}

export interface MoodleSyncRunInfo {
  id: string
  startedAt: string
  completedAt: string | null
  status: string
  entity: string
  stats: unknown
  errorSummary: string | null
  durationMs: number | null
}

export interface MoodleFullSyncResult {
  users: MoodleSyncStats
  courses: MoodleSyncStats
  enrolments: MoodleSyncStats
  durationMs: number
  warnings: string[]
}

export const moodleApi = {
  config: async (): Promise<MoodleConfigInfo> => {
    const res = await http.get<{ configured: boolean; baseUrl?: string; wsService?: string; tokenSet?: boolean }>(
      '/api/moodle/config'
    )
    return res as MoodleConfigInfo
  },
  testConnection: async (): Promise<MoodleConnectionTest> =>
    http.post<MoodleConnectionTest>('/api/moodle/test-connection', {}),
  syncStatus: async (): Promise<{ lastRun: MoodleSyncRunInfo | null }> =>
    http.get<{ lastRun: MoodleSyncRunInfo | null }>('/api/moodle/sync-status'),
  sync: async (): Promise<MoodleFullSyncResult> =>
    http.post<MoodleFullSyncResult>('/api/moodle/sync', {}),
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
}
