# UMU Attendance System

Attendance management system for Uganda Martyrs University (UMU), Nkozi Campus.
A Progressive Web App (PWA) that digitises student attendance tracking,
replacing paper sign-in sheets.

## How It Works

```
System Admin sets up: Campus → Faculty → Programme → Year → Semester → Course Units
Lecturer logs in → opens a session → system generates a 6-character code
Students log in → enter the code → marked Present
Session closes → absentees auto-recorded
Faculty Admin monitors → generates reports → downloads PDF
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + Recharts |
| Backend | Node.js 20 + Express + TypeScript |
| Database | MySQL 8 + Prisma ORM |
| Auth | Google OAuth 2.0 + Passport.js, JWT in HttpOnly cookies |
| PDF | Puppeteer (headless Chromium) |
| Email | Nodemailer + Google SMTP |
| Deployment | Docker + Docker Compose + Nginx (Ubuntu Server 22.04) |

## Roles

- **Student** — check in via session code, view own attendance
- **Lecturer** — open/close sessions, manage attendance, view class reports
- **Faculty Admin** — monitor faculty, assign lecturers, generate PDF reports, receive alerts
- **System Admin** — set up academic structure, manage accounts, imports

## Repo Layout

```
├── docs/       ← Planning documents + ready-to-upload demo CSVs (docs/demo-data/)
├── client/     ← React + Vite PWA frontend
├── server/     ← Express API + Prisma
└── devops/     ← Docker Compose, Nginx, deploy scripts
```

## Getting Started (Development)

```bash
# Server
cd server
npm install
cp .env.example .env        # fill in DB + Google OAuth credentials
npm run db:migrate
npm run dev

# Client (separate terminal)
cd client
npm install
npm run dev
```

See [docs/08-deployment-guide.md](docs/08-deployment-guide.md) for production deployment.

## Demo Data

Complete, ready-to-upload demo datasets for Nkozi Campus (faculties, programmes,
course units, curriculum, staff, and 4,000 students) live in
[`docs/demo-data/`](docs/demo-data/) — import in the order given in its README.
