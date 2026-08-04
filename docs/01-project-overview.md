# 01 — Project Overview

## Background

Uganda Martyrs University (UMU), Nkozi Campus, currently tracks student attendance using
paper sign-in sheets. Students sign against their names, the class representative collects
the sheets, and the lecturer confirms them. There is no digital record, no real-time
visibility, and no automated enforcement of the university's 75% minimum attendance policy.

This project replaces that process with a purpose-built web-based attendance management
system.

---

## Goal

Build a **Progressive Web App (PWA)** that digitises attendance tracking at UMU Nkozi
Campus. The system must be simple enough for students to use in a classroom in under
30 seconds and powerful enough for Faculty Admin to generate meaningful academic reports.

---

## How It Works — Simple Flow

```
System Admin sets up:
Campus → Faculty → Programme → Year → Semester → Course Units

Lecturer logs in → opens a session → system generates a 6-character code

Students log in → enter the code → marked Present

Session closes → absentees auto-recorded

Faculty Admin monitors → generates reports → downloads PDF
```

---

## Scope — Phase 1 (Nkozi Campus)

| In Scope | Out of Scope |
|---|---|
| Nkozi Campus only | Other campuses (Phase 2) |
| Web PWA (bookmarkable on phone + PC) | Native mobile apps |
| Google OAuth login only | Password-based login |
| Student self-registration via profile completion | Manual student CSV import |
| Code-based student check-in | Biometric / QR code check-in |
| Course-unit level attendance tracking | Programme-level aggregation reports |
| PDF reports for Faculty Admin | Moodle integration |
| Email alerts for threshold breaches | SMS alerts |
| Docker-based deployment on Ubuntu Server | Cloud deployment |

---

## Key Outcomes

1. A lecturer can open an attendance session in under 1 minute.
2. A student can check in by entering a 6-character code — no app installation required.
3. The system automatically records absences when a session closes.
4. Faculty Admin receives automatic alerts at 80% (warning) and 75% (critical).
5. Faculty Admin can download PDF reports on lecturers, programmes, units, and students.
6. All 4 roles have a personalised dashboard.

---

## Stakeholders

| Role | Interest |
|---|---|
| Student | Check in, view own attendance and eligibility status |
| Lecturer | Open sessions, manage attendance, view class reports |
| Faculty Admin | Monitor faculty, assign lecturers, generate PDF reports, receive alerts |
| System Admin | Set up academic structure, manage user accounts, maintain system |

---

## Academic Structure

```
Nkozi Campus
    └── Faculty (e.g. Faculty of Science)
            └── Programme (e.g. BSCS)
                    └── Year (e.g. Year 3)
                            └── Semester (e.g. Semester 1)
                                    └── Course Unit (e.g. Web Development)
```

Course units can be **shared** across programmes. Example: BSCS Year 3 and BSIT Year 3
both take Web Development — same session, same attendance list, same lecturer.

---

## Attendance Policy

| Attendance | Status | Action |
|---|---|---|
| Above 80% | Good ✅ | No action |
| At or below 80% | Warning ⚠️ | Alert sent to student, lecturer, faculty admin |
| Below 75% | Not Eligible 🚨 | Critical alert sent to student, lecturer, faculty admin |

---

## Constraints

- Runs on **Ubuntu Server 22.04 LTS** (self-hosted, Nkozi Campus)
- Deployed via **Docker + Docker Compose**
- Must work on campus internet — no offline mode required
- PDF reports must carry the **official UMU badge/logo**
- All users authenticate via **Google OAuth only** — no passwords
- Students use `@stud.umu.ac.ug`, staff use `@umu.ac.ug`
