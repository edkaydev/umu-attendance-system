# 03 — User Roles & Permissions

## The 4 Roles

| Role | Email Domain | Created By | Device |
|---|---|---|---|
| System Admin | `@umu.ac.ug` | Another System Admin (or seeded at install) | Desktop only |
| Faculty Admin | `@umu.ac.ug` | System Admin via staff CSV import | Desktop only |
| Lecturer | `@umu.ac.ug` | System Admin via staff CSV import | Mobile + Desktop |
| Student | `@stud.umu.ac.ug` | Self — appears after first Google login | Mobile + Desktop |

Faculty Admin and System Admin portals are blocked on narrow viewports with a
"Desktop required" message.

---

## Permissions Matrix

| Action | Student | Lecturer | Faculty Admin | System Admin |
|---|:---:|:---:|:---:|:---:|
| **Authentication** |
| Login via Google | ✅ | ✅ | ✅ | ✅ |
| Complete own profile | ✅ | ✅ | ❌ | ❌ |
| Edit own profile (when enabled by System Admin) | ✅ | ✅ | ❌ | ❌ |
| **System Settings** |
| Set active academic year + semester | ❌ | ❌ | ❌ | ✅ |
| Enable/disable profile editing per role | ❌ | ❌ | ❌ | ✅ |
| **Academic Structure** |
| Create / edit Campus, Faculty, Programme, Course Units | ❌ | ❌ | ❌ | ✅ |
| Map course units to programmes (curriculum) | ❌ | ❌ | ✅ (own faculty) | ✅ |
| View course units and programmes | ❌ | ❌ | ✅ (own faculty) | ✅ |
| Share course units across faculties | ❌ | ❌ | ❌ | ✅ |
| Import academic structure via CSV | ❌ | ❌ | ❌ | ✅ |
| Import staff accounts via CSV | ❌ | ❌ | ❌ | ✅ |
| Deactivate / reactivate any user account | ❌ | ❌ | ❌ | ✅ |
| Change user role | ❌ | ❌ | ❌ | ✅ |
| **Lecturer Assignment** |
| Assign lecturer to course unit | ❌ | ❌ | ✅ (own faculty) | ❌ |
| Remove lecturer from course unit | ❌ | ❌ | ✅ (own faculty) | ❌ |
| Enrol student in course unit | ❌ | ❌ | ✅ (own faculty) | ❌ |
| Remove student from course unit | ❌ | ❌ | ✅ (own faculty) | ❌ |
| **Sessions** |
| Open attendance session | ❌ | ✅ (own assigned units) | ❌ | ❌ |
| View session code live | ❌ | ✅ (own sessions) | ❌ | ❌ |
| Close session | ❌ | ✅ (own sessions) | ❌ | ❌ |
| Reopen session (same day, EAT) | ❌ | ✅ (own sessions) | ❌ | ❌ |
| Extend session code TTL | ❌ | ✅ (own sessions) | ❌ | ❌ |
| View live check-in list | ❌ | ✅ (own sessions) | ❌ | ❌ |
| View session detail | ❌ | ✅ (own sessions) | ✅ (read-only, own faculty) | ❌ |
| **Attendance Editing** |
| Edit attendance record | ❌ | ✅ (own closed sessions only) | ❌ (read-only) | ❌ |
| **Check-In** |
| Enter session code to check in | ✅ | ❌ | ❌ | ❌ |
| **Attendance Records** |
| View own attendance per unit | ✅ | ❌ | ❌ | ❌ |
| View attendance for own sessions | ❌ | ✅ | ❌ | ❌ |
| View attendance for any session in faculty | ❌ | ❌ | ✅ | ❌ |
| **Audit Log** |
| View audit log | ❌ | ❌ | ✅ | ✅ |
| **Alerts** |
| Receive own below-threshold alert | ✅ | ❌ | ❌ | ❌ |
| Receive alert for own units | ❌ | ✅ | ❌ | ❌ |
| Receive alert for all faculty | ❌ | ❌ | ✅ | ❌ |
| **Reports & PDF** |
| Download PDF for own course units | ❌ | ✅ | ❌ | ❌ |
| Generate + download PDF: lecturer / programme / unit / student | ❌ | ❌ | ✅ (own faculty) | ❌ |
| **Dashboards** |
| Student dashboard | ✅ | ❌ | ❌ | ❌ |
| Lecturer dashboard | ❌ | ✅ | ❌ | ❌ |
| Faculty Admin dashboard | ❌ | ❌ | ✅ | ❌ |
| System Admin dashboard | ❌ | ❌ | ❌ | ✅ |

---

## Role Details

### System Admin
Technical owner of the system. Typically UMU IT staff. Multiple allowed.

Responsibilities:
- Sets up the academic hierarchy each semester: Campus, Faculty, Programme, Course Units, curriculum
- Imports staff via CSV
- Manages user accounts (activate, deactivate, change role, update details)
- Sets the global current academic year and semester
- Enables/disables profile editing per role
- Monitors system health and audit log

Does NOT:
- Assign lecturers to units
- Monitor academic performance
- Receive attendance alerts

---

### Faculty Admin
Academic monitoring officer. Belongs to one faculty.

Responsibilities:
- Assigns lecturers to course units in their faculty
- Enrols students in course units
- **Manages curriculum mappings** (maps course units to programmes, year, and semester) for their faculty
- Monitors attendance across the entire faculty
- Generates and downloads PDF reports (lecturer, programme, unit, student)
- Receives all below-threshold alerts for their faculty

Does NOT:
- Set up or edit faculties, programmes, or course units
- Open attendance sessions
- Edit attendance records (read-only)

---

### Lecturer
Academic staff who teach one or more course units.

Is linked to their faculty when their account is created or imported. Faculty Admin then assigns units.

Can:
- Open and close sessions for assigned units
- Display the live code to students
- Extend code validity or set auto-close duration
- Edit attendance for their own closed sessions (with a required reason)
- Download PDF for their own course units
- Receive alerts when students in their units drop below threshold

Cannot:
- Assign themselves to units
- View sessions or attendance for other lecturers
- Edit attendance on open sessions
- Access faculty-wide reports

---

### Student
Enrolled UMU student.

On first login, completes profile (faculty, programme, year, semester, reg number).
Auto-enrolled into course units for that path.

Can:
- Check in to sessions by entering the session code
- View own attendance per unit, eligibility status, weekly activity
- Edit own profile (when allowed by System Admin)

Cannot:
- View other students' records
- Open sessions
- Download reports

---

## RBAC Implementation

Every API request passes through two middleware layers:

```
Request
   ↓
authenticate    ← Verifies JWT, re-fetches user from DB (checks isActive + role live)
   ↓
requireRole     ← Checks role against allowed list for this route
   ↓
controller      ← Handles the request
   ↓
service         ← Enforces data scoping (e.g. lecturer only sees own sessions)
```

The JWT payload carries only `sub` (user ID). The full user object (role, facultyId,
isActive) is re-fetched from the database on every request — role or status changes
take effect immediately without requiring a re-login.

Data scoping is enforced at the **service layer** with database-level filters, not just UI.

```typescript
// Only Faculty Admin can access this route
router.get('/reports/lecturer/:id', authenticate, requireRole('faculty_admin'), controller)

// Lecturer and Faculty Admin can access
router.get('/sessions/:id', authenticate, requireRole('lecturer', 'faculty_admin'), controller)
```
