# UMU Attendance System — Change Specification
**Version:** 1.0  
**Date:** 2026-08-10  
**Status:** Approved — ready to implement

---

## Overview

This document describes every change required to the existing system. Changes are
grouped by concern, each section lists exactly which files are affected, what is
removed, what is added, and any loopholes or duplications found during the file
audit.

Implementation order: **Student flow → Lecturer flow → Faculty Admin flow → System Admin flow**

---

## 1. Authentication — Remove Password Login, Google Only

### What changes
- Remove all local email + password authentication for every role.
- Remove the forced password-change flow (`mustChangePassword` flag).
- Google OAuth becomes the **only** login method for everyone.
- `@stud.umu.ac.ug` → auto-registered as `student` on first login.
- `@umu.ac.ug` → must be pre-registered by System Admin with a role before login is allowed.
- First System Admin is bootstrapped from `ADMIN_BOOTSTRAP_EMAIL` in `.env`.
  If that email logs in with Google and no system_admin exists yet, they are
  automatically created with `system_admin` role.

### Files to delete entirely
| File | Reason |
|---|---|
| `server/src/utils/password.ts` | bcrypt helpers — no longer needed |
| `server/src/utils/apply-default-password.ts` | default password seeding — removed |
| `server/src/utils/seed-admin.ts` | replaced by env bootstrap |
| `server/src/pages/ResetPasswordPage.tsx` (client) | password reset UI — removed |
| `client/src/pages/ChangePassword.tsx` | forced change UI — removed |

### Files to modify

**`server/src/config/google-oauth.ts`**
- Remove the CSV-linking branch (`existing` account lookup by email that links
  `googleId`). This was needed when admins were created via CSV with a password.
  Now all staff must be pre-registered (email+role only, no password).
- For `@umu.ac.ug`: look up the user by email. If found and active → proceed.
  If not found → `NOT_REGISTERED` error. If found but disabled → `ACCOUNT_DISABLED`.
- For `@stud.umu.ac.ug`: look up by email. If found → proceed (re-login).
  If not found → auto-create with `role: student, profileComplete: false`.
- Add bootstrap check: if email matches `ADMIN_BOOTSTRAP_EMAIL` env var AND
  no `system_admin` row exists yet → create the account with `system_admin` role.
- Remove `googleId` lookup fallback (`prisma.user.findUnique({ where: { googleId } })`
  is kept as the primary lookup, but the CSV-link branch is removed).
- **Loophole found:** currently a staff member who was never pre-registered can
  spoof an `@umu.ac.ug` email via a personal Google account (if they somehow own
  that address). The `NOT_REGISTERED` guard already prevents this — keep it.

**`server/src/services/auth.service.ts`**
- Remove `loginWithPassword()` function entirely.
- Remove `changePassword()` function entirely.
- Remove import of `hashPassword`, `verifyPassword`, `password.ts`.
- Remove `mustChangePassword` branch from `finalizeLogin()` — redirect goes
  directly to dashboard or `/profile/setup`.
- Keep `finalizeLogin()`, `refreshSession()`, `logoutSession()`, `getCurrentUser()`.
- Remove `mustChangePassword` from the `AuthUser` interface and all references.

**`server/src/controllers/auth.controller.ts`**
- Remove `login()` handler (POST /api/auth/login).
- Remove `postPassword()` handler (POST /api/auth/password).
- Keep `googleRedirect`, `googleCallback`, `refresh`, `logout`, `me`, `devLogin`.

**`server/src/routes/auth.routes.ts`**
- Remove `router.post('/login', login)`.
- Remove `router.post('/password', authenticate, postPassword)`.

**`server/prisma/schema.prisma`**
- Remove `password` field from `User` model.
- Remove `mustChangePassword` field from `User` model.
- Create migration: `20260810_remove_local_auth`.

**`client/src/pages/Login.tsx`**
- Remove the email + password form entirely.
- Remove the "Coming soon" overlay from the Google button — make it a real,
  working `<a href="/api/auth/google">` link (full page navigation, not fetch).
- Keep the dev-login panel (dev mode only).
- Keep the UMU logo, title, and academic period footer.

**`client/src/api/endpoints.ts`**
- Remove `authApi.login()` call.
- Remove `authApi.postPassword()` call (change password endpoint).

**`client/src/context/AuthContext.tsx`**
- Remove any `mustChangePassword` handling.
- Update the `User` type to drop `mustChangePassword`.

**`client/src/components/RouteGuards.tsx`**
- Remove the `mustChangePassword` redirect guard.

**`client/src/types/index.ts`**
- Remove `mustChangePassword` from the `User` type.

### Duplication found
- `server/src/utils/domain.ts` contains `roleMatchesEmail()` — this is still
  needed for the Google OAuth domain check. Keep it.
- `server/src/services/settings.service.ts` has `getDefaultUserPasswordHash()`,
  `setDefaultUserPassword()`, `getDefaultUserPasswordStatus()`, and
  `DEFAULT_USER_PASSWORD_KEY` / `INITIAL_DEFAULT_USER_PASSWORD` constants —
  remove all of these since no local accounts exist anymore.
- `server/src/controllers/settings.controller.ts` and
  `server/src/routes/settings.routes.ts` expose a `PUT /settings/password`
  endpoint for setting the default user password — remove that route.
- `client/src/pages/GlobalSettings.tsx` has a "Default Password" section —
  remove that UI panel.

---

## 2. System Admin — Bootstrap & Staff Pre-Registration

### What changes
- System Admin no longer creates users with full details (name, password, faculty).
- New flow: System Admin enters **email + role only** to pre-register a staff account.
- Pre-registered accounts have `profileComplete: false`, no password, no name
  (name comes from Google on first login).
- For `faculty_admin`, System Admin also sets the **faculty** at pre-registration
  (Faculty Admin has no profile setup step — they go straight to dashboard).
- CSV import of staff and students is **removed entirely**.

### Files to delete entirely
| File | Reason |
|---|---|
| `client/src/pages/ImportData.tsx` | CSV import UI — removed |
| `server/src/services/import.service.ts` | CSV import logic — removed |
| Any import routes/controllers | (check `server/src/routes/` for import route) |

### Files to modify

**`server/src/services/user.service.ts`**
- Simplify `createUser()` — new signature:
  ```ts
  interface PreRegisterInput {
    email: string
    role: 'lecturer' | 'faculty_admin' | 'system_admin'
    facultyId?: string  // required only for faculty_admin
  }
  ```
- Creates the user row with `fullName: ''` (placeholder), `profileComplete: false`
  (except `system_admin` which is `true`).
- No password field set at all.
- For `faculty_admin`: `facultyId` is required and `profileComplete: true`
  (they skip profile setup).
- For `lecturer` and `system_admin`: `facultyId` not set, `profileComplete: false`.
- Remove `resetUserPassword()` — no passwords anymore.
- Remove `getDefaultUserPasswordHash()` usage.
- Keep `listUsers()`, `getUser()`, `setUserActive()`, `deleteUser()`,
  `changeUserRole()`, `assignFaculty()`.
- **Loophole found:** `assertFacultyAvailableForAdmin()` currently prevents
  two faculty_admins in the same faculty. Keep this guard — one faculty admin
  per faculty rule stays.
- **Loophole found:** `updateUser()` currently lets System Admin change a user's
  `fullName` and `email`. With Google auth, `fullName` is set from Google on
  first login and should not be editable by System Admin. Remove `fullName`
  from the admin edit form. Email changes should also be blocked post-registration
  (the Google account is the source of truth). System Admin can only
  activate/deactivate or change role.

**`client/src/pages/UserManagement.tsx`**
- Replace the "Add User" form (currently asks for name, email, password, role,
  faculty, all academic details) with a simple pre-registration form:
  - Email (text input)
  - Role (dropdown: Lecturer / Faculty Admin / System Admin)
  - Faculty (dropdown, shown only when role = Faculty Admin)
- Remove the "Reset Password" button from every user row.
- Remove CSV import button/link.
- Keep deactivate/activate, delete, change role.

**`server/src/app.ts`** / routes
- Remove import routes from the Express app.

**`client/src/App.tsx`** / routing
- Remove the `/import` route.
- Add a redirect from `/import` → `/system-admin` for safety.

**`client/src/pages/SystemAdminDashboard.tsx`**
- Remove the "Import History" / "Recent Imports" section.
- Replace with "Recent Registrations" — list of the last 10 users who completed
  profile setup (students and lecturers), showing name, email, role, date.

### New: Bootstrap env var
Add to `server/.env.example`:
```
ADMIN_BOOTSTRAP_EMAIL=your.admin@umu.ac.ug
```
Document in `docs/08-deployment-guide.md`: set this before first deployment;
on first Google login with this email, the System Admin account is created
automatically.

---

## 3. Student Profile Setup

### What changes
- Add `whatsapp` and `gender` fields to the `User` model.
- Year options change from 1–6 to **1–5**.
- `regNumber` is free-text, required, unique.
- `fullName` is pulled from Google and locked (not editable by the student).
- Profile photo is the Google account photo URL — store `photoUrl` on the `User`
  model (or fetch from Google profile on each `/auth/me` call).
- Semester is NOT chosen by the student — it comes from the global system period.

### Database changes (`server/prisma/schema.prisma`)
Add to `User` model:
```prisma
whatsapp    String?  @db.VarChar(30)
gender      Gender?
photoUrl    String?  @db.VarChar(500)
```
Add enum:
```prisma
enum Gender {
  male
  female
  other
}
```
Create migration: `20260810_add_whatsapp_gender_photo`.

**`server/src/config/google-oauth.ts`**
- When auto-creating a student account on first login, also save:
  `photoUrl: profile.photos?.[0]?.value ?? null`
- When an existing user logs in again via Google, update `photoUrl` in case
  they changed their Google profile picture.

### Files to modify

**`server/src/services/profile.service.ts`**
- Add `whatsapp` and `gender` to `StudentPathInput`.
- Add validation: `whatsapp` required, non-empty string. `gender` required,
  must be `'male' | 'female' | 'other'`.
- Update `completeStudentProfile()` and `updateStudentProfile()` to save
  `whatsapp` and `gender`.
- Remove year option 6 from any server-side validation (max year = 5).
- **Loophole found:** `recalculateEnrollments()` deletes ALL enrollments for the
  given `(academicYear, semester)` and recreates them. If a Faculty Admin
  manually added an extra unit to a student, that unit would be wiped on next
  profile save. Fix: preserve manually-added enrollments (those not in
  curriculum) OR warn the student that edits will recalculate units.
  Decision: keep the current wipe-and-recreate behaviour but show a warning
  banner on the edit form: "Saving will recalculate your enrolled units based
  on the curriculum. Any manually added units will be preserved." Actually,
  to preserve manual additions: after recreating curriculum-based enrollments,
  re-add any enrollments that existed before the update but are not in the
  new curriculum (only if their `academicYear + semester` matches the current
  period). This needs a two-step approach in `recalculateEnrollments()`:
  1. Fetch existing enrollments for the period.
  2. Fetch curriculum unit IDs.
  3. Delete only curriculum-based enrollments (not manually added ones).
  4. Re-insert from curriculum.
  To distinguish manual vs curriculum enrollments, add a boolean field
  `isManual Boolean @default(false)` to the `Enrollment` model.
  Migration: `20260810_add_enrollment_is_manual`.

**`server/src/controllers/profile.controller.ts`**
- Accept `whatsapp` and `gender` in the student profile body.

**`client/src/pages/ProfileSetup.tsx`**
- Add `WhatsApp Number` text input field.
- Add `Gender` dropdown (Male / Female / Other).
- Change year options from 1–6 to 1–5.
- Make `fullName` display-only (show as a read-only field, not an input).
- Show profile photo from Google (display only, no upload).
- Show current academic period (already done — keep this).
- For the lecturer setup: add `WhatsApp` and `Gender` fields.
- For the lecturer setup: add `Additional Faculties` multi-select (0 or more).

**`client/src/types/index.ts`**
- Add `whatsapp: string | null`, `gender: 'male' | 'female' | 'other' | null`,
  `photoUrl: string | null` to the `User` type.

**`client/src/api/endpoints.ts`**
- Add `whatsapp` and `gender` to `StudentProfileInput`.
- Add `additionalFaculties` to the lecturer profile input type.

---

## 4. Lecturer Profile Setup

### What changes
- Add `WhatsApp` and `Gender` (same as students).
- Add `additionalFaculties` — a list of extra faculty IDs (0 or more).
- `primaryFaculty` is the existing `facultyId` field on `User`.
- Additional faculties stored in a new join table.

### Database changes
New model in `schema.prisma`:
```prisma
model UserFaculty {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  facultyId String
  faculty   Faculty  @relation(fields: [facultyId], references: [id])
  createdAt DateTime @default(now())

  @@unique([userId, facultyId])
  @@map("user_faculties")
}
```
Add relation back on `User`:
```prisma
additionalFaculties UserFaculty[]
```
Add relation back on `Faculty`:
```prisma
additionalUsers UserFaculty[]
```
Migration: `20260810_add_user_faculties`.

**`server/src/services/profile.service.ts`**
- `completeLecturerProfile()` and `updateLecturerProfile()` now accept:
  `{ facultyId, additionalFacultyIds, whatsapp, gender }`.
- Save `whatsapp` and `gender` to `User`.
- Sync `UserFaculty` rows: delete all existing for this user, re-insert from
  `additionalFacultyIds`. Skip duplicates with the primary faculty.

**`server/src/services/assignment.service.ts`**
- `listAssignments()` currently scopes to `courseUnit.facultyId = facultyId`.
  Update to also include assignments where the lecturer has the faculty as an
  additional faculty (`UserFaculty`). Actually the scope here is the Faculty
  Admin's faculty — lecturers who have this faculty as primary OR additional
  should appear in the Faculty Admin's lecturer list.
- Update `createAssignment()`: when checking if a lecturer belongs to the
  faculty, check both primary `facultyId` and `UserFaculty` join table.

**`server/src/services/enrollment.service.ts`** (`getFacultyUnitOverview`)
- Update the lecturer query to also include lecturers where the faculty appears
  in `UserFaculty` (additional faculties).

**`client/src/pages/ProfileSetup.tsx`**
- Lecturer first-time setup: add WhatsApp, Gender, Primary Faculty (dropdown),
  Additional Faculties (multi-select, optional, excludes the primary).
- Lecturer edit: same fields, all editable (unlike the old read-only faculty).

---

## 5. Faculty Admin — Curriculum Management

### What changes
- Faculty Admin can add, replace, or remove units from the curriculum for their
  faculty's programmes.
- This is a **new feature** — no equivalent exists in the current system.
  Currently curriculum is set via CSV import (now removed) or System Admin.
- When a unit is added to the curriculum → auto-enroll all current students on
  that path (Programme + Year + current semester).
- When a unit is removed → keep existing attendance, mark enrollment as inactive
  (or delete enrollment but keep attendance records — use the `isManual` flag
  approach: curriculum removals set the enrollment to inactive rather than
  deleting it to preserve records).

### New files to create
- `server/src/services/curriculum.service.ts`
- `server/src/routes/curriculum.routes.ts`
- `server/src/controllers/curriculum.controller.ts`
- `client/src/pages/CurriculumManager.tsx`

### API endpoints (new)
```
GET    /api/curriculum/:facultyId/programmes         — list programmes in faculty
GET    /api/curriculum/:programmeId/units?year=&sem= — list curriculum for path
POST   /api/curriculum                               — add unit to path
DELETE /api/curriculum/:id                           — remove unit from path
```
All scoped to Faculty Admin's own faculty.

### Faculty Admin — Lecturer Assignment (changes to existing)
Current flow assigns a lecturer by picking any unit. New flow:
1. Pick Programme (dropdown)
2. Pick Year (1–5)
3. Pick Semester (1 or 2)
4. See the units in that path
5. For each unit, assign one lecturer from the faculty's lecturer list

**`server/src/services/assignment.service.ts`**
- Add a new method `getAssignmentsForPath(facultyId, programmeId, year, semester)`
  that returns units in that path with their current assignment (if any).
- Enforce one lecturer per unit per period (already done — keep).
- Cross-faculty units (e.g. Ethics): the assignment is at unit level. When a
  Faculty Admin of Faculty A assigns a lecturer to Ethics (owned by Faculty B
  but shared with Faculty A), that assignment applies to all programmes sharing
  Ethics. Add a check: if the unit already has an assignment from another
  faculty admin, show a warning but still allow it (the last assignment wins,
  or block it — decision: **block it**, the owning faculty's admin has priority).

**`client/src/pages/FacultyUnits.tsx`**
- Refactor to show the Programme → Year → Semester drill-down assignment UI.
- Add the curriculum editor tab alongside the assignment tab.

---

## 6. Remove Alerts / Notifications

### What changes
- Remove all alert-related email sending.
- Keep the `AttendanceAlert` model and data in the DB (for historical record).
- Remove background alert evaluation from the session close flow.
- Remove alert email templates and sending code.

### Files to modify

**`server/src/services/alert.service.ts`**
- Remove `sendAlertEmail()` calls.
- Keep `evaluateAlerts()` as a data-only function (records the alert in DB
  without sending any email) — or remove entirely if no reporting on alerts.
  Decision: **remove entirely** (no email, no alerts recorded — simplifies
  the system).

**`server/src/services/email.service.ts`**
- Remove alert email templates and functions.
- Keep the mailer config (may be used for other purposes later).
- Actually: if alerts are fully removed, `email.service.ts` has no callers.
  Remove the file, keep `server/src/config/mailer.ts` in case email is added
  back later.

**`server/src/services/session.service.ts`** (`closeSession`)
- Remove the alert evaluation call after recording absences.

**`server/src/routes/alert.routes.ts`**
- Remove entirely.

**`server/src/controllers/alert.controller.ts`**
- Remove entirely.

**`client/src/pages/FacultyAdminDashboard.tsx`**
- Remove the "At-Risk Alerts" section.

**`client/src/api/endpoints.ts`**
- Remove `alertApi` calls.

---

## 7. Settings — Remove Password-Related Settings

### Files to modify

**`server/src/services/settings.service.ts`**
- Remove `getDefaultUserPasswordHash()`.
- Remove `setDefaultUserPassword()`.
- Remove `getDefaultUserPasswordStatus()`.
- Remove `INITIAL_DEFAULT_USER_PASSWORD` constant.
- Remove `DEFAULT_USER_PASSWORD_KEY` constant.
- Keep all other settings (profile editing toggles, current period, support,
  database reset).

**`server/src/controllers/settings.controller.ts`**
- Remove the password settings handler.

**`server/src/routes/settings.routes.ts`**
- Remove `PUT /settings/password` route.

**`client/src/pages/GlobalSettings.tsx`**
- Remove the "Default Password" card/section.

---

## 8. `/auth/me` — Return New Fields

**`server/src/services/auth.service.ts`** (`getCurrentUser`)
- Add `whatsapp`, `gender`, `photoUrl` to the returned fields.
- Add `additionalFaculties` (list of `{ id, name }`) for lecturers.
- Remove `mustChangePassword`.

---

## 9. Profile Photo Display

- Store `photoUrl` on the `User` model (set from Google profile on every login).
- Display in the Layout header (avatar circle) using `<img src={user.photoUrl}>`.
- Fallback to initials if `photoUrl` is null.

**`client/src/components/Layout.tsx`**
- Replace the current initials-only avatar with a photo if `photoUrl` is set.

---

## 10. Loopholes & Issues Summary

| # | Issue | Location | Fix |
|---|---|---|---|
| 1 | Students can pick Year 6 | `ProfileSetup.tsx` + server validation | Cap at 5 |
| 2 | Faculty Admin pre-registration doesn't set `profileComplete: true` | `user.service.ts` `createUser()` | Set `profileComplete: true` for `faculty_admin` since they have no setup step |
| 3 | Lecturer `additionalFaculties` not scoped in assignment permission check | `assignment.service.ts` | Check primary + additional faculties |
| 4 | `recalculateEnrollments()` wipes manually-added units | `profile.service.ts` | Add `isManual` flag to `Enrollment`, preserve manual ones on recalc |
| 5 | Google-auth staff can log in without being pre-registered if someone creates a `@umu.ac.ug` Google account | `google-oauth.ts` | The `NOT_REGISTERED` guard already prevents this — must verify it's enforced before the user row is created |
| 6 | `assertFacultyAvailableForAdmin()` only checks `faculty_admin` role but not the new `UserFaculty` additional-faculty link | `user.service.ts` | No change needed — Faculty Admin has one primary faculty; additional faculty is a lecturer feature only |
| 7 | `updateUser()` in System Admin allows changing `fullName` and `email` — conflicts with Google as source of truth | `user.service.ts` | Remove `fullName` edit; block email change post-registration |
| 8 | Dev login creates users with `mustChangePassword: false` but references that flag in logic | `auth.controller.ts` `devLogin` | Remove `mustChangePassword` from dev login too |
| 9 | `password` column still exists in DB after migration — old bcrypt hashes leak | `schema.prisma` | Drop column in migration `20260810_remove_local_auth` |
| 10 | Cross-faculty unit assignment conflict: two faculty admins can assign different lecturers to the same unit | `assignment.service.ts` | Owning faculty admin has priority; other faculty admins see the assignment as read-only |

---

## 11. Migration Plan

Run in this order:
1. `20260810_remove_local_auth` — drop `password`, `mustChangePassword` from `users`
2. `20260810_add_whatsapp_gender_photo` — add `whatsapp`, `gender`, `photoUrl` to `users`
3. `20260810_add_user_faculties` — new `user_faculties` join table
4. `20260810_add_enrollment_is_manual` — add `isManual` flag to `enrollments`

---

## 12. Implementation Order & Status

### Phase 1 — Auth & Database ✅ DONE
- [x] Migrations: remove password/mustChangePassword, add whatsapp/gender/photoUrl, user_faculties, isManual enrollment, programme level
- [x] `google-oauth.ts` — bootstrap admin, save photoUrl, no CSV-link branch
- [x] `auth.service.ts` — removed loginWithPassword, changePassword, mustChangePassword
- [x] `auth.controller.ts` — removed login/postPassword handlers
- [x] `auth.routes.ts` — removed /login and /password routes
- [x] `middleware/auth.ts` — removed mustChangePassword check

### Phase 2 — Server Services ✅ DONE
- [x] `profile.service.ts` — whatsapp, gender, additionalFaculties, isManual enrollment, year cap 5
- [x] `user.service.ts` — pre-register only, no password, no resetPassword
- [x] `settings.service.ts` — remove password settings
- [x] `settings.controller.ts` + `settings.routes.ts` — remove password route
- [x] `assignment.service.ts` — scope to primary + additional faculties
- [x] `enrollment.service.ts` — scope lecturer query to primary + additional faculties
- [x] Deleted: `alert.service.ts`, `alert-list.service.ts`, `email.service.ts`, `alert.controller.ts`, `alert.routes.ts`, `import.service.ts`, `password.ts`, `seed-admin.ts`, `apply-default-password.ts`
- [ ] `session.service.ts` — remove alert call on closeSession
- [ ] `app.ts` — remove alert + import routes
- [x] `auth.service.ts` getCurrentUser — returns new fields (whatsapp, gender, photoUrl, additionalFaculties)

### Phase 3 — Client ✅ DONE
- [x] `types/index.ts` — add whatsapp/gender/photoUrl, remove mustChangePassword
- [x] `Login.tsx` — Google button only
- [x] `RouteGuards.tsx` — remove mustChangePassword guards
- [x] `ProfileSetup.tsx` — new fields, level filter, year 1–5, lecturer additionalFaculties
- [x] `UserManagement.tsx` — pre-register form only, no reset password
- [x] `endpoints.ts` — removed password/import APIs, added new profile fields
- [x] `GlobalSettings.tsx` — removed default password section
- [x] `SystemAdminDashboard.tsx` — removed import history, added recent registrations
- [x] `Layout.tsx` — Google photo avatar in sidebar and header
- [x] Deleted `ChangePassword.tsx`, `ResetPasswordPage.tsx`, `ImportData.tsx`
- [x] `server/.env.example` — added ADMIN_BOOTSTRAP_EMAIL, removed seed admin vars

### Phase 3 — Client
- [ ] `types/index.ts` — add whatsapp/gender/photoUrl, remove mustChangePassword
- [ ] `Login.tsx` — Google button only
- [ ] `RouteGuards.tsx` — remove mustChangePassword guards
- [ ] `ProfileSetup.tsx` — new fields, level filter, year 1–5, lecturer additionalFaculties
- [ ] `UserManagement.tsx` — pre-register form only
- [ ] `endpoints.ts` — remove password/import APIs
- [ ] `GlobalSettings.tsx` — remove default password section
- [ ] `SystemAdminDashboard.tsx` — remove import history
- [ ] `Layout.tsx` — photo avatar
- [ ] Delete `ChangePassword.tsx`, `ResetPasswordPage.tsx`, `ImportData.tsx`
- [ ] `.env.example` — add ADMIN_BOOTSTRAP_EMAIL

---

## 13. Files NOT Changing

These files are correct as-is and need no modifications:
- `server/src/utils/codeGenerator.ts`
- `server/src/services/session.service.ts` (except removing alert call on close)
- `server/src/services/checkin.service.ts`
- `server/src/services/report.service.ts`
- `server/src/services/pdf.service.ts`
- `server/src/services/jwt.service.ts`
- `server/src/services/refresh-token.service.ts`
- `server/src/services/dashboard.service.ts` (minor: remove alert counts)
- `server/src/middleware/auth.ts`
- `server/src/middleware/role.ts`
- `server/src/config/geofence.ts`
- `server/prisma/migrations/*` (append only)
- All report pages and PDF download logic
- `LiveSession.tsx`, `SessionsList.tsx`, `SessionDetail.tsx`
- `AcademicSetup.tsx` (System Admin academic structure — unchanged)
- `devops/` folder
