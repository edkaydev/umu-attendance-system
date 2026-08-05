# 05 — Database Schema

## Entity Relationship Summary

```
Campus ──< Faculty ──< Programme ──< CurriculumUnit >── CourseUnit
                  ──< CourseUnit (owning faculty)
                  ──< CourseUnitFaculty (shared faculties)

User >──< CourseUnit   (via Enrollment — students)
User >──< CourseUnit   (via LecturerAssignment — lecturers)

CourseUnit ──< Session ──< AttendanceRecord >── User (student)
Session.lecturer ──> User (lecturer)

User ──< AttendanceAlert
User ──< AuditLog
User ──< RefreshToken

SystemSetting (key/value store — global settings like current period)
```

---

## Tables

### `campuses`
| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `name` | VARCHAR(100) | e.g. "Nkozi Campus" |
| `code` | VARCHAR(20) UNIQUE | e.g. "NKZ" |
| `is_active` | BOOLEAN | Default true |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `faculties`
| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `campus_id` | FK → campuses | |
| `name` | VARCHAR(100) | e.g. "Faculty of Science" |
| `code` | VARCHAR(20) | e.g. "SCI" |
| `is_active` | BOOLEAN | Default true |
| UNIQUE | (`campus_id`, `code`) | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `programmes`
| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `faculty_id` | FK → faculties | |
| `name` | VARCHAR(150) | e.g. "Bachelor of Computer Science" |
| `code` | VARCHAR(20) | e.g. "BSCS" |
| `is_active` | BOOLEAN | Default true |
| UNIQUE | (`faculty_id`, `code`) | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `course_units`
| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `faculty_id` | FK → faculties | Owner faculty |
| `code` | VARCHAR(20) | e.g. "CSC3301" |
| `name` | VARCHAR(150) | e.g. "Database Systems" |
| `is_active` | BOOLEAN | Default true |
| UNIQUE | (`faculty_id`, `code`) | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `course_unit_faculties`
Tracks additional faculties that share a course unit beyond its owner.
Used for cross-faculty sharing and access scoping (FA Admin sees shared units).

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `course_unit_id` | FK → course_units | |
| `faculty_id` | FK → faculties | Shared-to faculty |
| `created_at` | DATETIME | |
| UNIQUE | (`course_unit_id`, `faculty_id`) | |

---

### `curriculum_units`
Maps a course unit to a Programme + Year + Semester + Academic Year combination.
This is how a unit is associated with a specific programme path.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `course_unit_id` | FK → course_units | |
| `programme_id` | FK → programmes | |
| `year` | TINYINT | 1–4 |
| `semester` | TINYINT | 1 or 2 |
| `academic_year` | VARCHAR(10) | e.g. "2025/2026" |
| `created_at` | DATETIME | |
| UNIQUE | (`course_unit_id`, `programme_id`, `year`, `semester`, `academic_year`) | |

---

### `users`
All system users in one table. Role determines access.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `google_id` | VARCHAR(100) UNIQUE | From Google OAuth |
| `email` | VARCHAR(150) UNIQUE | |
| `full_name` | VARCHAR(100) | From Google profile |
| `role` | ENUM | `system_admin`, `faculty_admin`, `lecturer`, `student` |
| `faculty_id` | FK → faculties nullable | Set during profile setup |
| `programme_id` | FK → programmes nullable | Students only |
| `year` | TINYINT nullable | Students only |
| `semester` | TINYINT nullable | Students only (current semester) |
| `academic_year` | VARCHAR(10) nullable | Students only |
| `reg_number` | VARCHAR(30) nullable | Students only — self-entered |
| `profile_complete` | BOOLEAN | False until profile setup done |
| `is_active` | BOOLEAN | Deactivated users blocked on every request |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### `enrollments`
Links students to course units for a given academic period.
Auto-created when a student completes or edits their profile.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `student_id` | FK → users | Role must be `student` |
| `course_unit_id` | FK → course_units | |
| `academic_year` | VARCHAR(10) | e.g. "2025/2026" |
| `semester` | TINYINT | 1 or 2 |
| `enrolled_at` | DATETIME | |
| UNIQUE | (`student_id`, `course_unit_id`, `academic_year`, `semester`) | |

---

### `lecturer_assignments`
Links lecturers to course units. Set by Faculty Admin.
One lecturer per course unit per academic period (enforced with unique index + UI filter).

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `lecturer_id` | FK → users | Role must be `lecturer` |
| `course_unit_id` | FK → course_units | |
| `academic_year` | VARCHAR(10) | |
| `semester` | TINYINT | |
| `assigned_by_id` | FK → users | Faculty Admin who assigned |
| `assigned_at` | DATETIME | |
| UNIQUE | (`lecturer_id`, `course_unit_id`, `academic_year`, `semester`) | |

---

### `sessions`
Each attendance session opened by a lecturer.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `course_unit_id` | FK → course_units | |
| `lecturer_id` | FK → users | Who opened — scopes ownership |
| `academic_year` | VARCHAR(10) | |
| `semester` | TINYINT | |
| `code` | VARCHAR(8) | 6-char, safe alphabet |
| `code_expires_at` | DATETIME | Configurable TTL (5–60 min) |
| `status` | ENUM | `open`, `closed` |
| `venue` | VARCHAR(100) nullable | Physical venue / meeting link |
| `mode` | ENUM | `physical`, `online` |
| `starts_at` | DATETIME nullable | Optional scheduled start |
| `class_duration` | INT nullable | Minutes; triggers auto-close if set |
| `code_ttl` | INT nullable | Code validity in minutes (used on reopen) |
| `opened_at` | DATETIME | |
| `closed_at` | DATETIME nullable | |
| INDEX | `code` | Fast lookup on student check-in |
| INDEX | (`course_unit_id`, `status`) | Fast "open session?" check |

---

### `attendance_records`
One row per student per session. Present on check-in; Absent auto-inserted on close.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `session_id` | FK → sessions | |
| `student_id` | FK → users | |
| `status` | ENUM | `present`, `absent`, `excused` |
| `checked_in_at` | DATETIME nullable | Set when student submits code |
| `created_at` | DATETIME | |
| UNIQUE | (`session_id`, `student_id`) | One record per student per session |

---

### `attendance_edits`
Audit trail for every manual attendance change. Lecturer only, own closed sessions.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `attendance_record_id` | FK → attendance_records | |
| `changed_by_id` | FK → users | Lecturer who changed it |
| `old_status` | ENUM | |
| `new_status` | ENUM | |
| `reason` | TEXT | Required — non-empty |
| `changed_at` | DATETIME | |

---

### `attendance_alerts`
Tracks which threshold alerts have been sent. Prevents duplicate emails.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `student_id` | FK → users | |
| `course_unit_id` | FK → course_units | |
| `alert_type` | ENUM | `warning` (≤80%), `critical` (<75%) |
| `attendance_pct` | DECIMAL(5,2) | Percentage at time of alert |
| `sent_at` | DATETIME | |
| `resolved` | BOOLEAN | True if student recovers above threshold |

---

### `refresh_tokens`
JWT refresh token rotation store.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `user_id` | FK → users | |
| `token_hash` | VARCHAR(255) | SHA-256 of the raw token |
| `expires_at` | DATETIME | 7 days |
| `revoked` | BOOLEAN | Set true on rotation or logout |
| `created_at` | DATETIME | |

---

### `audit_logs`
System-level action log. Visible to Faculty Admin and System Admin.

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `user_id` | FK → users | Who performed the action |
| `action` | VARCHAR(50) | e.g. `LOGIN`, `SESSION_OPEN`, `SESSION_CLOSE`, `ATTENDANCE_EDIT`, `PDF_DOWNLOAD` |
| `target_type` | VARCHAR(50) | e.g. `session`, `attendance_record`, `user` |
| `target_id` | VARCHAR(36) | ID of the affected record |
| `meta` | JSON nullable | Extra context |
| `created_at` | DATETIME | |
| INDEX | `user_id`, `action`, `created_at` | |

---

### `system_settings`
Key/value store for global settings managed by System Admin.

| Column | Type | Notes |
|---|---|---|
| `key` | VARCHAR(50) PK | e.g. `current_period`, `profile_editing` |
| `value` | VARCHAR(100) | JSON string or plain value |
| `updated_at` | DATETIME | |

Currently used keys:
- `current_period` — `{ "academicYear": "2025/2026", "semester": 1 }` — read by all non-admin pages
- `profile_editing` — `{ "students": true, "lecturers": true, "admins": false }` — controls whether profile editing is enabled per role

---

## Computed Values (calculated at query time, not stored)

| Value | Calculation |
|---|---|
| Total closed sessions for a unit | `COUNT sessions WHERE course_unit_id = X AND status = 'closed'` |
| Student attendance % | `(COUNT present + COUNT excused) / total closed sessions × 100` |
| Students below threshold | Filter above result per unit |
| Class average | Average of all student percentages in a unit |

---

## Actual Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Campus {
  id        String    @id @default(uuid())
  name      String    @db.VarChar(100)
  code      String    @unique @db.VarChar(20)
  isActive  Boolean   @default(true)
  faculties Faculty[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  @@map("campuses")
}

model Faculty {
  id                String              @id @default(uuid())
  campusId          String
  campus            Campus              @relation(fields: [campusId], references: [id])
  name              String              @db.VarChar(100)
  code              String              @db.VarChar(20)
  isActive          Boolean             @default(true)
  programmes        Programme[]
  courseUnits       CourseUnit[]
  sharedCourseUnits CourseUnitFaculty[]
  users             User[]
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  @@unique([campusId, code])
  @@map("faculties")
}

model Programme {
  id              String           @id @default(uuid())
  facultyId       String
  faculty         Faculty          @relation(fields: [facultyId], references: [id])
  name            String           @db.VarChar(150)
  code            String           @db.VarChar(20)
  isActive        Boolean          @default(true)
  curriculumUnits CurriculumUnit[]
  students        User[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  @@unique([facultyId, code])
  @@map("programmes")
}

model CourseUnit {
  id                  String               @id @default(uuid())
  facultyId           String
  faculty             Faculty              @relation(fields: [facultyId], references: [id])
  code                String               @db.VarChar(20)
  name                String               @db.VarChar(150)
  isActive            Boolean              @default(true)
  curriculumUnits     CurriculumUnit[]
  enrollments         Enrollment[]
  lecturerAssignments LecturerAssignment[]
  sessions            Session[]
  attendanceAlerts    AttendanceAlert[]
  sharedFaculties     CourseUnitFaculty[]
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  @@unique([facultyId, code])
  @@map("course_units")
}

model CourseUnitFaculty {
  id           String     @id @default(uuid())
  courseUnitId String
  courseUnit   CourseUnit @relation(fields: [courseUnitId], references: [id])
  facultyId    String
  faculty      Faculty    @relation(fields: [facultyId], references: [id])
  createdAt    DateTime   @default(now())
  @@unique([courseUnitId, facultyId])
  @@map("course_unit_faculties")
}

model CurriculumUnit {
  id           String     @id @default(uuid())
  courseUnitId String
  courseUnit   CourseUnit @relation(fields: [courseUnitId], references: [id])
  programmeId  String
  programme    Programme  @relation(fields: [programmeId], references: [id])
  year         Int        @db.TinyInt
  semester     Int        @db.TinyInt
  academicYear String     @db.VarChar(10)
  createdAt    DateTime   @default(now())
  @@unique([courseUnitId, programmeId, year, semester, academicYear])
  @@map("curriculum_units")
}

model User {
  id                  String               @id @default(uuid())
  googleId            String               @unique @db.VarChar(100)
  email               String               @unique @db.VarChar(150)
  fullName            String               @db.VarChar(100)
  role                Role
  facultyId           String?
  faculty             Faculty?             @relation(fields: [facultyId], references: [id])
  programmeId         String?
  programme           Programme?           @relation(fields: [programmeId], references: [id])
  year                Int?                 @db.TinyInt
  semester            Int?                 @db.TinyInt
  academicYear        String?              @db.VarChar(10)
  regNumber           String?              @db.VarChar(30)
  profileComplete     Boolean              @default(false)
  isActive            Boolean              @default(true)
  enrollments         Enrollment[]
  lecturerAssignments LecturerAssignment[] @relation("LecturerAssignments")
  assignmentsMade     LecturerAssignment[] @relation("AssignedByAdmin")
  sessionsOpened      Session[]
  attendanceRecords   AttendanceRecord[]
  attendanceEdits     AttendanceEdit[]
  attendanceAlerts    AttendanceAlert[]
  refreshTokens       RefreshToken[]
  auditLogs           AuditLog[]
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  @@map("users")
}

enum Role { system_admin  faculty_admin  lecturer  student }

model Enrollment {
  id           String     @id @default(uuid())
  studentId    String
  student      User       @relation(fields: [studentId], references: [id])
  courseUnitId String
  courseUnit   CourseUnit @relation(fields: [courseUnitId], references: [id])
  academicYear String     @db.VarChar(10)
  semester     Int        @db.TinyInt
  enrolledAt   DateTime   @default(now())
  @@unique([studentId, courseUnitId, academicYear, semester])
  @@map("enrollments")
}

model LecturerAssignment {
  id           String     @id @default(uuid())
  lecturerId   String
  lecturer     User       @relation("LecturerAssignments", fields: [lecturerId], references: [id])
  courseUnitId String
  courseUnit   CourseUnit @relation(fields: [courseUnitId], references: [id])
  academicYear String     @db.VarChar(10)
  semester     Int        @db.TinyInt
  assignedById String
  assignedBy   User       @relation("AssignedByAdmin", fields: [assignedById], references: [id])
  assignedAt   DateTime   @default(now())
  @@unique([lecturerId, courseUnitId, academicYear, semester])
  @@map("lecturer_assignments")
}

model Session {
  id                String             @id @default(uuid())
  courseUnitId      String
  courseUnit        CourseUnit         @relation(fields: [courseUnitId], references: [id])
  lecturerId        String
  lecturer          User               @relation(fields: [lecturerId], references: [id])
  academicYear      String             @db.VarChar(10)
  semester          Int                @db.TinyInt
  code              String             @db.VarChar(8)
  codeExpiresAt     DateTime
  status            SessionStatus      @default(open)
  venue             String?            @db.VarChar(100)
  mode              SessionMode        @default(physical)
  startsAt          DateTime?
  classDuration     Int?
  codeTtl           Int?
  openedAt          DateTime           @default(now())
  closedAt          DateTime?
  attendanceRecords AttendanceRecord[]
  @@index([code])
  @@index([courseUnitId, status])
  @@map("sessions")
}

enum SessionStatus { open  closed }
enum SessionMode   { physical  online }

model AttendanceRecord {
  id          String           @id @default(uuid())
  sessionId   String
  session     Session          @relation(fields: [sessionId], references: [id])
  studentId   String
  student     User             @relation(fields: [studentId], references: [id])
  status      AttendanceStatus
  checkedInAt DateTime?
  createdAt   DateTime         @default(now())
  edits       AttendanceEdit[]
  @@unique([sessionId, studentId])
  @@map("attendance_records")
}

enum AttendanceStatus { present  absent  excused }

model AttendanceEdit {
  id                 String           @id @default(uuid())
  attendanceRecordId String
  attendanceRecord   AttendanceRecord @relation(fields: [attendanceRecordId], references: [id])
  changedById        String
  changedBy          User             @relation(fields: [changedById], references: [id])
  oldStatus          AttendanceStatus
  newStatus          AttendanceStatus
  reason             String           @db.Text
  changedAt          DateTime         @default(now())
  @@map("attendance_edits")
}

model AttendanceAlert {
  id            String     @id @default(uuid())
  studentId     String
  student       User       @relation(fields: [studentId], references: [id])
  courseUnitId  String
  courseUnit    CourseUnit @relation(fields: [courseUnitId], references: [id])
  alertType     AlertType
  attendancePct Decimal    @db.Decimal(5, 2)
  sentAt        DateTime   @default(now())
  resolved      Boolean    @default(false)
  @@map("attendance_alerts")
}

enum AlertType { warning  critical }

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  tokenHash String   @db.VarChar(255)
  expiresAt DateTime
  revoked   Boolean  @default(false)
  createdAt DateTime @default(now())
  @@map("refresh_tokens")
}

model AuditLog {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  action     String   @db.VarChar(50)
  targetType String   @db.VarChar(50)
  targetId   String   @db.VarChar(36)
  meta       Json?
  createdAt  DateTime @default(now())
  @@index([userId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}

model SystemSetting {
  key       String   @id @db.VarChar(50)
  value     String   @db.VarChar(100)
  updatedAt DateTime @updatedAt
  @@map("system_settings")
}
```
