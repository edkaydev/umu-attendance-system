# 08 — Deployment Guide

## Target Environment
- **Server OS:** Ubuntu Server 22.04 LTS or 24.04 LTS
- **Deployment:** Docker + Docker Compose
- **Domain:** e.g. `attendance.umu.ac.ug` (or `YOUR-IP.sslip.io` while testing)
- **SSL:** Certbot (Let's Encrypt)

> These steps assume a **fresh** server. To redeploy to a new server/domain, see
> [Deploying to a new server or a new domain](#deploying-to-a-new-server-or-a-new-domain).

---

## Services (Docker Compose)

| Service | Image | Port |
|---|---|---|
| `db` | `mysql:8` | 3306 (internal only) |
| `redis` | `redis:7-alpine` | 6379 (internal only) |
| `app` | Custom Node.js build | 4000 (internal only) |
| `nginx` | `nginx:alpine` | 80, 443 (public) |

> `redis` backs API rate limiting; its data is persisted in a Docker volume.

---

## Step 1 — Install Docker

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo usermod -aG docker $USER
newgrp docker
```

---

## Step 2 — Clone the Repository

```bash
sudo mkdir -p /var/www/umu-attendance
sudo chown $USER:$USER /var/www/umu-attendance

git clone https://github.com/edkaydev/umu-attendance-system.git /var/www/umu-attendance
cd /var/www/umu-attendance
```

---

## Step 3 — Configure Environment Variables

Two env files are needed:

- **`server/.env`** — settings for the Node.js app.
- **`.env`** (repo root) — database passwords for Docker Compose.

```bash
cp server/.env.example server/.env
cp .env.example .env
nano server/.env
```

```bash
NODE_ENV=production
PORT=4000
CLIENT_URL=https://attendance.umu.ac.ug

DATABASE_URL=mysql://umu_user:StrongPassword123@db:3306/umu_attendance

GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://attendance.umu.ac.ug/api/auth/google/callback

JWT_ACCESS_SECRET=<64-char-random>
JWT_REFRESH_SECRET=<64-char-random>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=attendance@umu.ac.ug
SMTP_PASS=your-google-app-password
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> The database password in `DATABASE_URL` must **match** `MYSQL_PASSWORD` in the root
> `.env` file. If it contains special characters (like `#`, `@`, `%`), URL-encode it in
> `DATABASE_URL` — e.g. `Console.log#75` becomes `Console.log%2375`.
>
> The logo (`umu-logo.svg`) is already committed in `server/assets/` and embedded into PDFs
> as base64, so no asset or env step is needed after cloning.

---

## Step 4 — SSL with Certbot (BEFORE starting containers)

> **Important:** Nginx needs the certificate file to exist when it starts. Get the
> certificate **before** the first `docker compose up` (Step 5). If Nginx starts first it
> crash-loops with `cannot load certificate "...": No such file or directory`.

Nginx runs inside Docker, so get the certificate with certbot's **standalone** mode. On a
fresh server nothing is using port 80 yet, so it works directly:

```bash
sudo apt install -y certbot

sudo certbot certonly --standalone -d attendance.umu.ac.ug
```

> No domain yet? Use the server IP with a free `sslip.io` subdomain, e.g. for IP
> `41.210.100.50` use `-d 41.210.100.50.sslip.io` and that address everywhere below.
>
> If the containers are already running (e.g. you started early), stop nginx first:
> `cd /var/www/umu-attendance && docker compose stop nginx`, run certbot, then
> `docker compose start nginx`.

Enable auto-renewal (certificates expire every 90 days):
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

Then point the Nginx config (`devops/nginx/umu-attendance.conf`) at your certificate:
change the `ssl_certificate`/`ssl_certificate_key` paths and both `server_name` lines to
your domain.

---

## Step 5 — Build and Start

```bash
# Build React PWA (needs Node.js on the server — see Steps 7–8 of the beginner guide)
cd client && npm install && npm run build && cd ..

# Start all Docker services
docker compose up -d --build

# Verify all containers running
docker compose ps
```

---

## Step 6 — Run Database Migrations

```bash
docker compose exec app npx prisma migrate deploy
```

---

## Step 7 — Seed First System Admin

```bash
docker compose exec app npm run seed:admin
```

Creates the first System Admin account using `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` from `server/.env` (default `edward@umu.ac.ug`). The
login page has an email + password form, so the admin signs in without Google.
After logging in, set the current period (`Settings → Current Period`) before any
other setup.

---

## docker-compose.yml

```yaml
services:
  db:
    image: mysql:8
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: umu_attendance
      MYSQL_USER: umu_user
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  redis:
    image: redis:7-alpine
    restart: always
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  app:
    build: .
    restart: always
    environment:
      REDIS_URL: redis://redis:6379
    env_file: ./server/.env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s
    volumes:
      - ./server/assets:/app/assets
    expose:
      - "4000"

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./devops/nginx/umu-attendance.conf:/etc/nginx/conf.d/default.conf
      - ./client/dist:/usr/share/nginx/html
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - app

volumes:
  db_data:
  redis_data:
```

> `${MYSQL_ROOT_PASSWORD}` and `${MYSQL_PASSWORD}` come from the root `.env` file
> (Step 3). They must match the database password in `server/.env`'s `DATABASE_URL`.

---

## Nginx Config

The config at `devops/nginx/umu-attendance.conf` currently targets the test deployment
(`102.133.161.8.sslip.io`). For a new server, replace the two `ssl_certificate` paths and
both `server_name` values with your own domain.

```nginx
server {
    listen 80;
    server_name YOUR-DOMAIN;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name YOUR-DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/YOUR-DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR-DOMAIN/privkey.pem;

    client_max_body_size 10m;

    # React PWA — SPA routing
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://app:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Google OAuth Setup

1. [console.cloud.google.com](https://console.cloud.google.com) → Create project "UMU Attendance System"
2. Enable **Google OAuth2 API**
3. Create **OAuth 2.0 credentials** (Web Application type)
4. Authorised redirect URI: `https://attendance.umu.ac.ug/api/auth/google/callback` (must be **https**)
5. Copy Client ID + Secret → `server/.env`
6. On the **OAuth consent screen → Audience** page:
   - Set **User type** to **External** (Internal only allows accounts inside the Google
     Workspace that owns the project — it blocks everyone else)
   - Set **Publishing status** to **In production** (Google refuses production for clients
     with `http://` redirect URIs, so HTTPS is required first)
7. Optionally restrict sign-ins in the app itself — it already rejects any email that
   isn't `@umu.ac.ug` or `@stud.umu.ac.ug` (`server/src/config/google-oauth.ts`)

> A client can hold **several** origins and redirect URIs. When you deploy to a new
> domain/IP, just **add** the new ones — keep the old ones so the previous deployment
> keeps working.

> **Google is optional.** Every account can sign in with email + password instead, so the
> app works even while the UMU Workspace admin hasn't approved the Google app. Students
> use `@stud.umu.ac.ug` accounts, staff use `@umu.ac.ug`. Accounts are created by the
> System Admin (User Management → Add User, or CSV imports on the Import page).

---

## Deploy Script (`devops/scripts/deploy.sh`)

```bash
#!/bin/bash
set -e
cd /var/www/umu-attendance

echo "Pulling latest..."
git pull origin main

echo "Building frontend..."
cd client && npm install && npm run build && cd ..

echo "Restarting containers..."
docker compose up -d --build

echo "Running migrations..."
docker compose exec app npx prisma migrate deploy

echo "Done."
```

```bash
chmod +x devops/scripts/deploy.sh
```

---

## Database Backup (`devops/scripts/backup-db.sh`)

```bash
#!/bin/bash
# Requires MYSQL_PASSWORD to be set (matching server/.env DATABASE_URL).
set -e
DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR=/var/backups/umu-attendance
mkdir -p "$BACKUP_DIR"

docker compose exec -T db mysqldump \
  -u umu_user -p"${MYSQL_PASSWORD:?set MYSQL_PASSWORD in the environment}" umu_attendance \
  > "$BACKUP_DIR/backup_$DATE.sql"

echo "Backup saved: $BACKUP_DIR/backup_$DATE.sql"

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/*.sql | tail -n +31 | xargs -r rm
```

Set `MYSQL_PASSWORD` from the root `.env` (or run with `set -a; source .env; set +a`),
then schedule via cron:
```bash
crontab -e
# 0 2 * * * cd /var/www/umu-attendance && set -a && source .env && set +a && bash devops/scripts/backup-db.sh
```

---

## Deploying to a new server or a new domain

The project is designed to be redeployed. When you get the new server's IP and domain,
change the domain in **four** places — missing one causes either a wrong address or a
Google login failure.

| # | Place | What to change |
|---|---|---|
| 1 | **DNS** | The domain's A record must point to the new server's IP. Check with `ping your-domain`. |
| 2 | **SSL certificate** | On the new server, run `sudo certbot certonly --standalone -d YOUR-DOMAIN` (Step 4). Certificates are per-domain and cannot be copied between servers. |
| 3 | **Nginx config** (`devops/nginx/umu-attendance.conf`) | `server_name` on both server blocks, and both `ssl_certificate`/`ssl_certificate_key` paths → `YOUR-DOMAIN`. |
| 4 | **`server/.env`** | `CLIENT_URL=https://YOUR-DOMAIN` and `GOOGLE_CALLBACK_URL=https://YOUR-DOMAIN/api/auth/google/callback` |
| 5 | **Google Cloud Console** | Add `https://YOUR-DOMAIN` to **Authorised JavaScript origins** and `https://YOUR-DOMAIN/api/auth/google/callback` to **Authorised redirect URIs** (old ones can stay). |
| 6 | **Environment files** | On a new server, `.env` and `server/.env` are created fresh from the `.example` files — nothing is committed to GitHub. Set a new strong database password, new JWT secrets, and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. |

Quick search for leftover references to the old domain:
```bash
grep -rn "old-domain-or-ip" . --include="*.conf" --include="*.env*" --exclude-dir=node_modules
```

> If the new server gets a **new IP** but keeps the **same domain**, only items 2, 4 and
> the DNS record change — the Google Console entries and Nginx `server_name` stay the same.

---

## After First Deploy — System Admin Checklist

1. Log in with the System Admin account (`edward@umu.ac.ug` + `SEED_ADMIN_PASSWORD`)
2. **Settings → Current Period** — set academic year and semester
3. **Settings → Profile Editing** — enable for students and lecturers
4. **Academic Setup** — create Campus, Faculty, Programmes, Course Units, Curriculum mappings
5. **Users → Add User** or **CSV Imports** — create Staff (`name,email,role,facultyCode,password`) and
   Student (`name,email,password`) accounts. Students choose their own academic path on first login.
6. Faculty Admins log in, complete their profiles, assign lecturers to units
7. Students log in, complete profiles — auto-enrolled into course units

---

## Monitoring

```bash
# Live logs
docker compose logs -f app

# Container status
docker compose ps

# Restart single service
docker compose restart app
```

> For `.env` changes use `docker compose up -d app` instead — `restart` keeps the old
> environment variables, but `up -d` recreates the container and reads the new `.env`.

---

## Troubleshooting

| Problem | Check |
|---|---|
| App not starting | `docker compose logs app` |
| DB connection error | Verify `DATABASE_URL` in `server/.env` matches `MYSQL_PASSWORD` in root `.env` |
| Nginx crash-looping "cannot load certificate" | Certificate doesn't exist yet — get the Let's Encrypt cert first (Step 4), then check `server_name`/cert paths in `devops/nginx/umu-attendance.conf` |
| Google login failing | `GOOGLE_CALLBACK_URL` must be `https://` and match exactly in Google Console |
| Google "Access Denied / Something went wrong during sign-in" | OAuth consent screen: User type must be **External**, Publishing status **In production**, redirect URIs **https**. For UMU accounts this can also mean the Google Workspace admin hasn't allowed the app (admin.google.com → Security → Access and data control → API controls → Manage Third-Party App Access) |
| PDF not generating | Puppeteer's bundled Chromium — rebuild the image with `docker compose up -d --build`; check `server/assets/umu-logo.svg` exists; see logs with `docker compose logs app \| grep -i -E "pdf\|puppeteer\|chromium"` |
| Emails not sending | `SMTP_PASS` must be a Google App Password (not account password) |
| 502 Bad Gateway | Node.js crashed — `docker compose logs app` |
| PWA not installing | Check `/manifest.webmanifest` returns 200; check icons exist in `/public` |
