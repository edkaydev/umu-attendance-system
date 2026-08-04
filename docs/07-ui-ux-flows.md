# 07 — UI/UX Flows

## Design Principles
- **Mobile-first** — students and lecturers use phones in class
- **One primary action per screen** — no clutter during live sessions
- **UMU brand colours** — maroon `#7B1C2E`, gold `#C9A84C`, white background
- **Large tap targets** — minimum 48×48px buttons
- **Clear feedback** — every action shows loading, success, or error state

---

## User Flows

### Flow 1: First Login (All Roles)
```
Open app
  → Click "Sign in with Google"
  → Google consent screen
  → Callback: email domain check
      @stud.umu.ac.ug → Student profile setup
      @umu.ac.ug      → Check role in DB
                          → Lecturer profile setup (if new)
                          → Dashboard (if existing)
  → If email not in system → "Access denied" screen
```

### Flow 2: Student Check-In
```
Student Dashboard
  → Enter 6-char code
  → Submit
  → ✅ Success banner OR ❌ Error message
  → Attendance % updates on dashboard
```

### Flow 3: Lecturer Session
```
Lecturer Dashboard
  → "Open Session" button
  → Select course unit + optional venue
  → Session opens → BIG code displayed
  → Students check in (live counter updates)
  → "Close Session" → absences auto-recorded
```

---

## Screens

### Screen 1 — Login (`/login`)
```
┌─────────────────────────────────┐
│        [UMU Badge Logo]         │
│   Uganda Martyrs University     │
│      Attendance System          │
│                                 │
│   ┌─────────────────────────┐   │
│   │   Sign in with Google   │   │
│   └─────────────────────────┘   │
│                                 │
│   Nkozi Campus · 2025/2026      │
└─────────────────────────────────┘
```

---

### Screen 2 — Complete Profile: Student (`/profile/setup`)
```
┌─────────────────────────────────┐
│  Welcome, Jane!  Step 1 of 1    │
│  Complete your profile          │
│─────────────────────────────────│
│  Faculty        [▼ Select]      │
│  Programme      [▼ Select]      │
│  Year           [▼ 1 2 3 4]     │
│  Semester       [▼ 1  2]        │
│  Academic Year  [▼ 2025/2026]   │
│  Reg Number     [____________]  │
│                                 │
│  [      Save & Continue     ]   │
└─────────────────────────────────┘
```

---

### Screen 3 — Student Dashboard (`/student`)
```
┌─────────────────────────────────┐
│  👤 Jane Atim        [Logout]   │
│  BSCS · Year 3 · Sem 1          │
│─────────────────────────────────│
│  Enter session code             │
│  ┌─────────────────────────┐    │
│  │   _ _ _ _ _ _           │    │
│  └─────────────────────────┘    │
│  [       CHECK IN        ]      │
│─────────────────────────────────│
│  My Attendance — Sem 1          │
│                                 │
│  Web Development      88% ✅    │
│  ████████████░░░░                │
│                                 │
│  Database Systems     79% ⚠️    │
│  ██████████░░░░░░                │
│                                 │
│  Networks             65% 🚨    │
│  ████████░░░░░░░░                │
└─────────────────────────────────┘
```

Status badges: ✅ Good (>80%) · ⚠️ Warning (75–80%) · 🚨 Not Eligible (<75%)

---

### Screen 4 — Lecturer Dashboard (`/lecturer`)
```
┌─────────────────────────────────┐
│  👤 Dr. Nakato       [Logout]   │
│─────────────────────────────────│
│  [+ Open New Session]           │
│─────────────────────────────────│
│  TODAY'S SESSIONS               │
│  Web Development   🟢 OPEN      │
│  23/45 checked in  [View Live]  │
│─────────────────────────────────│
│  AT RISK (below 75%)            │
│  Okello J. · Networks  · 68%    │
│  Auma G.  · Databases  · 71%    │
│─────────────────────────────────│
│  MY UNITS                       │
│  Web Development        82% avg │
│  Database Systems       78% avg │
│  [View] [PDF]                   │
└─────────────────────────────────┘
```

---

### Screen 5 — Open Session (`/lecturer/sessions/new`)
```
┌─────────────────────────────────┐
│  ←  Open Attendance Session     │
│─────────────────────────────────│
│  Course Unit                    │
│  [▼ Web Development — BCS3101]  │
│                                 │
│  Venue (optional)               │
│  [  Lab 2 / Google Meet link  ] │
│                                 │
│  [      OPEN SESSION       ]    │
└─────────────────────────────────┘
```

---

### Screen 6 — Live Session (`/lecturer/sessions/:id/live`)
```
┌─────────────────────────────────┐
│  Web Development · 04 Aug 2026  │
│  [Close Session]                │
│─────────────────────────────────│
│                                 │
│     SESSION CODE                │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │      A 4 X 7 K 2          │  │
│  │    (very large font)      │  │
│  │                           │  │
│  └───────────────────────────┘  │
│     Expires in  03:42           │
│                                 │
│  27 of 45 checked in            │
│  ████████████████░░░░░░          │
│─────────────────────────────────│
│  ✅ Nakato Sarah    10:02       │
│  ✅ Wasswa Peter    10:01       │
│  ✅ Auma Grace      10:00       │
└─────────────────────────────────┘
```

---

### Screen 7 — Session Detail (`/lecturer/sessions/:id`)
```
┌─────────────────────────────────┐
│  ←  Web Development             │
│  04 Aug 2026 · Closed           │
│─────────────────────────────────│
│  40 Present  3 Absent  2 Excused│
│─────────────────────────────────│
│  🔍 Search student...           │
│─────────────────────────────────│
│  Nakato Sarah    ✅ Present     │
│  Wasswa Peter    ✅ Present     │
│  Okello James    ❌ Absent [Edit]│
│  Auma Grace      🔵 Excused     │
│─────────────────────────────────│
│  [   Download PDF Report   ]    │
└─────────────────────────────────┘
```

Edit modal (when lecturer clicks Edit):
```
Change Attendance
Student: Okello James
Status: [▼ Excused]
Reason: [Medical — submitted sick note]
[Save Change]
```

---

### Screen 8 — Faculty Admin Dashboard (`/faculty-admin`)
```
┌─────────────────────────────────┐
│  Faculty of Science   [Logout]  │
│─────────────────────────────────│
│  🚨 8 students Not Eligible     │
│  ⚠️  5 students Warning         │
│  [View All At-Risk]             │
│─────────────────────────────────│
│  Semester 1 · 2025/2026         │
│  Sessions held:    142          │
│  Avg attendance:   81%          │
│─────────────────────────────────│
│  REPORTS                        │
│  [👤 Lecturer] [📚 Programme]   │
│  [📖 Unit    ] [🎓 Student  ]   │
│─────────────────────────────────│
│  LECTURERS                      │
│  Dr. Nakato  · 3 units  · 82%   │
│  Mr. Ssekandi· 2 units  · 76%   │
└─────────────────────────────────┘
```

---

### Screen 9 — System Admin Dashboard (`/system-admin`)
```
┌─────────────────────────────────┐
│  System Admin        [Logout]   │
│─────────────────────────────────│
│  Users:   523  Active sessions: 4│
│─────────────────────────────────│
│  SETUP                          │
│  [🏫 Academic Structure]        │
│  [👥 Manage Users      ]        │
│  [📥 Import Data       ]        │
│─────────────────────────────────│
│  RECENT IMPORTS                 │
│  Staff CSV · 04 Aug · 12 records│
│  Curriculum · 01 Aug · 48 units │
│─────────────────────────────────│
│  [View System Logs]             │
└─────────────────────────────────┘
```

---

### Screen 10 — Complete Profile: Lecturer (`/profile/setup`)
```
┌─────────────────────────────────┐
│  Welcome, Dr. Nakato!           │
│  Select your faculty            │
│─────────────────────────────────│
│  Faculty   [▼ Faculty of Science]│
│                                 │
│  [     Save & Continue      ]   │
│                                 │
│  Your unit assignments will be  │
│  set by the Faculty Admin.      │
└─────────────────────────────────┘
```

---

## Navigation by Role

| Role | Default Route | Sidebar Links |
|---|---|---|
| Student | `/student` | Dashboard, My Attendance |
| Lecturer | `/lecturer` | Dashboard, Sessions, My Units |
| Faculty Admin | `/faculty-admin` | Dashboard, Reports, Assignments, Audit Log |
| System Admin | `/system-admin` | Dashboard, Academic Setup, Users, Imports, System Log |

---

## PWA Install Banner
```
┌─────────────────────────────────┐
│ 📲 Add UMU Attendance to your   │
│    home screen for quick access │
│  [Add]              [Dismiss]   │
└─────────────────────────────────┘
```
- Android/Chrome: triggers native "Add to Home Screen"
- iOS/Safari: shows "Tap Share → Add to Home Screen"
- App icon: UMU badge, theme colour maroon `#7B1C2E`
