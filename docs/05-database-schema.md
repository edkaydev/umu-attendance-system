# 05 — Database Schema

## Entity Relationship Summary

```
Campus ──< Faculty ──< Programme ──< CurriculumUnit >── CourseUnit
                                          |
                                     (Year + Semester)

User >──< CourseUnit   (via Enrollment — students)
User >──< CourseUnit   (via LecturerAssignment — lecturers)

CourseUnit ──< Session ──< AttendanceRecord >── User (student)
Session.lecturer ──> User (lecturer)

User ──< AttendanceAlert
User ──< AuditLog
User ──< RefreshToken
```

---

## Tables

### `campuses`
| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `name` | VARCHAR(100) | e.g. "Nkozi Campus" |
| `code` | VARCHAR(20) | e.g. "NKZ" |
| `is_active` | BOOLEAN | Default true |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `faculties`
| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `campus_id` | VARCHAR(36) FK → campuses | |
| `name` | VARCHAR(100) | e.g. "Faculty of Science" |
| `code` | VARCHAR(20) | e.g. "SCI" |
| `is_active` | BOOLEAN | Default true |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `programmes`
| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `faculty_id` | VARCHAR(36) FK → faculties | |
| `name` | VARCHAR(150) | e.g. "Bachelor of Computer Science" |
| `code` | VARCHAR(20) | e.g. "BSCS" |
| `is_active` | BOOLEAN | Default true |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `course_units`
A course unit is a reusable academic unit (e.g. "Web Development").
It exists independently of which programme or year it belongs to.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `faculty_id` | VARCHAR(36) FK → faculties | Owner faculty |
| `code` | VARCHAR(20) | e.g. "BCS3101" |
| `name` | VARCHAR(150) | e.g. "Web Development" |
| `is_active` | BOOLEAN | Default true |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `curriculum_units`
Maps a course unit to a specific Programme + Year + Semester combination.
This is how course units are shared across programmes.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `course_unit_id` | VARCHAR(36) FK → course_units | |
| `programme_id` | VARCHAR(36) FK → programmes | |
| `year` | TINYINT | e.g. 1, 2, 3, 4 |
| `semester` | TINYINT | 1 or 2 |
| `academic_year` | VARCHAR(10) | e.g. "2025/2026" |
| `created_at` | DATETIME | |
| UNIQUE | (`course_unit_id`, `programme_id`, `year`, `semester`, `academic_year`) | No duplicates |

Example: Web Development mapped to BSCS Year 3 Sem 1 AND BSIT Year 3 Sem 1
= two rows with the same `course_unit_id` but different `programme_id`.

---

### `users`
All system users in one table. Role determines access.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `google_id` | VARCHAR(100) | Unique — from Google OAuth |
| `email` | VARCHAR(150) | Unique |
| `full_name` | VARCHAR(100) | From Google profile |
| `role` | ENUM | `system_admin`, `faculty_admin`, `lecturer`, `student` |
| `faculty_id` | VARCHAR(36) FK → faculties | Nullable — set during profile completion |
| `programme_id` | VARCHAR(36) FK → programmes | Students only |
| `year` | TINYINT | Students only |
| `semester` | TINYINT | Students only (current semester) |
| `reg_number` | VARCHAR(30) | Students only — self-entered |
| `profile_complete` | BOOLEAN | False until profile setup done |
| `is_active` | BOOLEAN | Deactivated users cannot log in |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `enrollments`
Links students to course units for a given academic year + semester.
Auto-created when a student completes or edits their profile.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `student_id` | VARCHAR(36) FK → users | Role must be `student` |
| `course_unit_id` | VARCHAR(36) FK → course_units | |
| `academic_year` | VARCHAR(10) | e.g. "2025/2026" |
| `semester` | TINYINT | 1 or 2 |
| `enrolled_at` | DATETIME | |
| UNIQUE | (`student_id`, `course_unit_id`, `academic_year`, `semester`) | No duplicate enrolments |

---

### `lecturer_assignments`
Links lecturers to course units. Set by Faculty Admin.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `lecturer_id` | VARCHAR(36) FK → users | Role must be `lecturer` |
| `course_unit_id` | VARCHAR(36) FK → course_units | |
| `academic_year` | VARCHAR(10) | |
| `semester` | TINYINT | |
| `assigned_by` | VARCHAR(36) FK → users | Faculty Admin who made the assignment |
| `assigned_at` | DATETIME | |
| UNIQUE | (`lecturer_id`, `course_unit_id`, `academic_year`, `semester`) | |

---

### `sessions`
Each attendance session opened by a lecturer.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `course_unit_id` | VARCHAR(36) FK → course_units | |
| `lecturer_id` | VARCHAR(36) FK → users | Who opened the session |
| `academic_year` | VARCHAR(10) | |
| `semester` | TINYINT | |
| `code` | VARCHAR(8) | 6-char alphanumeric, unique per active session |
| `code_expires_at` | DATETIME | 5 minutes after session opens |
| `status` | ENUM | `open`, `closed` |
| `venue` | VARCHAR(100) | Optional |
| `opened_at` | DATETIME | |
| `closed_at` | DATETIME | Nullable until closed |
| INDEX | `code` | Fast lookup on student check-in |
| INDEX | (`course_unit_id`, `status`) | Fast "is there an open session?" check |

---

### `attendance_records`
One row per student per session.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `session_id` | VARCHAR(36) FK → sessions | |
| `student_id` | VARCHAR(36) FK → users | |
| `status` | ENUM | `present`, `absent`, `excused` |
| `checked_in_at` | DATETIME | Nullable — set when student submits code |
| `created_at` | DATETIME | |
| UNIQUE | (`session_id`, `student_id`) | One record per student per session |

> When a session closes, the system auto-inserts `absent` records for all enrolled
> students who do not yet have a record for that session.

---

### `attendance_edits`
Audit trail for every manual attendance change by a lecturer.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `attendance_record_id` | VARCHAR(36) FK → attendance_records | |
| `changed_by` | VARCHAR(36) FK → users | Lecturer who made the change |
| `old_status` | ENUM | `present`, `absent`, `excused` |
| `new_status` | ENUM | `present`, `absent`, `excused` |
| `reason` | TEXT | Required — lecturer must provide a reason |
| `changed_at` | DATETIME | |

---

### `attendance_alerts`
Tracks which threshold alerts have been sent. Prevents duplicate emails.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `student_id` | VARCHAR(36) FK → users | |
| `course_unit_id` | VARCHAR(36) FK → course_units | |
| `alert_type` | ENUM | `warning` (80%), `critical` (75%) |
| `attendance_pct` | DECIMAL(5,2) | Percentage at time of alert |
| `sent_at` | DATETIME | |
| `resolved` | BOOLEAN | True if student recovers above threshold |

Alert logic:
- `warning` fires once when attendance crosses below 80%
- `critical` fires once when attendance crosses below 75%
- If student recovers and drops again, a new alert is created

---

### `refresh_tokens`
Supports JWT refresh token rotation.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `user_id` | VARCHAR(36) FK → users | |
| `token_hash` | VARCHAR(255) | SHA-256 hash of the refresh token |
| `expires_at` | DATETIME | 7 days |
| `revoked` | BOOLEAN | Default false |
| `created_at` | DATETIME | |

---

### `audit_logs`
System-level action log. Visible to Faculty Admin and System Admin.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `user_id` | VARCHAR(36) FK → users | Who performed the action |
| `action` | VARCHAR(50) | e.g. `LOGIN`, `SESSION_OPEN`, `ATTENDANCE_EDIT`, `PDF_DOWNLOAD` |
| `target_type` | VARCHAR(50) | e.g. `session`, `attendance_record`, `user` |
| `target_id` | VARCHAR(36) | ID of the affected record |
| `meta` | JSON | Extra context (old/new values, IP, etc.) |
| `created_at` | DATETIME | |

---

## Computed Values (calculated at query time, not stored)

| Value | Calculation |
|---|---|
| Total sessions for a unit | `COUNT(sessions) WHERE course_unit_id = X AND status = 'closed'` |
| Student attendance % | `(COUNT present + COUNT excused) / total sessions × 100` |
| Students below 75% | Filter above result per course unit |
| Class average attendance | Average of all student percentages in a unit |

---

## Prisma Schema (MySQL)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Campus {
  id         String     @id @default(uuid())
  name       String
  code       String     @unique
  isActive   Boolean    @default(true)
  faculties  Faculty[]
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

model Faculty {
  id           String        @id @default(uuid())
  campusId     String
  campus       Campus        @relation(fields: [campusId], references: [id])
  name         String
  code         String
  isActive     Boolean       @default(true)
  programmes   Programme[]
  courseUnits  CourseUnit[]
  users        User[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model Programme {
  id               String           @id @default(uuid())
  facultyId        String
  faculty          Faculty          @relation(fields: [facultyId], references: [id])
  name             String
  code             String
  isActive         Boolean          @default(true)
  curriculumUnits  CurriculumUnit[]
  students         User[]
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
}

model CourseUnit {
  id                  String               @id @default(uuid())
  facultyId           String
  faculty             Faculty              @relation(fields: [facultyId], references: [id])
  code                String
  name                String
  isActive            Boolean              @default(true)
  curriculumUnits     CurriculumUnit[]
  enrollments         Enrollment[]
  lecturerAssignments LecturerAssignment[]
  sessions            Session[]
  attendanceAlerts    AttendanceAlert[]
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
}

model CurriculumUnit {
  id            String     @id @default(uuid())
  courseUnitId  String
  courseUnit    CourseUnit @relation(fields: [courseUnitId], references: [id])
  programmeId   String
  programme     Programme  @relation(fields: [programmeId], references: [id])
  year          Int
  semester      Int
  academicYear  String
  createdAt     DateTime   @default(now())

  @@unique([courseUnitId, programmeId, year, semester, academicYear])
}

model User {
  id               String               @id @default(uuid())
  googleId         String               @unique
  email            String               @unique
  fullName         String
  role             Role
  facultyId        String?
  faculty          Faculty?             @relation(fields: [facultyId], references: [id])
  programmeId      String?
  programme        Programme?           @relation(fields: [programmeId], references: [id])
  year             Int?
  semester         Int?
  regNumber        String?
  profileComplete  Boolean              @default(false)
  isActive         Boolean              @default(true)
  enrollments      Enrollment[]
  assignments      LecturerAssignment[] @relation("LecturerAssignments")
  assignedBy       LecturerAssignment[] @relation("AssignedByAdmin")
  sessionsOpened   Session[]
  attendanceRecords AttendanceRecord[]
  attendanceEdits  AttendanceEdit[]
  attendanceAlerts AttendanceAlert[]
  refreshTokens    RefreshToken[]
  auditLogs        AuditLog[]
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt
}

enum Role {
  system_admin
  faculty_admin
  lecturer
  student
}

model Enrollment {
  id            String     @id @default(uuid())
  studentId     String
  student       User       @relation(fields: [studentId], references: [id])
  courseUnitId  String
  courseUnit    CourseUnit @relation(fields: [courseUnitId], references: [id])
  academicYear  String
  semester      Int
  enrolledAt    DateTime   @default(now())

  @@unique([studentId, courseUnitId, academicYear, semester])
}

model LecturerAssignment {
  id            String     @id @default(uuid())
  lecturerId    String
  lecturer      User       @relation("LecturerAssignments", fields: [lecturerId], references: [id])
  courseUnitId  String
  courseUnit    CourseUnit @relation(fields: [courseUnitId], references: [id])
  academicYear  String
  semester      Int
  assignedById  String
  assignedBy    User       @relation("AssignedByAdmin", fields: [assignedById], references: [id])
  assignedAt    DateTime   @default(now())

  @@unique([lecturerId, courseUnitId, academicYear, semester])
}

model Session {
  id               String             @id @default(uuid())
  courseUnitId     String
  courseUnit       CourseUnit         @relation(fields: [courseUnitId], references: [id])
  lecturerId       String
  lecturer         User               @relation(fields: [lecturerId], references: [id])
  academicYear     String
  semester         Int
  code             String             @db.VarChar(8)
  codeExpiresAt    DateTime
  status           SessionStatus      @default(open)
  venue            String?
  openedAt         DateTime           @default(now())
  closedAt         DateTime?
  attendanceRecords AttendanceRecord[]

  @@index([code])
  @@index([courseUnitId, status])
}

enum SessionStatus {
  open
  closed
}

model AttendanceRecord {
  id            String           @id @default(uuid())
  sessionId     String
  session       Session          @relation(fields: [sessionId], references: [id])
  studentId     String
  student       User             @relation(fields: [studentId], references: [id])
  status        AttendanceStatus
  checkedInAt   DateTime?
  createdAt     DateTime         @default(now())
  edits         AttendanceEdit[]

  @@unique([sessionId, studentId])
}

enum AttendanceStatus {
  present
  absent
  excused
}

model AttendanceEdit {
  id                  String           @id @default(uuid())
  attendanceRecordId  String
  attendanceRecord    AttendanceRecord @relation(fields: [attendanceRecordId], references: [id])
  changedById         String
  changedBy           User             @relation(fields: [changedById], references: [id])
  oldStatus           AttendanceStatus
  newStatus           AttendanceStatus
  reason              String           @db.Text
  changedAt           DateTime         @default(now())
}

model AttendanceAlert {
  id             String      @id @default(uuid())
  studentId      String
  student        User        @relation(fields: [studentId], references: [id])
  courseUnitId   String
  courseUnit     CourseUnit  @relation(fields: [courseUnitId], references: [id])
  alertType      AlertType
  attendancePct  Decimal     @db.Decimal(5, 2)
  sentAt         DateTime    @default(now())
  resolved       Boolean     @default(false)
}

enum AlertType {
  warning
  critical
}

model RefreshToken {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  tokenHash  String
  expiresAt  DateTime
  revoked    Boolean  @default(false)
  createdAt  DateTime @default(now())
}

model AuditLog {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  action      String   @db.VarChar(50)
  targetType  String   @db.VarChar(50)
  targetId    String
  meta        Json?
  createdAt   DateTime @default(now())
}
```
