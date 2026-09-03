# Session Progress — Moodle Sync Implementation

> Working note only — **do not commit/push this file**. It exists to restore context
> the next time we pick this work up.

**Last session:** 2026-09-03 · All blocking bugs fixed. Elective system removed. Ready for staging deployment.

**State:** Server + client typecheck clean. 149/149 vitest tests green. Code is ship-ready pending live Moodle configuration on Azure.

---

## What exists now (verified against code, not just notes)

### Server
| Area | Files |
|---|---|
| Config | `server/src/config/moodle.ts` (`MOODLE_BASE_URL`/`MOODLE_WS_TOKEN`/`MOODLE_WS_SERVICE`) |
| API client | `server/src/integrations/moodle/moodle.client.ts` (retries, 30s timeout, Moodle HTTP-200 exception detection) |
| Types | `server/src/integrations/moodle/moodle.types.ts` |
| Read APIs | `moodle.users.ts`, `moodle.courses.ts`, `moodle.enrolments.ts` |
| Sync service | `server/src/services/moodle-sync.service.ts` — hierarchy → courses → users → enrolments; identity + role mapping; auto-assign student programme + lecturer faculties |
| Controller + routes | `server/src/controllers/moodle-sync.controller.ts`, `server/src/routes/moodle-sync.routes.ts` (System Admin only) |
| Route registration | `server/src/app.ts` → `/api/moodle` |
| Audit | `server/src/utils/audit.ts` → `MOODLE_SYNC` |
| Prisma | `moodleUserId`, `moodleCourseId` (BigInt, unique), `SyncRun`, `ProgrammeYear`, `Semester`, `SemesterCourseUnit` + migrations |
| Env example | `server/.env.example` |
| Tests | `server/src/services/moodle-sync.service.test.ts` (20 cases, all passing) |

### Bugs fixed this session
- `autoAssignStudentProgramme` now writes `currentPeriod.semester` to the student profile (was incorrectly using `best.semester` from the Moodle hierarchy node)
- `recalculateEnrollments` now reads from `SemesterCourseUnit` (Moodle-sourced) when a matching Semester node exists; falls back to legacy `CurriculumUnit` only for unsynced paths
- Elective system (picker, pick-N rules, `ElectiveRequirement`, `CurriculumUnit.isElective`) fully removed — orphaned since Moodle is the curriculum source

### Google OAuth
- `server/src/config/google-oauth.ts` — passReqToCallback + timing-safe `oauth_state` cookie validation; Moodle-gated student login
- `server/src/controllers/auth.controller.ts` — sets `oauth_state` HttpOnly cookie + passes `state` to Google
- `client/src/pages/AccessDenied.tsx` — labels for new reasons (`not-synchronized`, `oauth-state`)

### Client
- `client/src/api/endpoints.ts` — `moodleApi` group; elective endpoints removed
- `client/src/pages/MoodleSync.tsx` — config, Test Connection, Sync Now, stats, warnings, last-run
- `client/src/App.tsx` — route `/system-admin/moodle`
- `client/src/components/Layout.tsx` — sidebar "Moodle Sync"

### DevOps + docs
- `devops/scripts/moodle/setup-webservice.php`, `create-unit-courses.php`, `section-11-data-audit.sql`
- `docs/12-moodle-integration.md` — full architecture + ICT config guide

---

## API endpoints (System Admin only)
- `POST /api/moodle/test-connection`
- `POST /api/moodle/sync`
- `GET  /api/moodle/sync-status`
- `GET  /api/moodle/config`

## Sync guards (behaviour baked in + tested)
- Aborts if Moodle not configured (503)
- Emails colliding with UMU faculty/sys admin → skipped, never re-roled
- Students must have `@stud.umu.ac.ug`, lecturers `@umu.ac.ug`
- `manager`/`coursecreator` skipped
- Current-period only reconciliation; historical attendance data untouched
- `assignedById` = `moodle-sync@system.internal` sync actor

---

## What's Next (configuration — no more code changes needed)
1. Deploy to Azure staging
2. Set env vars: `MOODLE_BASE_URL`, `MOODLE_WS_TOKEN`
3. Run `setup-webservice.php` on the Moodle server
4. Open `/system-admin/moodle` → Test Connection → verify it passes
5. Set the four `moodle.current.*` system settings (semester category ID, academic year, semester number, year)
6. Run Sync Now → verify students and lecturers appear with correct profiles and enrollments

---

## Key Mapping Reference
| Moodle role | UMU role |
|---|---|
| `student` | student |
| `teacher`/`editingteacher` | lecturer |
| `manager`/`coursecreator` | skipped |

| Match key | Moodle → UMU |
|---|---|
| Course | `shortname` → `course_unit.code` (case-insensitive) |
| Person | `moodleUserId` → `idnumber/regNumber` → email (in order, no silent merge) |
| Period | UMU global `currentPeriod` setting |
