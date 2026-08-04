# 03 — User Roles & Permissions

## The 4 Roles

| Role | Email Domain | Created By |
|---|---|---|
| System Admin | `@umu.ac.ug` | Another System Admin (or seeded at install) |
| Faculty Admin | `@umu.ac.ug` | System Admin via staff CSV import |
| Lecturer | `@umu.ac.ug` | System Admin via staff CSV import |
| Student | `@stud.umu.ac.ug` | Self — appears after first Google login |

---

## Permissions Matrix

| Action | Student | Lecturer | Faculty Admin | System Admin |
|---|:---:|:---:|:---:|:---:|
| **Authentication** |
| Login via Google | ✅ | ✅ | ✅ | ✅ |
| Complete own profile | ✅ | ✅ | ❌ | ❌ |
| Edit own profile | ✅ | ✅ | ❌ | ❌ |
| **Academic Structure** |
| Create / edit Campus, Faculty, Programme | ❌ | ❌ | ❌ | ✅ |
| Create / edit Course Units | ❌ | ❌ | ❌ | ✅ |
| Map course units to programmes (curriculum) | ❌ | ❌ | ❌ | ✅ |
| Import academic structure via CSV | ❌ | ❌ | ❌ | ✅ |
| Import staff accounts via CSV | ❌ | ❌ | ❌ | ✅ |
| Deactivate any user account | ❌ | ❌ | ❌ | ✅ |
| **Lecturer Assignment** |
| Assign lecturer to course unit | ❌ | ❌ | ✅ | ❌ |
| Remove lecturer from course unit | ❌ | ❌ | ✅ | ❌ |
| **Sessions** |
| Open attendance session | ❌ | ✅ (own units) | ❌ | ❌ |
| View session code (live) | ❌ | ✅ | ❌ | ❌ |
| Close session | ❌ | ✅ (own units) | ❌ | ❌ |
| View live check-in list | ❌ | ✅ (own units) | ❌ | ❌ |
| Edit attendance after session closes | ❌ | ✅ (own units) | ❌ | ❌ |
| **Check-In** |
| Enter session code to check in | ✅ | ❌ | ❌ | ❌ |
| View own check-in confirmation | ✅ | ❌ | ❌ | ❌ |
| **Attendance Records** |
| View own attendance per unit | ✅ | ❌ | ❌ | ❌ |
| View attendance for own units | ❌ | ✅ | ❌ | ❌ |
| View attendance for all faculty units | ❌ | ❌ | ✅ | ❌ |
| View attendance for all units (system-wide) | ❌ | ❌ | ❌ | ✅ |
| **Audit Log** |
| View audit log | ❌ | ❌ | ✅ | ✅ |
| **Alerts** |
| Receive own below-threshold alert | ✅ | ❌ | ❌ | ❌ |
| Receive alert for own units | ❌ | ✅ | ❌ | ❌ |
| Receive alert for all faculty | ❌ | ❌ | ✅ | ❌ |
| **Reports & PDF** |
| Download own attendance PDF | ❌ | ❌ | ❌ | ❌ |
| Download PDF for own units | ❌ | ✅ | ❌ | ❌ |
| Download PDF: lecturer / programme / unit / student | ❌ | ❌ | ✅ | ❌ |
| **Dashboards** |
| Student dashboard | ✅ | ❌ | ❌ | ❌ |
| Lecturer dashboard | ❌ | ✅ | ❌ | ❌ |
| Faculty Admin dashboard | ❌ | ❌ | ✅ | ❌ |
| System Admin dashboard | ❌ | ❌ | ❌ | ✅ |

---

## Role Details

### System Admin
The technical owner of the system. Typically UMU IT staff. There can be multiple.

Responsibilities:
- Sets up the entire academic hierarchy before each semester: Campus, Faculty, Programme, Year, Semester, Course Units, curriculum mappings
- Imports staff (lecturers, faculty admins) via CSV
- Manages user accounts (activate, deactivate, change role)
- Monitors system health

Does NOT:
- Monitor academic performance
- Assign lecturers to units
- Receive attendance alerts

---

### Faculty Admin
The academic monitoring officer. Belongs to one faculty.

Responsibilities:
- Assigns lecturers to course units within their faculty
- Monitors attendance across their entire faculty
- Answers questions: How is this lecturer doing? How is this programme doing? Is this student at risk?
- Generates and downloads PDF reports
- Receives all below-threshold alerts for their faculty

Does NOT:
- Set up academic structure
- Open attendance sessions
- Edit attendance records directly

---

### Lecturer
An academic staff member who teaches one or more course units.

On first login:
- Selects their Faculty
- Faculty Admin then assigns them to specific course units

Can:
- Open and close attendance sessions for assigned units
- Display the session code to students
- Edit attendance records after a session (with a required reason)
- View class attendance reports for their own units
- Download PDF summary for their own units
- Receive alerts when their students drop below threshold

Cannot:
- Assign themselves to units
- View other lecturers' sessions or records
- Access faculty-wide reports

---

### Student
An enrolled UMU student.

On first login:
- Selects: Campus → Faculty → Programme → Year → Semester
- Enters their Registration Number
- Auto-enrolled into all course units on that path

Can:
- Check in to sessions by entering the session code
- View their own attendance: per unit, semester summary, weekly history
- See their eligibility status (Good / Warning / Not Eligible) per unit
- Edit their own profile at any time

Cannot:
- View other students' attendance
- Open sessions
- Download PDF reports

---

## RBAC Implementation

Every API request goes through two middleware layers:

```
Request
   ↓
auth middleware      ← Is the JWT valid? Who is this user?
   ↓
role middleware      ← Does this role have permission for this route?
   ↓
controller          ← Handle the request
```

Example role guard:

```typescript
// Only Faculty Admin can access this route
router.get('/reports/lecturer/:id', requireRole('faculty_admin'), controller)

// Lecturer and Faculty Admin can access
router.get('/sessions/:id', requireRole('lecturer', 'faculty_admin'), controller)
```

Data scoping is enforced at the **service layer** — a lecturer calling
`GET /sessions` only ever receives sessions for their assigned units,
enforced in the database query, not just the UI.
