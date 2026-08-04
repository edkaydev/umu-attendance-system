# 04 — Tech Stack & Architecture

## Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast builds, component-based, strong typing |
| Styling | Tailwind CSS | Utility-first, easy UMU brand theming |
| PWA | Vite PWA Plugin (Workbox) | Service worker + manifest with minimal config |
| Charts | Recharts | Lightweight, React-native chart library |
| Backend | Node.js 20 LTS + Express + TypeScript | Same language front and back, large ecosystem |
| Database | MySQL 8 | Relational, reliable, runs well on Ubuntu |
| ORM | Prisma | Type-safe queries, auto migrations, MySQL support |
| Authentication | Google OAuth 2.0 + Passport.js | No passwords, Google Workspace integration |
| Session tokens | JWT (HttpOnly cookies) | Secure, stateless, XSS-resistant |
| PDF generation | Puppeteer (headless Chromium) | Renders styled HTML to PDF with UMU badge |
| Email alerts | Nodemailer + Google SMTP | Simple, reliable, uses existing UMU Google accounts |
| Web server | Nginx | Reverse proxy, serves React static files, SSL |
| Process manager | PM2 (inside Docker) | Auto-restart, log management |
| Containerisation | Docker + Docker Compose | Repeatable deployment, isolates services |
| Server OS | Ubuntu Server 22.04 LTS | Stable, free, excellent Docker support |

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
│  │  │ :80/:443 │    │   Express+PM2   │    │   :3306    │  │   │
│  │  │          │    │    :4000        │    │            │  │   │
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
 ┌───────┴────────────────────────────┐
 │   Browser / Phone (PWA)            │
 │   Student  → check-in page         │
 │   Lecturer → session management    │
 │   Faculty Admin → reports          │
 │   System Admin → setup + imports   │
 └────────────────────────────────────┘
```

---

## Clean Architecture — Layers

Every feature follows this strict layering. Business logic never touches Express or Prisma directly.

```
HTTP Request
     ↓
[ Route ]           — defines the endpoint and applies middleware
     ↓
[ Middleware ]      — auth (JWT verify) + role guard (RBAC)
     ↓
[ Controller ]      — parses request, calls service, returns response
     ↓
[ Service ]         — ALL business logic lives here
     ↓
[ Prisma / DB ]     — data access only, no logic
```

Example for opening a session:

```
POST /api/sessions
  → auth middleware (is JWT valid?)
  → role middleware (is role === 'lecturer'?)
  → SessionController.openSession()
      → SessionService.openSession(lecturerId, courseUnitId)
          → validate lecturer is assigned to unit
          → check no active session exists
          → generate 6-char code
          → write to DB via Prisma
          → return session object
  → 201 Created { session }
```

---

## Security Decisions

### Google OAuth Flow
```
1. User clicks "Sign in with Google"
2. Browser redirects to Google consent screen
3. Google redirects back to /api/auth/google/callback with auth code
4. Server exchanges code for user profile (email, name)
5. Server checks email domain:
   - @stud.umu.ac.ug → student
   - @umu.ac.ug → check role in DB
6. Server issues JWT access token (1hr) + refresh token (7d) in HttpOnly cookies
7. Browser redirects to correct dashboard based on role
```

### JWT in HttpOnly Cookies
- JavaScript cannot read HttpOnly cookies → protected from XSS attacks
- Every API request automatically sends the cookie → no manual token management
- Refresh token rotation: silent re-issue before expiry

### CORS
```typescript
// Only the frontend origin is allowed
app.use(cors({
  origin: process.env.CLIENT_URL, // e.g. https://attendance.umu.ac.ug
  credentials: true,              // allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}))
```

### RBAC Middleware
```typescript
export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}
```

---

## Key Architecture Decisions

### Why MySQL over PostgreSQL?
Client's explicit preference. Both are fully supported by Prisma and run identically on Ubuntu Server.

### Why Puppeteer for PDF?
PDF reports are styled HTML pages. Puppeteer renders them with pixel-perfect accuracy.
Easy to embed the UMU badge as a base64 image. No paid library needed. Runs headlessly in Docker.

### Why Docker Compose?
Instead of manually installing Node.js, MySQL, and Nginx on the server one by one,
Docker Compose defines everything in one file. A single command starts the entire system.
Upgrades and rollbacks become trivial.

### Why not a monorepo framework (Next.js)?
Separate `client/` and `server/` gives a clean API that could later serve a mobile app
or other clients. The API is not coupled to any frontend framework.

---

## Docker Compose Services

```yaml
services:
  db:       # MySQL 8 container
  app:      # Node.js Express API (PM2 inside)
  nginx:    # Reverse proxy + static file server
```

Volumes:
- `db_data` — persists MySQL data across container restarts
- `./client/dist` — React production build, served by Nginx

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

# PDF
UMU_BADGE_PATH=/app/assets/umu-badge.png
```

---

## Folder Structure

```
umu-attendance-system/
├── docs/                          ← Planning documents
├── client/                        ← React + Vite frontend
│   ├── public/
│   │   ├── manifest.json
│   │   ├── umu-badge.png
│   │   └── icons/
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── hooks/
│       ├── api/
│       ├── context/
│       ├── types/
│       └── utils/
├── server/                        ← Node.js Express API
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── config/
│       ├── middleware/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       └── utils/
├── devops/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── nginx/
│   └── scripts/
├── .gitignore
└── README.md
```
