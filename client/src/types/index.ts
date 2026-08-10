export type Role = 'student' | 'lecturer' | 'faculty_admin' | 'system_admin'
export type Gender = 'male' | 'female' | 'other'
export type ProgrammeLevel = 'bachelors' | 'masters' | 'phd' | 'diploma' | 'certificate' | 'other'

export interface FacultyRef {
  id: string
  name: string
  code: string
}

export interface ProgrammeRef {
  id: string
  name: string
  code: string
  level?: ProgrammeLevel
}

export interface User {
  id: string
  email: string
  fullName: string
  role: Role
  profileComplete: boolean
  facultyId: string | null
  faculty: FacultyRef | null
  additionalFaculties: FacultyRef[]
  programmeId: string | null
  programme: ProgrammeRef | null
  year: number | null
  semester: number | null
  academicYear: string | null
  regNumber: string | null
  whatsapp: string | null
  gender: Gender | null
  photoUrl: string | null
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
  level?: ProgrammeLevel
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
  mode: SessionMode
  startsAt: string | null
  openedAt: string
  closedAt: string | null
  classDuration?: number | null
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
  percentage: number
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
  user: { id: string; fullName: string; email: string; role: Role }
}

export interface CurriculumUnitEntry {
  id: string
  courseUnitId: string
  programmeId: string
  year: number
  semester: number
  academicYear: string
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
  whatsapp: string | null
  gender: Gender | null
  photoUrl: string | null
  isActive: boolean
  profileComplete: boolean
  createdAt: string
}
