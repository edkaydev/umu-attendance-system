# 02 — Functional Requirements

## FR-01: Authentication

| ID | Requirement |
|---|---|
| FR-01.1 | All users log in via Google OAuth only — no passwords |
| FR-01.2 | Students must use a `@stud.umu.ac.ug` Google account |
| FR-01.3 | System Admin, Faculty Admin, and Lecturers must use a `@umu.ac.ug` Google account |
| FR-01.4 | On first login, if the user has no profile, redirect to Complete Profile page |
| FR-01.5 | Role is determined by the role assigned to the user's email in the database |
| FR-01.6 | If a Google account is not registered in the system, show "Access denied — contact your administrator" |
| FR-01.7 | Sessions are managed via JWT stored in an HttpOnly cookie |
| FR-01.8 | JWT access token expires after 1 hour; refresh token rotates silently |
| FR-01.9 | Logging out clears the JWT cookie and invalidates the refresh token |

---

## FR-02: Profile Completion

| ID | Requirement |
|---|---|
| FR-02.1 | After first Google login, students are redirected to a Complete Profile page |
| FR-02.2 | Student selects: Campus → Faculty → Programme → Year → Semester |
| FR-02.3 | Student enters their Registration Number |
| FR-02.4 | System auto-enrols the student into all course units mapped to their selected path |
| FR-02.5 | Student can edit their profile at any time — programme, year, semester, reg number |
| FR-02.6 | When a student edits their academic path, enrolments are recalculated automatically |
| FR-02.7 | After first Google login, lecturers are redirected to a Complete Profile page |
| FR-02.8 | Lecturer selects their Faculty only — unit assignment is done by Faculty Admin |
| FR-02.9 | System Admin and Faculty Admin profiles are created by System Admin during staff import |

---

## FR-03: Academic Structure Setup (System Admin)

| ID | Requirement |
|---|---|
| FR-03.1 | System Admin can create, edit, and deactivate: Campuses, Faculties, Programmes, Years, Semesters |
| FR-03.2 | System Admin can create, edit, and deactivate Course Units |
| FR-03.3 | System Admin maps course units to one or more Programme + Year + Semester combinations (curriculum mapping) |
| FR-03.4 | A course unit can be shared — mapped to multiple programmes in the same year and semester |
| FR-03.5 | System Admin can import academic structure via CSV templates (Faculties, Programmes, Course Units, Curriculum) |
| FR-03.6 | System Admin can create staff accounts by importing a CSV with: name, email, role |
| FR-03.7 | Imported staff appear in the system and can log in via Google immediately |
| FR-03.8 | System Admin can deactivate any user account — deactivated accounts cannot log in |
| FR-03.9 | System Admin has a dashboard showing: total users, active sessions today, system health indicators |

---

## FR-04: Lecturer Assignment (Faculty Admin)

| ID | Requirement |
|---|---|
| FR-04.1 | Faculty Admin can assign a lecturer to one or more course units within their faculty |
| FR-04.2 | A lecturer can be assigned to course units across multiple programmes |
| FR-04.3 | Faculty Admin can remove a lecturer from a course unit |
| FR-04.4 | A course unit can have multiple lecturers assigned |
| FR-04.5 | Lecturer can only see and manage course units they are assigned to |

---

## FR-05: Attendance Sessions

| ID | Requirement |
|---|---|
| FR-05.1 | A lecturer can open an attendance session for any course unit assigned to them |
| FR-05.2 | Opening a session generates a unique 6-character alphanumeric code |
| FR-05.3 | Code uses safe characters only — pool: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O/0, I/1, B/8, S/5) |
| FR-05.4 | The code is valid for 5 minutes from the time the session is opened |
| FR-05.5 | The code is displayed prominently on the lecturer's screen |
| FR-05.6 | Only one active session per course unit is allowed at a time |
| FR-05.7 | The lecturer can close the session manually at any time |
| FR-05.8 | When the session closes, all enrolled students without a check-in are auto-marked Absent |
| FR-05.9 | The lecturer can reopen a session on the same day to correct errors |
| FR-05.10 | Each session records: date, open time, close time, course unit, lecturer, optional venue |
| FR-05.11 | The lecturer's live view shows a real-time count and list of students who have checked in |

---

## FR-06: Student Check-In

| ID | Requirement |
|---|---|
| FR-06.1 | A logged-in student can enter a session code to mark themselves present |
| FR-06.2 | The system validates: code exists, code has not expired, student is enrolled in the course unit |
| FR-06.3 | A student can only check in once per session |
| FR-06.4 | On successful check-in, student sees a confirmation: course unit name, date, status |
| FR-06.5 | If the code is wrong, expired, or the session is closed, student sees a clear error message |
| FR-06.6 | Students sharing a course unit across programmes all check in with the same code |

---

## FR-07: Attendance Records Management

| ID | Requirement |
|---|---|
| FR-07.1 | Every session stores one attendance record per enrolled student: Present, Absent, or Excused |
| FR-07.2 | Attendance percentage per student per course unit is calculated automatically |
| FR-07.3 | Formula: `(Present + Excused) / Total Closed Sessions × 100` |
| FR-07.4 | Lecturer can manually change any student's status after a session closes |
| FR-07.5 | Every manual edit requires a reason (text input) |
| FR-07.6 | Every manual edit is recorded in an audit log: student, old status, new status, reason, changed by, timestamp |
| FR-07.7 | Audit log is visible to Faculty Admin and System Admin only |

---

## FR-08: Alerts & Notifications

| ID | Requirement |
|---|---|
| FR-08.1 | When a student's attendance in a course unit drops to or below 80%, a WARNING alert is sent |
| FR-08.2 | When a student's attendance drops below 75%, a CRITICAL alert is sent |
| FR-08.3 | Each alert is sent to: the student, the course unit's lecturer(s), and the Faculty Admin |
| FR-08.4 | System Admin does not receive attendance alerts |
| FR-08.5 | Each alert type fires once per threshold crossing — not on every subsequent session |
| FR-08.6 | If attendance recovers above threshold and drops again, the alert fires again |
| FR-08.7 | Alerts are sent via email using Google SMTP |
| FR-08.8 | Alert email includes: student name, reg number, course unit, current percentage, sessions missed |

---

## FR-09: Dashboards

| Role | Dashboard Shows |
|---|---|
| Student | Enrolled units, attendance % per unit, eligibility status, recent check-ins, weekly chart |
| Lecturer | Assigned units, today's sessions, at-risk students, attendance trend per unit |
| Faculty Admin | Faculty overview, at-risk students count, lecturer performance summary, programme summary |
| System Admin | Total users, active sessions today, recent imports, system activity log |

---

## FR-10: Reports & PDF Export (Faculty Admin)

| ID | Requirement |
|---|---|
| FR-10.1 | Faculty Admin can generate a PDF report on a specific lecturer |
| FR-10.2 | Faculty Admin can generate a PDF report on a specific programme |
| FR-10.3 | Faculty Admin can generate a PDF report on a specific course unit |
| FR-10.4 | Faculty Admin can generate a PDF report on a specific student |
| FR-10.5 | All PDFs include the official UMU badge, university name, faculty name, and report date |
| FR-10.6 | Lecturer report shows: units taught, sessions held, average class attendance per unit |
| FR-10.7 | Programme report shows: enrolled students, average attendance, units below threshold |
| FR-10.8 | Course unit report shows: enrolled students, sessions held, attendance per student, average |
| FR-10.9 | Student report shows: all enrolled units, % per unit, weekly chart, eligibility per unit |
| FR-10.10 | Lecturers can download a PDF attendance summary for their own course units |

---

## FR-11: Progressive Web App (PWA)

| ID | Requirement |
|---|---|
| FR-11.1 | The app must be installable via "Add to Home Screen" on Android, iOS, and desktop |
| FR-11.2 | A valid web manifest must exist: name, icons, theme colour (maroon `#7B1C2E`) |
| FR-11.3 | A service worker must be registered so the app shell loads on slow connections |
| FR-11.4 | No offline data sync is required |
