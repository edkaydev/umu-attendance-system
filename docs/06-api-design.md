# 06 — API Design

## Base URL
```
https://attendance.umu.ac.ug/api
```

## Conventions
- All responses are JSON
- Auth via HttpOnly JWT cookie (sent automatically by browser)
- Dates in ISO 8601: `2026-08-04T10:00:00Z`
- Errors follow: `{ "error": "message" }`
- Pagination: `?page=1&limit=20`

---

## Auth Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/auth/google` | Public | Redirect to Google consent screen |
| GET | `/auth/google/callback` | Public | Google OAuth callback, sets JWT cookie |
| POST | `/auth/logout` | All roles | Clear JWT cookie, revoke refresh token |
| POST | `/auth/refresh` | All roles | Silently rotate access token |
| GET | `/auth/me` | All roles | Get current user profile |

---

## Profile Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| PUT | `/profile/complete` | Student, Lecturer | Complete profile after first login |
| PUT | `/profile` | Student, Lecturer | Edit own profile |

**PUT /profile/complete (Student body)**
```json
{
  "campusId": "uuid",
  "facultyId": "uuid",
  "programmeId": "uuid",
  "year": 3,
  "semester": 1,
  "regNumber": "21/U/1234",
  "academicYear": "2025/2026"
}
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
| GET | `/academic/programmes` | List programmes |
| POST | `/academic/programmes` | Create programme |
| GET | `/academic/course-units` | List course units |
| POST | `/academic/course-units` | Create course unit |
| POST | `/academic/curriculum` | Map course unit to programme+year+semester |
| POST | `/academic/import/structure` | Bulk import via CSV |
| POST | `/academic/import/staff` | Bulk import staff accounts via CSV |

---

## User Management Routes (System Admin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | List all users (filterable by role) |
| GET | `/users/:id` | Get single user |
| PATCH | `/users/:id/deactivate` | Deactivate user account |
| PATCH | `/users/:id/activate` | Reactivate user account |
| PATCH | `/users/:id/role` | Change user role |

---

## Lecturer Assignment Routes (Faculty Admin only)

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
| GET | `/sessions` | Lecturer | List own sessions |
| POST | `/sessions` | Lecturer | Open new session |
| GET | `/sessions/:id` | Lecturer, Faculty Admin | Get session detail + attendance list |
| GET | `/sessions/:id/live` | Lecturer | Live check-in count (poll every 5s) |
| PATCH | `/sessions/:id/close` | Lecturer | Close session (auto-marks absences) |
| PATCH | `/sessions/:id/reopen` | Lecturer | Reopen closed session (same day only) |

**POST /sessions body**
```json
{
  "courseUnitId": "uuid",
  "venue": "Lab 2",
  "academicYear": "2025/2026",
  "semester": 1
}
```

**Response**
```json
{
  "id": "uuid",
  "code": "A4X7K2",
  "codeExpiresAt": "2026-08-04T10:05:00Z",
  "status": "open",
  "courseUnit": { "id": "uuid", "name": "Web Development", "code": "BCS3101" }
}
```

---

## Check-In Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/checkin` | Student | Submit session code to check in |

**POST /checkin body**
```json
{ "code": "A4X7K2" }
```

**Success response**
```json
{
  "message": "Checked in successfully",
  "courseUnit": "Web Development",
  "date": "2026-08-04",
  "status": "present"
}
```

**Error responses**
```json
{ "error": "Invalid or expired code" }
{ "error": "You are not enrolled in this course unit" }
{ "error": "You have already checked in to this session" }
```

---

## Attendance Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/attendance/my` | Student | Own attendance per unit (current semester) |
| GET | `/attendance/session/:sessionId` | Lecturer, Faculty Admin | Full attendance list for a session |
| PATCH | `/attendance/:recordId` | Lecturer | Edit single attendance record |
| GET | `/attendance/unit/:courseUnitId` | Lecturer, Faculty Admin | Attendance summary for a course unit |

**PATCH /attendance/:recordId body**
```json
{
  "status": "excused",
  "reason": "Medical permission — student submitted sick note"
}
```

---

## Dashboard Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/dashboard/student` | Student | Personal attendance overview |
| GET | `/dashboard/lecturer` | Lecturer | Assigned units, today's sessions, at-risk students |
| GET | `/dashboard/faculty-admin` | Faculty Admin | Faculty overview, alerts, lecturer summary |
| GET | `/dashboard/system-admin` | System Admin | User counts, active sessions, import history |

---

## Report Routes (Faculty Admin + Lecturer)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/reports/lecturer/:lecturerId` | Faculty Admin | Lecturer attendance report |
| GET | `/reports/programme/:programmeId` | Faculty Admin | Programme attendance report |
| GET | `/reports/course-unit/:courseUnitId` | Lecturer, Faculty Admin | Course unit report |
| GET | `/reports/student/:studentId` | Faculty Admin | Individual student report |
| GET | `/reports/lecturer/:lecturerId/pdf` | Faculty Admin | Download lecturer PDF |
| GET | `/reports/programme/:programmeId/pdf` | Faculty Admin | Download programme PDF |
| GET | `/reports/course-unit/:courseUnitId/pdf` | Lecturer, Faculty Admin | Download unit PDF |
| GET | `/reports/student/:studentId/pdf` | Faculty Admin | Download student PDF |

All report endpoints accept query params:
```
?academicYear=2025/2026&semester=1
```

---

## Audit Log Routes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/audit-logs` | Faculty Admin, System Admin | Paginated audit log |

Query params: `?action=ATTENDANCE_EDIT&userId=uuid&from=2026-08-01&to=2026-08-31`

---

## HTTP Status Codes Used

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad request (validation error) |
| 401 | Unauthenticated (no/invalid JWT) |
| 403 | Forbidden (wrong role) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, e.g. session already open) |
| 500 | Internal server error |
