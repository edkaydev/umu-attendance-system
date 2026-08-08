# 02 — Functional Requirements

## FR-01: Authentication

| ID | Requirement | Status |
|---|---|---|
| FR-01.1 | Users log in via Google OAuth **or** email + password (local auth) | ✅ Built |
| FR-01.2 | Students must use a `@stud.umu.ac.ug` Google account (Google path) | ✅ Built |
| FR-01.3 | Staff must use a `@umu.ac.ug` Google account (Google path) | ✅ Built |
| FR-01.4 | On first login with no profile, redirect to Complete Profile page | ✅ Built |
| FR-01.5 | Role is determined by the role assigned in the database | ✅ Built |
| FR-01.6 | Unregistered Google accounts see "Access denied" | ✅ Built |
| FR-01.7 | Sessions managed via JWT in HttpOnly cookie | ✅ Built |
| FR-01.8 | JWT access token expires after 1 hour; refresh token rotates silently | ✅ Built |
| FR-01.9 | Logout clears JWT cookie and invalidates refresh token | ✅ Built |
| FR-01.10 | Deactivated accounts are blocked on every request (re-fetched from DB each time) | ✅ Built |
| FR-01.11 | Accounts created by System Admin receive a default password; `mustChangePassword` flag forces change on first login | ✅ Built |

---

## FR-02: Profile Completion

| ID | Requirement | Status |
|---|---|---|
| FR-02.1 | After first login, students redirected to Complete Profile | ✅ Built |
| FR-02.2 | Student selects: Campus → Faculty → Programme → Year → Semester → Academic Year | ✅ Built |
| FR-02.3 | Student enters their Registration Number | ✅ Built |
| FR-02.4 | System auto-enrols student into all course units mapped to their path | ✅ Built |
| FR-02.5 | Student can edit profile at any time | ✅ Built |
| FR-02.6 | On profile edit, enrolments are recalculated automatically | ✅ Built |
| FR-02.7 | After first login, lecturers redirected to Complete Profile | ✅ Built |
| FR-02.8 | Lecturer selects their Faculty only | ✅ Built |
| FR-02.9 | Profile editing can be enabled/disabled per role by System Admin | ✅ Built |

---

## FR-03: Academic Structure Setup (System Admin)

| ID | Requirement | Status |
|---|---|---|
| FR-03.1 | System Admin creates and edits: Campuses, Faculties, Programmes, Course Units | ✅ Built |
| FR-03.2 | System Admin maps course units to Programme + Year + Semester (curriculum) | ✅ Built |
| FR-03.3 | Course units can be shared across programmes | ✅ Built |
| FR-03.4 | System Admin imports academic structure via CSV | ✅ Built |
| FR-03.5 | System Admin imports staff accounts via CSV | ✅ Built |
| FR-03.6 | System Admin deactivates/reactivates user accounts | ✅ Built |
| FR-03.7 | System Admin sets the global current academic year and semester | ✅ Built |
| FR-03.8 | All other roles read the current period from System Admin's setting — no manual selection | ✅ Built |

---

## FR-04: Lecturer Assignment (Faculty Admin)

| ID | Requirement | Status |
|---|---|---|
| FR-04.1 | Faculty Admin assigns a lecturer to course units within their faculty | ✅ Built |
| FR-04.2 | Faculty Admin removes a lecturer from a course unit | ✅ Built |
| FR-04.3 | One lecturer per course unit per academic period (enforced server-side + UI filters) | ✅ Built |
| FR-04.4 | Units already assigned to another lecturer are hidden from the dropdown | ✅ Built |
| FR-04.5 | Lecturer can only see and manage units they are assigned to | ✅ Built |

---

## FR-05: Attendance Sessions

| ID | Requirement | Status |
|---|---|---|
| FR-05.1 | Lecturer opens a session for any assigned course unit | ✅ Built |
| FR-05.2 | Opening generates a unique 6-character alphanumeric code | ✅ Built |
| FR-05.3 | Code pool: `ACDEFGHJKLMNPQRTUVWXYZ234679` (no ambiguous chars O/0/I/1/B/8/S/5) | ✅ Built |
| FR-05.4 | Code validity is configurable (5–60 minutes); default 5 min | ✅ Built |
| FR-05.5 | Lecturer can extend the code expiry without closing the session (+5 min) | ✅ Built |
| FR-05.6 | Session auto-closes after `classDuration` elapses (server-side scheduler, ticks every 60 s) | ✅ Built |
| FR-05.7 | Only one active session per course unit is allowed at a time | ✅ Built |
| FR-05.8 | Lecturer can close the session manually | ✅ Built |
| FR-05.9 | On close, enrolled students without a check-in are auto-marked Absent | ✅ Built |
| FR-05.10 | Lecturer can reopen a session on the same calendar day (EAT) | ✅ Built |
| FR-05.11 | Each session records: date, open/close time, unit, lecturer, venue, mode | ✅ Built |
| FR-05.12 | Session mode: Physical or Online | ✅ Built |
| FR-05.13 | Live view shows real-time count and list of checked-in students (5-second poll) | ✅ Built |
| FR-05.14 | Sessions list shows Today / All tabs; Today scoped to current EAT calendar day | ✅ Built |
| FR-05.15 | Live session screen shows class duration countdown (client-side, counts down from `openedAt + classDuration`) | ✅ Built |

---

## FR-06: Student Check-In

| ID | Requirement | Status |
|---|---|---|
| FR-06.1 | Logged-in student enters a session code to mark themselves present | ✅ Built |
| FR-06.2 | System validates: code exists, not expired, student enrolled in unit | ✅ Built |
| FR-06.3 | Student can only check in once per session (race-condition safe via DB unique + P2002 guard) | ✅ Built |
| FR-06.4 | On success, student sees: course unit name, date, status | ✅ Built |
| FR-06.5 | Wrong / expired / closed session shows a clear error | ✅ Built |
| FR-06.6 | Live sessions for enrolled units appear on student dashboard with countdown | ✅ Built |
| FR-06.7 | Students sharing a unit across programmes use the same code | ✅ Built |
| FR-06.8 | Physical sessions require student to be within campus geo-fence (haversine, 500 m radius, configurable via env) | ✅ Built |
| FR-06.9 | Check-in endpoint rate-limited: 10 attempts per student per 5-minute window | ✅ Built |

---

## FR-07: Attendance Records Management

| ID | Requirement | Status |
|---|---|---|
| FR-07.1 | Every session stores one record per enrolled student: Present, Absent, or Excused | ✅ Built |
| FR-07.2 | Attendance % per student per unit calculated automatically | ✅ Built |
| FR-07.3 | Formula: `(Present + Excused) / Total Closed Sessions × 100` | ✅ Built |
| FR-07.4 | When a unit has **zero closed sessions**, reports show `—` / "No sessions" instead of a misleading 100% | ✅ Built |
| FR-07.4 | Lecturer (own sessions only) can edit a student's status after close | ✅ Built |
| FR-07.5 | Faculty Admin is **read-only** on attendance records | ✅ Built |
| FR-07.6 | Every manual edit requires a reason | ✅ Built |
| FR-07.7 | Every edit is recorded in an audit log | ✅ Built |
| FR-07.8 | Editing is disabled while a session is still open | ✅ Built |

---

## FR-08: Alerts & Notifications

| ID | Requirement | Status |
|---|---|---|
| FR-08.1 | WARNING alert when attendance drops to or below 80% | ✅ Built |
| FR-08.2 | CRITICAL alert when attendance drops below 75% | ✅ Built |
| FR-08.3 | Alert sent to: student, course unit lecturer(s), Faculty Admin | ✅ Built |
| FR-08.4 | System Admin does not receive attendance alerts | ✅ Built |
| FR-08.5 | Each alert type fires once per threshold crossing | ✅ Built |
| FR-08.6 | If attendance recovers and drops again, a new alert fires | ✅ Built |
| FR-08.7 | Alerts sent via email (Google SMTP / Nodemailer) | ✅ Built |

---

## FR-09: Dashboards

| Role | Dashboard Shows | Status |
|---|---|---|
| Student | Enrolled units, % per unit, eligibility, live sessions, recent check-ins, weekly bar chart | ✅ Built |
| Lecturer | Assigned units, today's sessions (open/closed), at-risk students, open session banner with Go Live | ✅ Built |
| Faculty Admin | Faculty overview stats, students + lecturers tabs, programme progress bars, quick links | ✅ Built |
| System Admin | Total users by role, active sessions today, recent imports, recent system activity | ✅ Built |

---

## FR-10: Reports & PDF Export

| ID | Requirement | Status |
|---|---|---|
| FR-10.1 | Faculty Admin generates PDF: lecturer report | ✅ Built |
| FR-10.2 | Faculty Admin generates PDF: programme report | ✅ Built |
| FR-10.3 | Faculty Admin / Lecturer generates PDF: course unit report | ✅ Built |
| FR-10.4 | Faculty Admin generates PDF: student report | ✅ Built |
| FR-10.5 | All PDFs include UMU logo, faculty name, report date, period | ✅ Built |
| FR-10.6 | PDF download is two-step: Generate Report first, then Download unlocks | ✅ Built |
| FR-10.7 | PDF fetched via authenticated fetch (not plain `<a href>`) | ✅ Built |
| FR-10.8 | Downloaded file named meaningfully (unit code / lecturer name / reg number) | ✅ Built |
| FR-10.9 | Report period is locked to the System Admin's global period setting | ✅ Built |

---

## FR-11: Progressive Web App (PWA)

| ID | Requirement | Status |
|---|---|---|
| FR-11.1 | Installable via "Add to Home Screen" on Android, iOS, and desktop | ✅ Built |
| FR-11.2 | Web manifest: name, short name, icons (192 + 512 maskable), theme colour `#CC0000` | ✅ Built |
| FR-11.3 | Service worker registered (Workbox via vite-plugin-pwa, autoUpdate) | ✅ Built |
| FR-11.4 | Install prompt shown to users (InstallPrompt component) | ✅ Built |
| FR-11.5 | Students and Lecturers: full mobile + desktop support | ✅ Built |
| FR-11.6 | Faculty Admin and System Admin: desktop only (mobile shows "Desktop required" screen) | ✅ Built |

---

## FR-12: System Settings (System Admin)

| ID | Requirement | Status |
|---|---|---|
| FR-12.1 | System Admin sets and updates the global current academic year and semester | ✅ Built |
| FR-12.2 | System Admin enables/disables profile editing per role | ✅ Built |
| FR-12.3 | All non-admin pages read period from the global setting — users cannot override it | ✅ Built |
