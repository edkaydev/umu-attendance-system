# UMU Attendance System — Task List

Status guide: `[ ]` = pending · `[x]` = done

## Phase 1 — Project Setup (1–7)

- [x] 1. Initialize project: folder structure, git, .gitignore, README
- [x] 2. Set up server: package.json, TypeScript config, ts-node/dev scripts
- [x] 3. Set up client: Vite + React 18 + TypeScript scaffold
- [x] 4. Install client deps: tailwind, recharts, react-router, PWA plugin
- [x] 5. Configure Tailwind with UMU design tokens (09-design-system)
- [x] 6. Write full Prisma schema (05-database-schema) with all 12 models
- [x] 7. Add .env.example with all env vars (04-tech-stack)

## Phase 2 — Server Foundation & Auth (8–24)

- [x] 8. Create db.ts config: Prisma client singleton
- [x] 9. Set up Express app entry point with middleware, CORS, cookie parsing
- [x] 10. Create global error handler and 404 handler
- [x] 11. Create API response utilities (success/error helpers)
- [x] 12. Implement auth middleware: JWT verify from HttpOnly cookie
- [x] 13. Implement requireRole RBAC middleware (03-roles)
- [x] 14. Implement request validation middleware (zod or manual)
- [x] 15. Set up Google OAuth with Passport: client ID/secret/callback
- [x] 16. Implement OAuth callback: email domain check (@stud.umu.ac.ug / @umu.ac.ug)
- [x] 17. Implement access-denied handling for unregistered emails (FR-01.6)
- [x] 18. Implement JWT issuance: access (1hr) + refresh (7d) HttpOnly cookies
- [x] 19. Implement refresh token rotation service (hash stored, revoked flag)
- [x] 20. Implement refresh endpoint: silent rotation (FR-01.8)
- [x] 21. Implement logout: clear cookies + revoke refresh token (FR-01.9)
- [x] 22. Implement GET /auth/me endpoint
- [x] 23. Write auth controller: google redirect, callback, refresh, logout, me
- [x] 24. Create seed:admin script to create first System Admin (08-deploy step 7)

## Phase 3 — Academic Structure, Users & Profiles (25–43)

- [x] 25. Implement academic structure services: campus CRUD
- [x] 26. Implement academic structure services: faculty CRUD
- [x] 27. Implement academic structure services: programme CRUD
- [x] 28. Implement academic structure services: course unit CRUD
- [x] 29. Implement curriculum mapping service (course unit → programme+year+semester)
- [x] 30. Implement academic routes + controllers (System Admin only)
- [x] 31. Implement CSV import: academic structure (faculties, programmes, units, curriculum)
- [x] 32. Implement CSV import: staff accounts (name, email, role)
- [x] 33. Implement user management service: list/filter users by role
- [x] 34. Implement user management: deactivate/activate/change role
- [x] 35. Implement user management routes + controllers (System Admin)
- [x] 36. Implement profile completion for students: validate campus→faculty→programme path
- [x] 37. Implement auto-enrolment: create enrollments from curriculum on profile save
- [x] 38. Implement profile completion for lecturers: select faculty only
- [x] 39. Implement profile edit + enrolment recalculation (FR-02.5/02.6)
- [x] 40. Implement profile routes + controller
- [x] 41. Implement lecturer assignment service: assign/remove lecturer to unit
- [x] 42. Implement lecturer assignment routes (Faculty Admin)
- [x] 43. Implement session code generator: 6-char safe pool, no O/0/I/1/B/8/S/5

## Phase 4 — Sessions, Check-In & Attendance (44–60)

- [x] 44. Implement session service: open session (validate assignment, one active per unit)
- [x] 45. Implement session service: list own sessions (scoped to assigned units)
- [x] 46. Implement session detail + live check-in count
- [x] 47. Implement close session: auto-mark absences for non-checked-in enrolled students
- [x] 48. Implement reopen session (same day only, FR-05.9)
- [x] 49. Implement session routes + controller
- [x] 50. Implement check-in service: validate code, expiry, enrolment, one per session
- [x] 51. Implement POST /checkin route + controller
- [x] 52. Implement attendance service: my attendance per unit (current semester)
- [x] 53. Implement attendance service: session attendance list
- [x] 54. Implement attendance service: unit summary
- [x] 55. Implement manual attendance edit: status + required reason (FR-07.4/07.5)
- [x] 56. Implement audit log write on attendance edit (attendance_edits + audit_logs)
- [x] 57. Implement attendance routes + controller
- [x] 58. Implement attendance percentage calculation service (formula FR-07.3)
- [x] 59. Implement alert evaluation service: detect 80% warning / 75% critical crossings
- [x] 60. Implement alert deduplication: once per crossing, re-fire on recovery+re-drop (FR-08.5/08.6)

## Phase 5 — Email, Dashboards, Reports & Audit (61–79)

- [x] 61. Implement email service via Nodemailer + Google SMTP
- [x] 62. Implement alert email templates (student, lecturer, faculty admin recipients)
- [x] 63. Implement alert routes/controller (list alerts)
- [x] 64. Implement student dashboard service: units, %, eligibility, recent check-ins, weekly chart
- [x] 65. Implement lecturer dashboard service: units, today's sessions, at-risk students
- [x] 66. Implement faculty admin dashboard service: overview, at-risk counts, lecturer summary
- [x] 67. Implement system admin dashboard service: users, active sessions, import history
- [x] 68. Implement dashboard routes + controller
- [x] 69. Implement report services: lecturer report data
- [x] 70. Implement report services: programme report data
- [x] 71. Implement report services: course unit report data
- [x] 72. Implement report services: student report data
- [x] 73. Implement report routes + controller (JSON endpoints)
- [x] 74. Implement PDF generation service with Puppeteer + HTML template
- [x] 75. Embed UMU badge/logo in PDF templates (base64)
- [x] 76. Implement PDF download endpoints for all 4 report types + lecturer own units
- [x] 77. Implement audit log service: paginated list with filters
- [x] 78. Implement audit log routes + controller (Faculty Admin/System Admin)
- [x] 79. Create server unit tests (jest/vitest) for code generator, percentages, alerts

## Phase 6 — Frontend (80–97)

- [x] 80. Implement client routing: auth guard, role-based redirect (07-nav table)
- [x] 81. Implement API client layer (fetch wrapper with credentials)
- [x] 82. Implement auth context/provider: login, logout, me, refresh on 401
- [x] 83. Build Login screen with Google OAuth button (07 Screen 1)
- [x] 84. Build Access Denied screen
- [x] 85. Build Complete Profile screen (student + lecturer variants, 07 Screen 2/10)
- [x] 86. Build layout: sidebar (desktop) + bottom nav (mobile) + top header
- [x] 87. Build Student dashboard: check-in code entry + attendance list + weekly chart (07 Screen 3)
- [x] 88. Build Lecturer dashboard: open session, today's sessions, at-risk (07 Screen 4)
- [x] 89. Build Open Session form screen (07 Screen 5)
- [x] 90. Build Live Session screen: big code, countdown, live list (07 Screen 6)
- [x] 91. Build Session Detail screen: attendance list, edit modal, PDF (07 Screen 7)
- [x] 92. Build Faculty Admin dashboard: stats, at-risk, reports, lecturers (07 Screen 8)
- [x] 93. Build Faculty Admin reports pages: lecturer/programme/unit/student selectors
- [x] 94. Build System Admin dashboard: stats, setup links, imports (07 Screen 9)
- [x] 95. Build academic structure management UI (campus/faculty/programme/unit CRUD)
- [x] 96. Build user management UI (list, deactivate, role change)
- [x] 97. Build CSV import UI (structure + staff)
- [x] 98. Build shared UI components: Button, Input, Card, Badge, ProgressBar, Toast, Modal

## Phase 7 — PWA & DevOps (99–100)

- [ ] 99. Configure PWA: manifest (name, icons, theme #CC0000), service worker, install banner
- [ ] 100. Verify end-to-end: build client, docker compose up, migrations, smoke test, lint/typecheck

---

## Progress

Completed: **98** / 100
