# 07 — UI/UX Flows

## Design Principles
- **Mobile-first for Students and Lecturers** — phones in class, quick check-in
- **Desktop-only for Faculty Admin and System Admin** — data-heavy, table-driven
- **One primary action per screen** during live sessions
- **UMU brand**: red `#CC0000`, yellow `#F5C800`, white background
- **Minimum 44×44px tap targets** on all interactive elements
- **Loading, success, and error states** on every action

---

## Device Policy

| Role | Mobile | Desktop |
|---|---|---|
| Student | ✅ Full PWA | ✅ |
| Lecturer | ✅ Full PWA | ✅ |
| Faculty Admin | ❌ "Desktop required" screen | ✅ |
| System Admin | ❌ "Desktop required" screen | ✅ |

---

## Navigation

### Desktop (≥768px) — All roles
Left sidebar (240px wide):
- Logo + "UMU Attendance" header
- Nav items with icon + label, active item highlighted red
- User name, email, role at the bottom
- Right column: top header bar + page content (max-width 1200px, padding 32px)

### Mobile (<768px) — Student & Lecturer only
- Slim top header: UMU logo + "UMU Attendance" + logout icon
- Bottom navigation bar (fixed, 64px + safe-area-inset):
  - Tabs use `NavLink` — active tab highlighted red with pill background
  - Student: Dashboard · Attendance · Profile
  - Lecturer: Dashboard · Sessions · Profile

---

## User Flows

### Flow 1: First Login
```
Open app → Sign in with Google
  → Google consent screen
  → Callback: domain check
      @stud.umu.ac.ug → student profile setup
      @umu.ac.ug      → role lookup in DB
                          → lecturer profile setup (if new)
                          → dashboard (if returning)
  → Email not in system → "Access denied — contact your administrator"
```

### Flow 2: Student Check-In
```
Student Dashboard
  → Live sessions panel shows open sessions for enrolled units
  → Click "Check In" on a session card
  → Modal: enter 6-char code
  → Submit (or press Enter)
  → ✅ Toast: "Checked in to Database Systems"
  → Session card updates to show ✓ Checked in
```

### Flow 3: Lecturer Opens Session
```
Lecturer Dashboard or Sessions page
  → Click "Open Session"
  → Select course unit (dropdown, filtered to assigned units for current period)
  → Set mode (Physical / Online), optional venue, start time
  → Set Class Duration (no auto-close to 180 min) and Code Validity (5–60 min)
  → Submit
  → Redirected to Live Session screen
```

### Flow 4: Lecturer Live Session
```
Live Session screen
  → BIG session code displayed prominently
  → Countdown timer (refreshes every second)
  → Real-time check-in list (polls every 5s)
  → Present / Enrolled count
  → "Extend" button adds more time to code
  → "Close Session" → absences auto-recorded → redirected to Session Detail
```

### Flow 5: Faculty Admin Generates PDF
```
Reports page → select report type tab (Programme / Course Unit / Lecturer / Student)
  → Select entity from dropdown
  → Academic Year and Semester shown as read-only (from System Admin setting)
  → Click "Generate Report"
  → Report preview renders in the page
  → "Download PDF" button unlocks
  → Click → fetch with credentials → saves as "[Unit Code]-report-2025_2026-sem1.pdf"
```

---

## Screens

### Login (`/login`)
```
┌─────────────────────────────────┐
│        [UMU Logo]               │
│   Uganda Martyrs University     │
│      Attendance System          │
│                                 │
│   ┌─────────────────────────┐   │
│   │   Sign in with Google   │   │
│   └─────────────────────────┘   │
│                                 │
│   Nkozi Campus                  │
└─────────────────────────────────┘
```

---

### Student Dashboard (`/student`)
```
┌─────────────────────────────────┐
│  UMU Attendance       [Logout]  │
├─────────────────────────────────┤
│  Welcome back, Jane             │
│  Academic Year 2025/2026 · Sem 1│
├─────────────────────────────────┤
│  LIVE NOW                       │
│  Database Systems               │
│  CSC3301 · Physical · Room 2    │
│  Expires in 03:42    [Check In] │
├─────────────────────────────────┤
│  [3 Units] [2 Above 80%] [85%] │
├─────────────────────────────────┤
│  [This Week bar chart]          │
├─────────────────────────────────┤
│  DATABASE SYSTEMS  88% ✅       │
│  ████████████░░░░               │
│  WEB DEVELOPMENT   79% ⚠️       │
│  ██████████░░░░░░               │
│  NETWORKS          65% 🚨       │
│  ████████░░░░░░░░               │
├─────────────────────────────────┤
│  [Dashboard] [Attendance] [Me]  │
└─────────────────────────────────┘
```

Check-in modal (bottom sheet style on mobile):
```
Check in — Database Systems
CSC3301 · Physical · Expires in 03:42
[_ _ _ _ _ _]  (large code input, monospace)
[Cancel]  [Check In]
```

---

### Lecturer Dashboard (`/lecturer`)
```
┌─────────────────────────────────┐
│  UMU Attendance       [Logout]  │
├─────────────────────────────────┤
│  Welcome back, Dr. Nakato       │
│  Wednesday, August 5, 2026      │
│          [Open New Session]     │
├─────────────────────────────────┤
│  🟢 1 session currently open   │
│  Database Systems · Physical   │
│                  [Go Live]      │
├─────────────────────────────────┤
│  [3 Units] [2 Sessions Today]   │
│  [1 At Risk]                    │
├─────────────────────────────────┤
│  TODAY'S SESSIONS               │
│  Database Systems  🟢  [Live]   │
│  Web Dev           ⚫  [View]   │
├─────────────────────────────────┤
│  [Dashboard] [Sessions] [Me]    │
└─────────────────────────────────┘
```

---

### Open Session (`/lecturer/sessions/new`)
```
Open a Session
──────────────
Course Unit     [▼ Database Systems (CSC3301) · 2025/2026 Sem 1]

Mode            [ Physical (In-Person) ]  [ Online ]

Venue (optional) [Room 2]

Session Start Time (optional) [date-time picker]

Class Duration    [▼ 1 hour]
Code Validity     [▼ 5 minutes]

Info: Class Duration = how long session runs.
      Code Validity = how long students have to enter code.

[Open Session]
```

---

### Live Session (`/lecturer/sessions/:id/live`)
```
Database Systems · Aug 5, 2026
                       [Extend] [Close Session]
──────────────────────────────────────────────

    SESSION CODE

┌──────────────────────────────┐
│                              │
│     A  4  X  7  K  2         │  ← 72px monospace, UMU Red
│                              │
└──────────────────────────────┘
         Expires in  03:42

     23 of 45 checked in
    ████████████████░░░░░░

──────────────────────────────────────────────
✅  Nakato Sarah        10:02
✅  Wasswa Peter        10:01
✅  Auma Grace          10:00
```

---

### Session Detail (`/lecturer/sessions/:id` and `/faculty-admin/sessions/:id`)
```
← Back to Sessions
Database Systems                         [Closed]
CSC3301 · 2025/2026 · Semester 1 · Physical · Room 2 · Aug 5, 2026

  [Reopen Session]  (lecturer, same day only)
  [Generate Report] → [Download PDF]

⚠️  Session is still open.  (if status = open)
   Records are not final — editing available after close.

[40 Present] [3 Absent] [2 Excused] [45 Total]

Attendance Records (45)
──────────────────────────────────────────────────────────
Student          Reg Number      Status    Checked In   Last Edit
Nakato Sarah     BSCS/2025/0001  ✅ Present  10:02       —
Okello James     BSCS/2025/0003  ❌ Absent   —           present → absent: sick
                                                          [Edit]  ← lecturer only
```

Edit modal:
```
Edit attendance — Okello James
Current status: Absent
New status:     [▼ Excused]
Reason:         [Medical note submitted]
This change will be recorded in the audit log.
[Cancel]  [Save Change]
```

---

### Faculty Admin Dashboard (`/faculty-admin`)
```
Faculty of Science
Attendance overview for your faculty    [Generate Reports]
──────────────────────────────────────────────────────────
[4 Course Units] [1 Students] [5 Lecturers] [3 Today] [2 Alerts]

Students | Lecturers          Search: [___________]
──────────────────────────────────────────────────────────
Student         Reg Number      Status     
Dev Student     BSCS/2025/0002  🚨 Critical    [Units →]

──────────────────────────────────────────────────────────
Programmes
Bachelor of Science in Computer Science (BSCS)
100% ████████████████████  2 enrolled

Sessions → · Reports → · Units →
```

---

### Faculty Admin Sessions (`/faculty-admin/sessions`)
```
Sessions
2025/2026 · Semester 1

[📅 Today]  [▼ All sessions]

Course Unit       Lecturer      Time        Mode      Present  Status
Database Systems  Dr. Nakato    06:20 PM    Physical  0        ⚫ Closed  [View]
```

---

### Reports Page (`/faculty-admin/reports`)
```
Reports
Generate and download attendance reports for your faculty.

[Programme] [Course Unit] [Lecturer] [Student]  ← tabs

Programme Attendance report
──────────────────────────────────────────────
Search programmes…
Programme     [▼ Bachelor of Science in Computer Science]

Academic Year  2025/2026     (read-only)
Semester       Semester 1    (read-only)

[Generate Report]    [↓ Download PDF]

──────────────────────────────────────────────
Report Preview
BSCS · 2025/2026 · Semester 1
…table of units, sessions, avg attendance…

               [Download this report as PDF →]
```

---

### System Admin Dashboard (`/system-admin`)
```
System Admin Dashboard
──────────────────────────────────────────────
[1 Total] [0 Students] [1 Lecturers] [1 FA] [1 SA] [3 Active Today]

Recent Imports
Staff CSV · 2 records · Aug 4, 2026

Recent Activity
LOGIN · Dev Student · Aug 5, 2026
SESSION_OPEN · Dev Lecturer · Aug 5, 2026

──────────────────────────────────────────────
Academic Setup · Users · Imports · System Log
Current Period: 2025/2026 · Semester 1        [Edit]
Profile Editing: Students ✅ · Lecturers ✅
```

---

## PWA Install Banner
```
┌──────────────────────────────────┐
│ [UMU Logo]  Install UMU Attend   │
│             Get instant access   │
│             from your home screen│
│   [Not now]          [Install]   │
└──────────────────────────────────┘
```
- Appears on first visit if the browser supports `beforeinstallprompt`
- Dismissed if already installed (detected via `display-mode: standalone`)
- Positioned bottom-right on desktop, bottom of screen on mobile
