# 08 — Deployment Guide

## Target Environment
- **Server OS:** Ubuntu Server 22.04 LTS
- **Deployment:** Docker + Docker Compose
- **Domain:** e.g. `attendance.umu.ac.ug`
- **SSL:** Certbot (Let's Encrypt)

---

## Services (Docker Compose)

| Service | Image | Port |
|---|---|---|
| `db` | `mysql:8` | 3306 (internal only) |
| `app` | Custom Node.js build | 4000 (internal only) |
| `nginx` | `nginx:alpine` | 80, 443 (public) |

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

git clone https://github.com/umu/umu-attendance-system.git /var/www/umu-attendance
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

UMU_BADGE_PATH=/app/assets/umu-badge.png
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Step 4 — Add UMU Badge Asset

```bash
cp /path/to/umu-badge.png server/assets/umu-badge.png
```

---

## Step 5 — Build and Start

```bash
# Build React PWA
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

Creates the first System Admin account. After this, log in and set the current period
(`Settings → Current Period`) before any other setup.

---

## Step 8 — SSL with Certbot

> **Important:** Nginx needs the certificate file to exist before it starts. Get the
> certificate **before** the first `docker compose up` (Step 5). If Nginx starts first it
> crash-loops with `cannot load certificate "...": No such file or directory`.

Nginx runs inside Docker, so get the certificate with certbot's **standalone** mode
(stop nginx first so certbot can use port 80):

```bash
sudo apt install -y certbot

cd /var/www/umu-attendance
docker compose stop nginx

sudo certbot certonly --standalone -d attendance.umu.ac.ug

docker compose start nginx
```

> No domain yet? Use the server IP with a free `sslip.io` subdomain, e.g. for IP
> `41.210.100.50` use `-d 41.210.100.50.sslip.io` and that address everywhere below.

Enable auto-renewal (certificates expire every 90 days):
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

Then point the Nginx config (`devops/nginx/umu-attendance.conf`) at your certificate:
change the `ssl_certificate`/`ssl_certificate_key` paths and both `server_name` lines to
your domain.

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

  app:
    build: .
    restart: always
    env_file: ./server/.env
    depends_on:
      db:
        condition: service_healthy
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
```

> `${MYSQL_ROOT_PASSWORD}` and `${MYSQL_PASSWORD}` come from the root `.env` file
> (Step 3). They must match the database password in `server/.env`'s `DATABASE_URL`.

---

## Nginx Config

The shipped config in `devops/nginx/umu-attendance.conf` is ready for `YOUR-IP.sslip.io`
(works for the live test deployment at `102.133.161.8.sslip.io`). Replace the two
`ssl_certificate` paths and both `server_name` values with your own domain.

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

## After First Deploy — System Admin Checklist

1. Log in with System Admin Google account
2. **Settings → Current Period** — set academic year and semester
3. **Settings → Profile Editing** — enable for students and lecturers
4. **Academic Setup** — create Campus, Faculty, Programmes, Course Units, Curriculum mappings
5. **Users → Import Staff** — upload CSV with Faculty Admins and Lecturers
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

---

## Troubleshooting

| Problem | Check |
|---|---|
| App not starting | `docker compose logs app` |
| DB connection error | Verify `DATABASE_URL` in `server/.env` matches `MYSQL_PASSWORD` in root `.env` |
| Nginx crash-looping "cannot load certificate" | Certificate doesn't exist yet — get the Let's Encrypt cert first (Step 8), then check `server_name`/cert paths in `devops/nginx/umu-attendance.conf` |
| Google login failing | `GOOGLE_CALLBACK_URL` must be `https://` and match exactly in Google Console |
| Google "Access Denied / Something went wrong during sign-in" | OAuth consent screen: User type must be **External**, Publishing status **In production**, redirect URIs **https** |
| PDF not generating | Chromium must be available in Docker image; check `UMU_BADGE_PATH` |
| Emails not sending | `SMTP_PASS` must be a Google App Password (not account password) |
| 502 Bad Gateway | Node.js crashed — `docker compose logs app` |
| PWA not installing | Check `/manifest.webmanifest` returns 200; check icons exist in `/public` |
