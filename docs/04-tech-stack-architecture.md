# 04 — Tech Stack & Architecture

## Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + Vite + TypeScript | React 18.3, Vite 5.4 |
| Styling | Tailwind CSS | 3.4 |
| PWA | vite-plugin-pwa (Workbox) | 0.20 |
| Charts | Recharts | 2.12 |
| Backend | Node.js + Express + TypeScript | Node 20 LTS |
| Database | MySQL 8 | 8.x |
| ORM | Prisma | Latest |
| Authentication | Google OAuth 2.0 + Passport.js | — |
| Session tokens | JWT in HttpOnly cookies | — |
| PDF generation | Puppeteer (headless Chromium) | — |
| Email alerts | Nodemailer + Google SMTP | — |
| Web server | Nginx (reverse proxy + static files) | alpine |
| Containerisation | Docker + Docker Compose | — |
| Server OS | Ubuntu Server 22.04 LTS | — |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Ubuntu Server 22.04                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Docker Compose                          │   │
│  │                                                          │   │
│  │  ┌──────────┐    ┌─────────────────┐    ┌────────────┐  │   │
│  │  │  Nginx   │───▶│   Node.js API   │───▶│  MySQL 8   │  │   │
│  │  │ :80/:443 │    │   Express       │    │   :3306    │  │   │
│  │  │          │    │    :4000        │    │ (internal) │  │   │
│  │  └────┬─────┘    └────────┬────────┘    └────────────┘  │   │
│  │       │                   │                              │   │
│  │  React PWA           Nodemailer ──▶ Google SMTP          │   │
│  │  (static files)      Puppeteer  ──▶ PDF output           │   │
│  │                      Passport   ──▶ Google OAuth         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │  HTTPS — campus network
         │
 ┌───────┴────────────────────────────────────────┐
 │   Browser / Phone (PWA)                         │
 │   Student      → check-in (mobile + desktop)   │
 │   Lecturer     → session management (mobile +) │
 │   Faculty Admin→ reports (desktop only)         │
 │   System Admin → setup (desktop only)           │
 └────────────────────────────────────────────────┘
```

---

## Clean Architecture — Layers

```
HTTP Request
     ↓
[ Route ]           — endpoint + middleware
     ↓
[ authenticate ]    — JWT verify + re-fetch user from DB (checks isActive, role)
     ↓
[ requireRole ]     — RBAC guard
     ↓
[ Controller ]      — parse request, call service, return response (Zod validation)
     ↓
[ Service ]         — ALL business logic + data scoping
     ↓
[ Prisma / DB ]     — data access only
```

Controllers never contain business logic. Services never touch `req`/`res`.

---

## Security Decisions

### Google OAuth Flow
```
1. User clicks "Sign in with Google"
2. Browser → Google consent screen
3. Google → /api/auth/google/callback with auth code
4. Server exchanges code for user profile (email, name)
5. Email domain check:
   - @stud.umu.ac.ug → student role lookup
   - @umu.ac.ug      → check assigned role in DB
6. Server issues JWT access token (1h) + refresh token (7d) as HttpOnly cookies
7. Browser redirects to role dashboard
```

### JWT in HttpOnly Cookies
- Not readable by JavaScript → XSS-safe
- Sent automatically with every same-origin request
- Refresh token rotation: silent re-issue, old token revoked on rotation

### Auth Middleware — Live DB Check
The JWT payload carries only the user ID (`sub`). On every request, `authenticate`
re-fetches the full user from the database. This means:
- Deactivated accounts are blocked immediately (no waiting for token expiry)
- Role changes take effect on the next request without re-login

### CORS
Only the configured `CLIENT_URL` origin is allowed with credentials.

### Zod Validation
All controller inputs are validated with Zod schemas before reaching services.
Unknown/extra fields are stripped. Type-safe throughout.

---

## Key Architecture Decisions

### Why MySQL?
Client's requirement. Fully supported by Prisma. Identical behaviour on Ubuntu Server.

### Why Puppeteer for PDF?
Reports are styled HTML — Puppeteer renders them accurately with the UMU logo embedded
as a base64 image. No paid library. Runs headlessly in Docker.

### Why Docker Compose?
One command starts the entire system (MySQL, Node.js, Nginx). Repeatable across
environments. Rollback by reverting to previous image.

### Why separate client/ + server/?
Clean API boundary. The API is framework-agnostic and could serve a mobile app later.
No coupling between frontend and backend frameworks.

### Session Code Safety
Code alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
Excluded: `O`, `0` (zero/letter O confusion), `I`, `1` (one/letter I), `B`, `8`, `S`, `5`.
Generates 6 characters → ~1 billion combinations with safe characters.

---

## Docker Compose Services

```yaml
services:
  db:     # MySQL 8 — internal port 3306 only
  app:    # Node.js Express API — internal port 4000 only
  nginx:  # Reverse proxy + static file server — public ports 80, 443
```

Volumes:
- `db_data` — persists MySQL data across container restarts
- `./client/dist` — React production build, served directly by Nginx

---

## Folder Structure (Actual)

```
umu-attendance-system/
├── docs/                          ← Documentation (this folder)
├── client/                        ← React + Vite PWA frontend
│   ├── public/
│   │   ├── umu-logo.png           ← App icon source
│   │   ├── icon-192x192.png       ← PWA icon
│   │   ├── icon-512x512.png       ← PWA icon (maskable)
│   │   └── apple-touch-icon.png   ← iOS home screen icon
│   └── src/
│       ├── pages/                 ← One file per route
│       ├── components/
│       │   ├── Layout.tsx         ← Sidebar + mobile nav + desktop-only gate
│       │   ├── InstallPrompt.tsx  ← PWA install banner
│       │   ├── RouteGuards.tsx    ← RequireAuth, RequireRole
│       │   └── ui/                ← Button, Card, Badge, Modal, Select, Input…
│       ├── hooks/
│       │   └── usePeriod.ts       ← Reads global period from System Admin setting
│       ├── api/
│       │   ├── client.ts          ← Fetch wrapper with cookie credentials
│       │   └── endpoints.ts       ← All API call functions + TypeScript types
│       ├── context/
│       │   ├── AuthContext.tsx
│       │   └── ToastContext.tsx
│       └── types/
│           └── index.ts
├── server/                        ← Node.js Express API
│   ├── prisma/
│   │   └── schema.prisma          ← Database schema
│   └── src/
│       ├── config/                ← DB, passport, env
│       ├── middleware/
│       │   ├── auth.ts            ← JWT verify + live DB check
│       │   └── role.ts            ← requireRole RBAC guard
│       ├── routes/                ← One router per domain
│       ├── controllers/           ← Thin: parse → service → respond
│       ├── services/              ← All business logic
│       └── utils/
│           ├── apiResponse.ts     ← ok(), ApiError
│           └── attendanceCalc.ts  ← Percentage + status helpers
├── devops/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── nginx/
│   └── scripts/                   ← deploy.sh, backup-db.sh
└── README.md
```

---

## Environment Variables

```bash
# Server
NODE_ENV=production
PORT=4000
CLIENT_URL=https://attendance.umu.ac.ug

# Database
DATABASE_URL=mysql://umu_user:strongpassword@db:3306/umu_attendance

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://attendance.umu.ac.ug/api/auth/google/callback

# JWT
JWT_ACCESS_SECRET=random-64-char-string
JWT_REFRESH_SECRET=random-64-char-string

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=attendance@umu.ac.ug
SMTP_PASS=google-app-password

# PDF (logo is committed at server/assets/umu-logo.svg and embedded as base64 — no env var needed)
```
