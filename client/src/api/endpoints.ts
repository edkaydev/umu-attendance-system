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
  SessionAttendanceRecord,
  AttendanceAlert,
  UnitAttendance,
  AttendanceStatus,
  AuditLogEntry,
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
  campusId: string
  facultyId: string
  programmeId: string
  year: number
  semester: number
  regNumber: string
  academicYear: string
}

export const profileApi = {
  options: async () => {
    const res = await http.get<{ campuses: ProfileOptions['campuses'] }>('/api/academic/options')
    return { campuses: res.campuses }
  },
  complete: (data: StudentProfileInput | { facultyId: string }) =>
    http.put<{ message: string }>('/api/profile/complete', data),
  update: (data: StudentProfileInput | { facultyId: string }) =>
    http.put<{ message: string }>('/api/profile', data),
}

// ─── Attendance / Check-in ───
export const attendanceApi = {
  my: () =>
    http.get<{ period: { academicYear: string; semester: number } | null; units: UnitAttendance[] }>(
      '/api/attendance/my'
    ),
  checkIn: (code: string) =>
    http.post<{ message: string; courseUnit: CourseUnit; date: string; status: AttendanceStatus }>(
      '/api/checkin',
      { code }
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
  academicYear: string
  semester: number
}

export interface SessionDetail extends Session {
  counts: Record<string, number>
  attendanceRecords: SessionAttendanceRecord[]
}

export const sessionApi = {
  list: async (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    const res = await http.get<{ sessions: Session[] }>(`/api/sessions${qs ? `?${qs}` : ''}`)
    return res.sessions
  },
  open: (data: OpenSessionInput) => http.post<{ message: string; session: Session }>('/api/sessions', data),
  get: async (id: string) => {
    const res = await http.get<{ session: SessionDetail }>(`/api/sessions/${id}`)
    return res.session
  },
  live: (id: string) =>
    http.get<{
      session: Session & { codeExpiresAt: string; venue: string | null }
      presentCount: number
      enrolledCount: number
      present: { id: string; checkedInAt: string; student: { id: string; fullName: string; regNumber: string | null } }[]
    }>(`/api/sessions/${id}/live`),
  close: (id: string) =>
    http.patch<{ message: string; session: Session; absenteesAutoMarked: number }>(`/api/sessions/${id}/close`),
  reopen: (id: string) => http.patch<{ message: string; session: Session }>(`/api/sessions/${id}/reopen`),
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
  createCampus: async (data: { name: string; code: string }) => {
    const res = await http.post<{ campus: Campus }>('/api/academic/campuses', data)
    return res.campus
  },
  updateCampus: async (id: string, data: { name: string; code: string }) => {
    const res = await http.put<{ campus: Campus }>(`/api/academic/campuses/${id}`, data)
    return res.campus
  },
  faculties: async () => {
    const res = await http.get<{ faculties: Faculty[] }>('/api/academic/faculties')
    return res.faculties
  },
  createFaculty: async (data: { campusId: string; name: string; code: string }) => {
    const res = await http.post<{ faculty: Faculty }>('/api/academic/faculties', data)
    return res.faculty
  },
  updateFaculty: async (id: string, data: { campusId: string; name: string; code: string }) => {
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
  updateCourseUnit: async (id: string, data: { facultyId: string; name: string; code: string }) => {
    const res = await http.put<{ courseUnit: CourseUnit }>(`/api/academic/course-units/${id}`, data)
    return res.courseUnit
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
    academicYear: string
  }) => http.post<{ curriculumUnit: CurriculumUnitEntry }>('/api/academic/curriculum', data),
  removeCurriculum: (id: string) => http.del<{ message: string }>(`/api/academic/curriculum/${id}`),
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

// ─── User management (System Admin) ───
export const userApi = {
  list: async (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return http.get<{ users: ManagedUser[]; total: number }>(`/api/users${qs ? `?${qs}` : ''}`)
  },
  deactivate:   (id: string)              => http.patch<{ user: ManagedUser }>(`/api/users/${id}/deactivate`),
  activate:     (id: string)              => http.patch<{ user: ManagedUser }>(`/api/users/${id}/activate`),
  changeRole:   (id: string, role: Role)  => http.patch<{ user: ManagedUser }>(`/api/users/${id}/role`, { role }),
  assignFaculty:(id: string, facultyId: string | null) =>
    http.patch<{ user: ManagedUser }>(`/api/users/${id}/faculty`, { facultyId }),
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
  staff: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return http.upload<{ result: ImportResult }>('/api/academic/import/staff', fd)
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
