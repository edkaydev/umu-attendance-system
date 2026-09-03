export type Role = 'student' | 'lecturer' | 'faculty_admin' | 'system_admin'

export interface FacultyRef {
  id: string
  name: string
  code: string
}

export interface ProgrammeRef {
  id: string
  name: string
  code: string
}

export interface User {
  id: string
  email: string
  fullName: string
  role: Role
  profileComplete: boolean
  hasCompletedTour?: boolean
  facultyId: string | null
  faculty: FacultyRef | null
  lecturerFaculties?: { facultyId: string; isPrimary: boolean; faculty: { id: string; name: string } }[]
  programmeId: string | null
  programme: ProgrammeRef | null
  year: number | null
  semester: number | null
  academicYear: string | null
  regNumber: string | null
  studentNumber?: string | null
  moodleLinked?: boolean
  isActive: boolean
}

export interface CourseUnit {
  id: string
  code: string
  name: string
  facultyId?: string
  faculty?: { id: string; name: string }
  sharedFaculties?: { id: string; courseUnitId: string; facultyId: string; faculty: { id: string; name: string }; createdAt: string }[]
  isActive?: boolean
}

export interface Faculty {
  id: string
  name: string
  code: string
  campusCode?: string
  campusName?: string
  isActive?: boolean
}

export interface Programme {
  id: string
  name: string
  code: string
  facultyId?: string
  isActive?: boolean
}

export interface Campus {
  code: string
  name: string
  isActive?: boolean
}

export type AttendanceStatus = 'present' | 'absent' | 'excused'
export type SessionStatus = 'open' | 'closed'
export type SessionMode = 'physical' | 'online'
export type UnitStatus = 'good' | 'warning' | 'not_eligible' | 'none'
export type AlertType = 'warning' | 'critical'

export interface Session {
  id: string
  courseUnitId: string
  courseUnit: CourseUnit
  lecturerId: string
  academicYear: string
  semester: number
  code: string
  codeExpiresAt: string
  status: SessionStatus
  venue: string | null
  meetingLink: string | null
  mode: SessionMode
  startsAt: string | null
  openedAt: string
  closedAt: string | null
  classDuration?: number
  _count?: { attendanceRecords: number }
}

export interface SessionAttendanceRecord {
  id: string
  status: AttendanceStatus
  checkedInAt: string | null
  edits: {
    oldStatus: AttendanceStatus
    newStatus: AttendanceStatus
    reason: string
    changedAt: string
    changedBy?: { fullName: string }
  }[]
  student: { id: string; regNumber: string | null; fullName: string; email: string }
}

export interface UnitAttendance {
  courseUnit: CourseUnit
  sessionsHeld: number
  attended: number
  /** null = no closed sessions yet — no meaningful percentage */
  percentage: number | null
  status: UnitStatus
}

export interface AttendanceAlert {
  id: string
  student: { id: string; fullName: string; regNumber: string | null }
  courseUnit: CourseUnit
  alertType: AlertType
  attendancePct: number
  sentAt: string
  resolved: boolean
}

export interface AuditLogEntry {
  id: string
  userId: string
  action: string
  targetType: string
  targetId: string
  meta: Record<string, unknown> | null
  createdAt: string
  summary: string
  actor: { id: string; fullName: string | null; email: string | null; role: Role } | null
}

export type ExcuseRequestStatus = 'pending' | 'approved' | 'rejected'

export interface ExcuseRequest {
  id: string
  reason: string
  createdAt: string
  student: { id: string; fullName: string; regNumber: string | null }
}

export interface CurriculumUnitEntry {
  id: string
  courseUnitId: string
  programmeId: string
  year: number
  semester: number
  courseUnit: CourseUnit
  programme: Programme
}

export interface ManagedUser {
  id: string
  fullName: string
  email: string
  role: Role
  facultyId: string | null
  faculty: { id: string; name: string } | null
  programmeId: string | null
  programme: { id: string; name: string } | null
  year: number | null
  semester: number | null
  academicYear: string | null
  regNumber: string | null
  studentNumber?: string | null
  isActive: boolean
  profileComplete: boolean
  createdAt: string
}
