# 01 — Project Overview

## Background

Uganda Martyrs University (UMU), Nkozi Campus, tracked student attendance using paper
sign-in sheets. This project replaces that process with a purpose-built web-based attendance
management system.

---

## Goal

A **Progressive Web App (PWA)** that digitises attendance tracking at UMU Nkozi Campus.
Simple enough for students to check in within 30 seconds. Powerful enough for Faculty Admin
to generate meaningful academic reports.

---

## How It Works

```
System Admin sets up:
  Campus → Faculty → Programme → Course Units → Curriculum mapping

System Admin sets the current academic year and semester (global setting).

Lecturer logs in → opens a session for an assigned unit → 6-character code generated

Students log in → enter the code → marked Present

Session closes → absentees auto-recorded

Faculty Admin monitors → generates reports → downloads PDF
```

---

## Scope — Phase 1 (Nkozi Campus)

| In Scope | Out of Scope |
|---|---|
| Nkozi Campus only | Other campuses (Phase 2) |
| Web PWA (installable on phone + PC) | Native mobile apps |
| Google OAuth login only (works fully with password sign-in too) | Google as the *only* auth method |
| Student self-registration via profile completion + bulk CSV import | — |
| Code-based student check-in | Biometric / QR code check-in |
| Course-unit level attendance tracking | — |
| PDF reports for Faculty Admin + Lecturer | Moodle integration |
| Email alerts for threshold breaches | SMS alerts |
| Docker-based deployment on Ubuntu Server | Cloud deployment |

---

## Key Outcomes (Built)

1. A lecturer opens a session in under 1 minute, selects duration and code validity.
2. A student checks in by entering a 6-character code — no app install required.
3. The system auto-records absences when a session closes.
4. Alerts fire automatically at ≤80% (warning) and <75% (critical) per course unit.
5. Faculty Admin downloads PDF reports for lecturers, programmes, units, and students.
6. Lecturers download PDF reports for their own course units.
7. All 4 roles have a personalised, role-scoped dashboard.
8. System Admin sets the active academic year and semester — all other roles see that period automatically.
9. Students and lecturers can install the app on their phone home screen (PWA). Faculty Admin and System Admin use desktop only.

---

## Stakeholders

| Role | Interest |
|---|---|
| Student | Check in, view own attendance and eligibility status |
| Lecturer | Open/close sessions, manage attendance, view class reports, download PDF |
| Faculty Admin | Monitor faculty, assign lecturers, generate PDF reports, receive alerts |
| System Admin | Set up academic structure, manage users, set active period |

---

## Academic Structure

```
Nkozi Campus
    └── Faculty (e.g. Faculty of Science)
            └── Programme (e.g. BSCS)
                    └── CurriculumUnit (Programme + Year + Semester + CourseUnit)
                                └── Course Unit (e.g. Database Systems)
```

Course units can be **shared** across programmes — one session, one attendance list.
Sharing is managed by System Admin (share a unit to another faculty) or via curriculum mapping.

---

## Attendance Policy

| Attendance | Status | Action |
|---|---|---|
| Above 80% | Good ✅ | No action |
| At or below 80% | Warning ⚠️ | Email alert to student, lecturer(s), Faculty Admin |
| Below 75% | Not Eligible 🚨 | Critical email alert |

Alerts fire once per threshold crossing per course unit. If attendance recovers and
drops again, a new alert fires.

---

## Constraints

- Runs on **Ubuntu Server 22.04 LTS** (self-hosted, Nkozi Campus)
- Deployed via **Docker + Docker Compose**
- Must work on campus network — no offline mode
- PDF reports include the UMU logo
- Accounts sign in with **email + password**; Google OAuth is available once the UMU Workspace approves the app
- Students use `@stud.umu.ac.ug`, staff use `@umu.ac.ug`
- Faculty Admin and System Admin: **desktop browsers only**
- Students and Lecturers: mobile + desktop (PWA)
