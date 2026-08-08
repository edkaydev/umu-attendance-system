# 06 — API Design

## Base URL
```
https://attendance.umu.ac.ug/api
```

## Conventions
- All responses are JSON: `{ ...data }` on success, `{ error: "message" }` on failure
- Auth via HttpOnly JWT cookie (sent automatically by the browser)
- Dates: ISO 8601 strings (`2026-08-05T10:00:00.000Z`)
- Input validation: Zod schemas in every controller — unknown fields stripped
- Pagination: `?page=1&limit=20` where applicable

---

## Auth Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/auth/google` | Public | Redirect to Google consent screen |
| GET | `/auth/google/callback` | Public | OAuth callback — sets JWT HttpOnly cookies |
| POST | `/auth/login` | Public | Local email + password login |
| POST | `/auth/logout` | Authenticated | Clear cookies, revoke refresh token |
| POST | `/auth/refresh` | Authenticated | Silently rotate access token |
| GET | `/auth/me` | Authenticated | Get current user profile |
| POST | `/auth/password` | Authenticated | Change own password |
| POST | `/auth/dev-login` | Dev only | Quick login by role (disabled in production) |

---

## Profile Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| PUT | `/profile/complete` | Student, Lecturer | Complete profile after first login |
| PUT | `/profile` | Student, Lecturer | Edit own profile |

**PUT /profile/complete — Student body**
```json
{
  "campusId": "uuid",
  "facultyId": "uuid",
  "programmeId": "uuid",
  "year": 3,
  "semester": 1,
  "regNumber": "BSCS/2025/0001",
  "academicYear": "2025/2026"
}
```

**PUT /profile/complete — Lecturer body**
```json
{ "facultyId": "uuid" }
```

---

## Academic Structure Routes (System Admin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/academic/campuses` | List all campuses |
| POST | `/academic/campuses` | Create campus |
| PUT | `/academic/campuses/:id` | Edit campus |
| GET | `/academic/faculties` | List faculties |
| POST | `/academic/faculties` | Create faculty |
| PUT | `/academic/faculties/:id` | Edit faculty |
| GET | `/academic/programmes` | List programmes |
| POST | `/academic/programmes` | Create programme |
| PUT | `/academic/programmes/:id` | Edit programme |
| GET | `/academic/course-units` | List course units |
| POST | `/academic/course-units` | Create course unit |
| PUT | `/academic/course-units/:id` | Edit course unit |
| POST | `/academic/course-units/:id/faculties` | Share unit to another faculty |
| DELETE | `/academic/course-units/:id/faculties/:facultyId` | Remove faculty share |
| GET | `/academic/curriculum` | List all curriculum mappings |
| POST | `/academic/curriculum` | Map unit to programme + year + semester |
| DELETE | `/academic/curriculum/:id` | Remove curriculum mapping |
| GET | `/academic/options` | Campuses + faculties + programmes (for profile setup) |
| POST | `/academic/import/structure` | Bulk import via CSV |
| POST | `/academic/import/staff` | Bulk import staff accounts via CSV |

---

## User Management Routes (System Admin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | List users (filterable: `?role=lecturer&search=&page=&limit=`) |
| POST | `/users` | Create a new user account (assigns default password) |
| PATCH | `/users/:id` | Update user name/email/faculty |
| DELETE | `/users/:id` | Delete a user |
| POST | `/users/bulk-delete` | Bulk delete users (`{ userIds: [...] }` or `{ allMatching: true, role?, search? }`) |
| PATCH | `/users/:id/deactivate` | Deactivate account |
| PATCH | `/users/:id/activate` | Reactivate account |
| PATCH | `/users/:id/role` | Change user role (no longer exposed in the UI) |
| PATCH | `/users/:id/faculty` | Assign/unassign faculty |
| PATCH | `/users/:id/reset-password` | Reset user's password to system default (forces change on next login) |

---

## System Settings Routes (System Admin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/settings/current-period` | Get active academic year + semester |
| PATCH | `/settings/current-period` | Set active academic year + semester |
| GET | `/settings/profile-editing` | Get profile editing settings per role |
| PATCH | `/settings/profile-editing` | Update profile editing settings |

**GET /settings/current-period response**
```json
{ "period": { "academicYear": "2025/2026", "semester": 1 } }
```

---

## Enrollment Routes (Faculty Admin)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/enrollments/overview` | Course units + students + lecturers for FA's faculty |
| POST | `/enrollments` | Enrol a student in a course unit |
| DELETE | `/enrollments/:id` | Remove a student from a course unit |

---

## Lecturer Assignment Routes (Faculty Admin)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/assignments` | List all assignments in faculty |
| POST | `/assignments` | Assign lecturer to course unit |
| DELETE | `/assignments/:id` | Remove lecturer from course unit |

**POST /assignments body**
```json
{
  "lecturerId": "uuid",
  "courseUnitId": "uuid",
  "academicYear": "2025/2026",
  "semester": 1
}
```

---

## Session Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/sessions` | Lecturer | List own sessions (`?today=true`, `?date=YYYY-MM-DD`, `?status=open`) |
| POST | `/sessions` | Lecturer | Open new session |
| GET | `/sessions/faculty` | Faculty Admin | List all sessions in faculty |
| GET | `/sessions/:id` | Lecturer, Faculty Admin | Session detail + full attendance list |
| GET | `/sessions/:id/live` | Lecturer | Live check-in count (poll every 5s) |
| PATCH | `/sessions/:id/close` | Lecturer | Close session (auto-marks absences) |
| PATCH | `/sessions/:id/reopen` | Lecturer | Reopen closed session (same calendar day, EAT) |
| PATCH | `/sessions/:id/extend` | Lecturer | Extend code expiry by N minutes |

**POST /sessions body**
```json
{
  "courseUnitId": "uuid",
  "venue": "Room 2",
  "mode": "physical",
  "startsAt": "2026-08-05T10:00:00.000Z",
  "academicYear": "2025/2026",
  "semester": 1,
  "classDuration": 60,
  "codeTtl": 5
}
```

- `mode`: `"physical"` | `"online"`
- `classDuration`: 1–180 minutes; if set, session auto-closes
- `codeTtl`: 5–60 minutes; default 5

**PATCH /sessions/:id/extend body**
```json
{ "minutes": 10 }
```

**Response (open session)**
```json
{
  "session": {
    "id": "uuid",
    "code": "A4X7K2",
    "codeExpiresAt": "2026-08-05T07:05:00.000Z",
    "status": "open",
    "mode": "physical",
    "venue": "Room 2",
    "courseUnit": { "id": "uuid", "name": "Database Systems", "code": "CSC3301" }
  }
}
```

---

## Check-In Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/checkin` | Student | Submit session code |
| GET | `/checkin/live` | Student | List all open sessions for enrolled units |

**POST /checkin body**
```json
{ "code": "A4X7K2" }
```

Physical sessions also accept optional location:
```json
{ "code": "A4X7K2", "lat": 0.00389, "lng": 32.01353 }
```

**Success response**
```json
{
  "message": "Checked in successfully",
  "courseUnit": { "id": "uuid", "name": "Database Systems", "code": "CSC3301" },
  "date": "2026-08-05",
  "status": "present"
}
```

**Error responses**
```json
{ "error": "Invalid or expired code",                       "code": "INVALID_CODE" }
{ "error": "You are not enrolled in this course unit",      "code": "NOT_ENROLLED" }
{ "error": "You have already checked in to this session",   "code": "ALREADY_CHECKED_IN" }
{ "error": "Location is required to check in to a physical session", "code": "LOCATION_REQUIRED" }
{ "error": "You must be within the campus area to check in","code": "OUTSIDE_CAMPUS" }
{ "error": "Too many requests — please wait before trying again.", "code": "RATE_LIMITED" }
```

Rate limit: **10 requests per student per 5-minute window** on `POST /checkin`. Returns `429` with `Retry-After` header.

---

## Attendance Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/attendance/my` | Student | Own attendance per unit (current period) |
| GET | `/attendance/session/:sessionId` | Lecturer (own), Faculty Admin (own faculty) | Full attendance list for a session |
| PATCH | `/attendance/:recordId` | Lecturer (own closed sessions only) | Edit a single attendance record |
| GET | `/attendance/unit/:courseUnitId` | Lecturer, Faculty Admin | Attendance summary per student for a unit |

**PATCH /attendance/:recordId body**
```json
{
  "status": "excused",
  "reason": "Medical note submitted — verified by lecturer"
}
```

Constraints enforced server-side:
- Faculty Admin cannot edit attendance (403)
- Lecturer can only edit their own closed sessions (403 otherwise)
- Editing requires a non-empty reason

---

## Dashboard Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/dashboard/student` | Student | Units, %, live sessions, recent check-ins, weekly chart |
| GET | `/dashboard/lecturer` | Lecturer | Assigned units, today's sessions, at-risk students |
| GET | `/dashboard/faculty-admin` | Faculty Admin | Faculty overview, alerts, lecturer + programme summaries |
| GET | `/dashboard/system-admin` | System Admin | User counts, active sessions, recent imports, activity |

---

## Report Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/reports/lecturer/:lecturerId` | Faculty Admin | Lecturer JSON report |
| GET | `/reports/programme/:programmeId` | Faculty Admin | Programme JSON report |
| GET | `/reports/course-unit/:courseUnitId` | Lecturer, Faculty Admin | Course unit JSON report |
| GET | `/reports/student/:studentId` | Faculty Admin | Student JSON report |
| GET | `/reports/lecturer/:lecturerId/pdf` | Faculty Admin | Download lecturer PDF |
| GET | `/reports/programme/:programmeId/pdf` | Faculty Admin | Download programme PDF |
| GET | `/reports/course-unit/:courseUnitId/pdf` | Lecturer, Faculty Admin | Download unit PDF |
| GET | `/reports/student/:studentId/pdf` | Faculty Admin | Download student PDF |

All report endpoints require:
```
?academicYear=2025%2F2026&semester=1
```

PDF endpoints return `Content-Disposition: attachment` with a meaningful filename.
The client must fetch these with `credentials: 'include'` (not a plain `<a href>`).

---

## Audit Log Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/audit-logs` | Faculty Admin, System Admin | Paginated audit log |

Query params: `?action=ATTENDANCE_EDIT&page=1&limit=20`

---

## Alert Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/alerts` | Faculty Admin | List attendance alerts for faculty |

Query params: `?resolved=false&page=1&limit=20`

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad request (validation error, business rule violation) |
| 401 | Unauthenticated (no/invalid/expired JWT) |
| 403 | Forbidden (wrong role, or wrong data scope) |
| 404 | Resource not found |
| 409 | Conflict (e.g. session already open for this unit) |
| 429 | Too many requests (rate limit exceeded — see `Retry-After` header) |
| 500 | Internal server error |
