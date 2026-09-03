# Deployment Guide

**Target:** Ubuntu Server 22.04/24.04 LTS · Docker Compose · Let's Encrypt SSL · Google OAuth · Moodle sync

---

## What you will end up with

- The full UMU Attendance System running at `https://attendance.umu.ac.ug`
- Secured with HTTPS (browser padlock, auto-renewing certificate)
- Restarting automatically if the server reboots
- Connected to Moodle so academic structure, lecturers, and students sync on demand
- Daily automated database backups, last 30 kept

---

## What you need before you start

| Thing | Where to get it |
|---|---|
| Ubuntu Server 22.04 or 24.04 machine | VPS provider or physical server on campus |
| Server IP address | VPS dashboard, or run `ip addr` on the server |
| Domain name pointing at the server | Ask UMU IT: add an A record `attendance.umu.ac.ug → your IP` in DNS |
| SSH access to the server | VPS provider gives a username + password or SSH key |
| Google OAuth credentials | Google Cloud Console (see Step 12) |
| Gmail App Password for sending emails | Gmail account → Security → App Passwords (see Step 7) |
| Moodle admin access | To run the one-time setup script on the Moodle server (see Step 13) |

---

## Services that Docker Compose runs

| Service | Image | Network exposure |
|---|---|---|
| `db` | `mysql:8` | Internal only — port 3306 never public |
| `redis` | `redis:7-alpine` | Internal only — port 6379 never public |
| `app` | Node.js 20 (custom build) | Internal only — port 4000, proxied by Nginx |
| `nginx` | `nginx:alpine` | Public — ports 80 (HTTP→HTTPS redirect) and 443 (HTTPS) |

---

## Step 1 — Open firewall ports

In your VPS / cloud provider's security group or firewall console:

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH access |
| 80 | TCP | HTTP — Let's Encrypt challenge + redirect to HTTPS |
| 443 | TCP | HTTPS — the app |

**Do not** open 3306 (MySQL) or 6379 (Redis) to the internet.

---

## Step 2 — Connect to the server and update it

```bash
ssh ubuntu@YOUR-SERVER-IP
sudo apt update && sudo apt upgrade -y
sudo reboot   # optional but recommended after a kernel update
```

After reboot, reconnect:
```bash
ssh ubuntu@YOUR-SERVER-IP
```

---

## Step 3 — Install Docker

```bash
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
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin certbot

# Allow your user to run Docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

Verify Docker is installed:
```bash
docker --version        # Docker version 26.x.x or newer
docker compose version  # Docker Compose version v2.x.x
```

---

## Step 4 — Install Node.js 20 (needed only to build the frontend)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v20.x.x
```

---

## Step 5 — Clone the repository

```bash
sudo mkdir -p /var/www/umu-attendance
sudo chown $USER:$USER /var/www/umu-attendance
git clone https://github.com/edkaydev/umu-attendance-system.git /var/www/umu-attendance
cd /var/www/umu-attendance
```

---

## Step 6 — Create environment files

Two files are required. Neither is stored in GitHub — you create them fresh on every server.

```bash
cp server/.env.example server/.env
cp .env.example .env
```

### Edit `server/.env`

```bash
nano server/.env
```

Fill in every value. The file should look like this when done:

```ini
NODE_ENV=production
PORT=4000
CLIENT_URL=https://attendance.umu.ac.ug

# ── Database ─────────────────────────────────────────────────────────────────
# Password MUST match MYSQL_PASSWORD in the root .env below.
# If the password contains # @ or % → URL-encode: # → %23  @ → %40  % → %25
DATABASE_URL=mysql://umu_user:StrongPassword@db:3306/umu_attendance

# ── Google OAuth ─────────────────────────────────────────────────────────────
# From Google Cloud Console — see Step 12.
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://attendance.umu.ac.ug/api/auth/google/callback

# ── JWT secrets ───────────────────────────────────────────────────────────────
# Generate each with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Run the command TWICE and use different values for each secret.
JWT_ACCESS_SECRET=paste-first-64-char-hex-string-here
JWT_REFRESH_SECRET=paste-second-64-char-hex-string-here
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# ── Email alerts (Gmail SMTP) ─────────────────────────────────────────────────
# SMTP_PASS must be a Gmail App Password, not your real Gmail password — see Step 7.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=attendance@umu.ac.ug
SMTP_PASS=paste-16-char-gmail-app-password-here
ALERT_FROM_EMAIL=attendance@umu.ac.ug
ALERT_FROM_NAME=UMU Attendance System

# ── Moodle integration ────────────────────────────────────────────────────────
# Token is generated by devops/scripts/moodle/setup-webservice.php — see Step 13.
MOODLE_BASE_URL=https://moodle.umu.ac.ug
MOODLE_WS_TOKEN=paste-64-char-token-here
MOODLE_WS_SERVICE=umu_attendance_sync

# ── Geo-fencing ───────────────────────────────────────────────────────────────
# Nkozi Campus coordinates. Students must be within CAMPUS_RADIUS_METERS to check in.
CAMPUS_LAT=0.00389
CAMPUS_LNG=32.01353
CAMPUS_RADIUS_METERS=500
LECTURER_PROXIMITY_RADIUS_METERS=50

# ── First System Admin ────────────────────────────────────────────────────────
# Pre-register the admin's email so they can sign in with Google OAuth.
# Run: docker compose exec app npm run seed:admin
SEED_ADMIN_EMAIL=admin@umu.ac.ug
SEED_ADMIN_NAME=System Administrator

# Keep false in production — prevents demo data seeding on empty database.
SEED_ON_EMPTY=false
```

Generate the two JWT secrets (run the command twice — use a different value for each):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Edit root `.env`

The database password here **must match** `StrongPassword` in `DATABASE_URL` above.

```bash
nano .env
```

```ini
MYSQL_ROOT_PASSWORD=choose-a-strong-root-password
MYSQL_PASSWORD=StrongPassword
```

Generate strong passwords:
```bash
openssl rand -base64 32
```

### Lock both files

```bash
chmod 600 server/.env .env
```

---

## Step 7 — Get a Gmail App Password

The system sends attendance alerts and absence notifications via Gmail. Gmail blocks
sign-in with your real password from scripts — you need an **App Password** instead.

1. Go to [myaccount.google.com](https://myaccount.google.com) → **Security**
2. Under "How you sign in to Google", turn on **2-Step Verification** if not already on
3. Go back to **Security** → scroll down → click **App passwords**
   (This option only appears after 2-Step Verification is enabled)
4. App: **Mail** · Device: **Other (Custom name)** · Name: `UMU Attendance`
5. Click **Create** → Google shows a 16-character password like `abcd efgh ijkl mnop`
6. Copy it (spaces are ignored) → paste it as `SMTP_PASS` in `server/.env`

> The App Password is shown only once. If you lose it, generate a new one — it does
> not expire unless you revoke it.

---

## Step 8 — Get an SSL certificate (do this BEFORE starting containers)

> Nginx reads the certificate paths when it starts. If the files don't exist yet,
> Nginx crash-loops with: `cannot load certificate: No such file or directory`
> Get the certificate first, then start containers.

### Option A — real domain (recommended for production)

Verify DNS has propagated first:
```bash
ping attendance.umu.ac.ug
# Should reply from your server IP. If not, wait 10–30 min and try again.
```

Then get the certificate:
```bash
sudo certbot certonly --standalone -d attendance.umu.ac.ug
```

Certbot asks for your email and terms agreement — type `Y` and Enter.

### Option B — no domain yet (for testing)

Use `YOUR-IP.sslip.io` — a free service that maps any IP to a DNS name automatically.
Example: server IP `41.210.100.50` → use `41.210.100.50.sslip.io` as your domain.
Replace `YOUR-DOMAIN` everywhere with this address.

```bash
sudo certbot certonly --standalone -d 41.210.100.50.sslip.io
```

### Enable automatic renewal (certificates expire every 90 days)

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
sudo systemctl status certbot.timer   # should show "active (waiting)"
```

### Update the Nginx config with your domain

```bash
nano devops/nginx/umu-attendance.conf
```

Change **all four** domain occurrences:
- `server_name` in the HTTP block (line that says `return 301 https://...`)
- `server_name` in the HTTPS block
- `ssl_certificate` path
- `ssl_certificate_key` path

Replace the existing demo domain with your actual domain. Save: **Ctrl+X → Y → Enter**

---

## Step 9 — Build the frontend

The React PWA must be compiled into static files before Nginx can serve it.

```bash
cd /var/www/umu-attendance/client
npm install
npm run build
cd ..
```

This takes 1–3 minutes and creates `client/dist/`. Nginx serves files from there.

---

## Step 10 — Start all containers

```bash
cd /var/www/umu-attendance
docker compose up -d --build
```

The first run pulls Docker images and builds the Node.js container — takes 3–5 minutes.

Check that all four containers started:
```bash
docker compose ps
```

Expected output:
```
NAME                        STATUS
umu-attendance-db-1         Up (healthy)
umu-attendance-redis-1      Up (healthy)
umu-attendance-app-1        Up (healthy)
umu-attendance-nginx-1      Up
```

If a container shows `Restarting`:
```bash
docker compose logs app --tail=30   # see what went wrong
```

---

## Step 11 — Run database migrations and seed the first admin

```bash
# Create all database tables
docker compose exec app npx prisma migrate deploy

# Pre-register the first System Admin in the database
docker compose exec app npm run seed:admin
```

The seed command registers the email from `SEED_ADMIN_EMAIL` so that person can sign in
with Google OAuth. No password is created — all authentication goes through Google.

---

## Step 12 — Google OAuth setup

All users sign in via Google OAuth. This must be configured in Google Cloud Console
before anyone can log in.

### 12.1 Create the project and OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New Project** → Name: `UMU Attendance System` → Create
3. Go to **APIs & Services → Library** → search `Google+ API` → Enable
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application** · Name: `UMU Attendance`
6. Under **Authorised redirect URIs** → **Add URI**:
   ```
   https://attendance.umu.ac.ug/api/auth/google/callback
   ```
   Must be `https://` — Google rejects `http://` URIs.
7. Click **Create** → copy the **Client ID** and **Client Secret**
8. Paste both into `server/.env` (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`)

### 12.2 Configure the consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. **User type: External** — choose this even for internal UMU use.
   "Internal" only works for accounts inside the same Google Workspace that *owns*
   the Cloud project — it would block everyone else.
3. Fill in:
   - App name: `UMU Attendance System`
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue** through the Scopes page (no extra scopes needed)
5. Add test users if prompted (optional — you'll publish in the next step anyway)

### 12.3 Publish the app (required)

1. Back on the OAuth consent screen → click **Publish App → Confirm**
2. Status must change to **In production**

Apps left in "Testing" mode only allow the specific test users you listed.
Apps with `http://` redirect URIs are blocked by Google. Both conditions require
the app to be published with HTTPS URIs.

### 12.4 Allow the app in UMU Google Workspace

By default, Google Workspace admins block all third-party OAuth apps. Without this
step, users see: **"Access blocked: UMU Attendance System has not completed the
Google verification process"**.

Ask the UMU IT Google Workspace admin to:

1. Sign in to [admin.google.com](https://admin.google.com)
2. Go to **Security → Access and data control → API controls**
3. Click **Manage Third-Party App Access → Add app → OAuth App Name or Client ID**
4. Paste the **Client ID** from Step 12.1
5. Set access to **Trusted** → Save

---

## Step 13 — Set up Moodle integration and get the token

Moodle is the source of truth for academic structure (faculties, programmes, course units),
lecturers, and students. The attendance system syncs from Moodle on demand — read-only.

### 13.1 What the setup script does

The file `devops/scripts/moodle/setup-webservice.php` runs on the Moodle server and:

1. Enables Web Services and the REST protocol in Moodle site settings
2. Creates the external service `UMU Attendance Sync` (`umu_attendance_sync`) and
   attaches the 10 required read-only functions
3. Creates a service account user `umu_sync_admin` (never used for browser login)
4. Assigns the system Manager role so the account can read all users and enrolments
5. Issues a permanent token and prints it to the console

The script is **fully idempotent** — safe to run multiple times. If everything already
exists it just reuses it and prints the existing token.

### 13.2 Run the script on the Moodle server

ICT needs to copy the script to the Moodle server and run it. The commands depend on
how Moodle is hosted:

**If Moodle runs in Docker** (find the container name with `docker ps`):
```bash
# Copy the script into the Moodle container
docker cp /var/www/umu-attendance/devops/scripts/moodle/setup-webservice.php \
  MOODLE-CONTAINER-NAME:/var/www/html/admin/cli/setup-webservice.php

# Run it as the web server user
docker exec -u www-data MOODLE-CONTAINER-NAME \
  php /var/www/html/admin/cli/setup-webservice.php
```

**If Moodle runs directly on the server (no Docker):**
```bash
# Copy the script to Moodle's CLI tools directory
sudo cp /var/www/umu-attendance/devops/scripts/moodle/setup-webservice.php \
  /var/www/html/admin/cli/setup-webservice.php

# Run it as the web server user
sudo -u www-data php /var/www/html/admin/cli/setup-webservice.php
```

### 13.3 Read the output and copy the token

Successful output looks like this:

```
== UMU Moodle Web Services setup ==
Moodle site: https://moodle.umu.ac.ug
[1/5] Web services enabled, REST protocol active.
[2/5] Created external service: UMU Attendance Sync (#42)
[2/5] Functions attached: 10 added, 0 already present.
[3/5] Created service account user: umu_sync_admin.
[4/5] Assigned Manager role at system context.
[5/5] Issued new permanent token.

=============================================================
 Setup complete. Use these values in the attendance server:
   MOODLE_BASE_URL=https://moodle.umu.ac.ug
   MOODLE_WS_TOKEN=a1b2c3d4e5f6...  (64 hex characters)
=============================================================

Smoke test: POST core_webservice_get_site_info ...
PASS: token works — site "UMU Moodle" (https://moodle.umu.ac.ug)
```

Copy the `MOODLE_WS_TOKEN` value (the 64-character hex string) and paste it into
`server/.env`:

```bash
nano /var/www/umu-attendance/server/.env
# Find MOODLE_WS_TOKEN= and paste the token
```

Restart the app container to load the new token:
```bash
docker compose up -d app
```

### 13.4 Alternative — generate the token manually in the Moodle admin UI

If ICT cannot run PHP scripts directly, the token can be created through the browser:

**Step A — Enable Web Services:**
Site administration → Advanced features → tick **Enable web services** → Save changes

**Step B — Enable REST protocol:**
Site admin → Server → Web services → Manage protocols → REST: click Enable

**Step C — Create the external service:**
Site admin → Server → Web services → External services → Add a new service:
- Name: `UMU Attendance Sync`
- Short name: `umu_attendance_sync`
- Enabled: Yes
→ Save, then click **Add functions** and add all 10:

| Function name |
|---|
| `core_webservice_get_site_info` |
| `core_course_get_courses` |
| `core_course_get_courses_by_field` |
| `core_course_get_categories` |
| `core_course_get_contents` |
| `core_user_get_users_by_field` |
| `core_user_get_users_by_id` |
| `core_user_get_course_user_profiles` |
| `core_enrol_get_enrolled_users` |
| `core_enrol_get_users_courses` |

**Step D — Create the service account user:**
Site admin → Users → Accounts → Add a new user:
- Username: `umu_sync_admin`
- First name: `UMU`, Last name: `Sync`
- Email: `umu_sync@umu.ac.ug`
- Auth method: Manual

**Step E — Assign Manager role:**
Site admin → Users → Permissions → Assign system roles → Manager → search `umu_sync_admin` → Add

**Step F — Generate the token:**
Site admin → Server → Web services → Manage tokens → Add:
- User: `umu_sync_admin`
- Service: `UMU Attendance Sync`
- Valid until: leave blank (permanent)
→ Save → copy the token value

Paste the token as `MOODLE_WS_TOKEN` in `server/.env` and restart the app.

### 13.5 Configure which Moodle semester is active

After getting the token and running the first sync, the system needs to know which Moodle
category represents the current semester.

1. Sign in as System Admin → **Moodle Sync**
2. Click **Configure Period**
3. The page displays the parsed Moodle category tree. Find the current semester
   (e.g. "Semester 1 2026/27") and note its **Category ID** shown beside it
4. Enter:
   - **Moodle Semester Category ID** — required (the semester's category ID)
   - **Moodle Academic Year Category ID** — optional (the year's category ID)
   - **Semester Number** — 1 or 2
5. Save → **Run Full Sync**

The sync fails with a clear error if the semester ID doesn't match the tree — it never
silently picks the wrong period.

---

## Step 14 — Verify the deployment

Open `https://attendance.umu.ac.ug` in a browser. You should see the UMU Attendance
login page with a **Sign in with Google** button.

1. Click **Sign in with Google** → use the `SEED_ADMIN_EMAIL` account
2. You should land on the **System Admin dashboard**

If the login fails — see the Troubleshooting section at the bottom.

---

## Step 15 — Complete first-time setup as System Admin

After first login, do these steps in order:

1. **Settings → Current Period** — set academic year (e.g. `2026/2027`) and semester number
2. **Settings → Profile Editing** — turn on for Students and Lecturers
3. **Moodle Sync → Configure Period** — enter the Moodle semester category ID (Step 13.5)
4. **Moodle Sync → Run Full Sync** — pulls all faculties, programmes, course units,
   lecturers, and students from Moodle. Takes 1–5 minutes depending on Moodle size.
5. **Imports → Faculty Admins** — upload the Faculty Admin CSV
   Format: `email,fullName,facultyCode` — one row per admin, no header needed
6. Faculty Admins sign in with Google → complete profiles → assign lecturers to course units
7. Students sign in with Google → complete profiles → auto-enrolled in their course units

---

## Step 16 — Set up a swap file (strongly recommended)

Prevents Puppeteer (PDF generation) and MySQL from running out of memory on servers
with less than 4 GB RAM:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make it persistent across reboots
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify
free -h   # Swap row should show 2.0G total
```

---

## Step 17 — Set up automatic database backups

```bash
crontab -e
```

Add this line (runs at 2 am every night, keeps the last 30 backups):
```
0 2 * * * cd /var/www/umu-attendance && set -a && source .env && set +a && bash devops/scripts/backup-db.sh
```

Save: **Ctrl+X → Y → Enter**

Backups are saved to `/var/backups/umu-attendance/` as `.sql` files.

Test the backup script right now:
```bash
cd /var/www/umu-attendance && set -a && source .env && set +a && bash devops/scripts/backup-db.sh
ls -lh /var/backups/umu-attendance/   # should see a .sql file
```

---

## Deploying code updates

Every time new code is pushed to GitHub, run on the server:

```bash
cd /var/www/umu-attendance
bash devops/scripts/deploy.sh
```

The deploy script does:
1. `git pull origin main`
2. Rebuilds the React frontend (`npm install && npm run build`)
3. Rebuilds and restarts Docker containers (`docker compose up -d --build`)
4. Runs any new database migrations (`prisma migrate deploy`)

Or step by step manually:
```bash
cd /var/www/umu-attendance
git pull origin main
cd client && npm install && npm run build && cd ..
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

---

## Moving to a new server or domain

Do these in order — missing a step causes login failures or wrong addresses.

| # | What | How |
|---|---|---|
| 1 | **DNS** | Point the domain A record to the new server IP |
| 2 | **Verify DNS** | `ping attendance.umu.ac.ug` → should return new IP |
| 3 | **SSL cert on new server** | `sudo certbot certonly --standalone -d YOUR-NEW-DOMAIN` |
| 4 | **Nginx config** | Update `server_name` (both blocks) + cert paths in `devops/nginx/umu-attendance.conf` |
| 5 | **`server/.env`** | Update `CLIENT_URL` and `GOOGLE_CALLBACK_URL` |
| 6 | **Google Cloud Console** | Add new domain to Authorised redirect URIs (keep old ones too) |
| 7 | **Root `.env`** | Generate fresh strong passwords and JWT secrets on the new server |

Find any leftover old-domain references:
```bash
grep -rn "old-domain.example.com" . --include="*.conf" --include="*.env*" --exclude-dir=node_modules
```

---

## Server commands reference

### Container status and logs

```bash
# See status of all four containers
docker compose ps

# Live log stream — Ctrl+C to stop
docker compose logs -f app
docker compose logs -f nginx
docker compose logs -f db

# Last 50 lines (useful when something just crashed)
docker compose logs app --tail=50
docker compose logs nginx --tail=50

# Logs for all containers at once
docker compose logs -f
```

### Starting and stopping

```bash
# Start everything (after server reboot)
docker compose up -d

# Stop everything cleanly
docker compose down

# Restart one container (e.g. after a crash)
docker compose restart app

# Reload environment variables — use up -d, NOT restart
# (restart keeps the old env vars loaded in memory)
docker compose up -d app

# Rebuild images and restart (after a code change)
docker compose up -d --build
```

### Database

```bash
# Open a MySQL shell inside the database container
docker compose exec db mysql -u umu_user -p umu_attendance

# Run a migration
docker compose exec app npx prisma migrate deploy

# Check migration history
docker compose exec app npx prisma migrate status

# Manual backup right now
cd /var/www/umu-attendance && set -a && source .env && set +a && bash devops/scripts/backup-db.sh

# Restore a backup
docker compose exec -T db mysql -u umu_user -p'StrongPassword' umu_attendance \
  < /var/backups/umu-attendance/backup_2026-09-03_02-00.sql

# List saved backups
ls -lh /var/backups/umu-attendance/
```

### Shell access inside containers

```bash
# Get a shell inside the app container (Node.js)
docker compose exec app sh

# Get a shell inside the Nginx container
docker compose exec nginx sh

# Run a one-off Node.js command inside the app
docker compose exec app node -e "console.log('hello from app')"
```

### Server health checks

```bash
# Check all containers are up
docker compose ps

# Disk space
df -h

# Memory and swap
free -h

# CPU and memory per container (live, Ctrl+C to stop)
docker stats

# System uptime and load
uptime

# Check if the SSL cert is still valid
sudo certbot certificates

# Force certificate renewal (normally done automatically by the timer)
sudo certbot renew --force-renewal

# Check the auto-renewal timer status
sudo systemctl status certbot.timer
```

### Nginx

```bash
# Test Nginx config for syntax errors (without restarting)
docker compose exec nginx nginx -t

# Reload Nginx config (zero-downtime, for conf file changes)
docker compose exec nginx nginx -s reload

# View Nginx access log
docker compose logs nginx --tail=50

# Check if the site is responding from the server itself
curl -I https://attendance.umu.ac.ug
```

### Environment and secrets

```bash
# Edit server environment (then restart with: docker compose up -d app)
nano /var/www/umu-attendance/server/.env

# Edit root env (DB passwords — then: docker compose up -d)
nano /var/www/umu-attendance/.env

# See what environment variables the running app container has
docker compose exec app env | grep -v PASS | grep -v SECRET
```

### Git and code updates

```bash
# Check current version
cd /var/www/umu-attendance && git log --oneline -5

# Update to latest (full deploy)
bash devops/scripts/deploy.sh

# Check for uncommitted changes on server (should be none in production)
git status
```

### Clearing space

```bash
# How much space Docker is using
docker system df

# Remove stopped containers, dangling images, unused networks (safe to run)
docker system prune -f

# Remove all unused Docker images (more aggressive — use if disk is very low)
docker image prune -a -f

# Check disk usage by directory
du -sh /var/www/umu-attendance/*
du -sh /var/backups/umu-attendance/*
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Site not loading, SSH works | Firewall ports 80/443 not open — check cloud security group |
| App not starting | `docker compose logs app --tail=50` |
| 502 Bad Gateway | App crashed — `docker compose logs app`; common cause: wrong `DATABASE_URL` or missing env var |
| DB connection refused | `DATABASE_URL` password must match `MYSQL_PASSWORD` in root `.env`. Passwords must match exactly — check for special characters needing URL encoding |
| Nginx crash-loop "cannot load certificate" | Certificate doesn't exist yet — run certbot first (Step 8), then `docker compose up -d nginx`. Also check `server_name` and cert paths in `devops/nginx/umu-attendance.conf` match your domain |
| Google login: "redirect_uri_mismatch" | `GOOGLE_CALLBACK_URL` in `server/.env` must match exactly what's registered in Google Cloud Console (including `https://`, no trailing slash) |
| Google login: "Access blocked" | OAuth consent screen must be External + status In production. Also, UMU Workspace admin must allow the app — Step 12.4 |
| Google login: "Access Denied / not-registered" | The user's email is not in the database yet. System Admin must import them, or run a Moodle sync first |
| Emails not sending | `SMTP_PASS` must be a Gmail App Password (16 chars), not your real Gmail password. 2-Step Verification must be enabled on the Gmail account |
| PDF not generating | `docker compose up -d --build` to rebuild the app image (Puppeteer/Chromium must be installed). Check `server/assets/umu-logo.svg` exists. Add a 2 GB swap file — Step 16 |
| PWA not installing | Check `/manifest.webmanifest` returns HTTP 200. Check PWA icons exist in `client/public/` |
| Moodle sync: "MOODLE_NOT_CONFIGURED" | Set `MOODLE_BASE_URL` and `MOODLE_WS_TOKEN` in `server/.env`, then `docker compose up -d app` |
| Moodle sync: "semester not resolved" | Go to System Admin → Moodle Sync → Configure Period and set the Moodle semester category ID |
| Moodle sync: users skipped "wrong domain" | Student emails must be `@stud.umu.ac.ug`. Lecturer emails must be `@umu.ac.ug`. Users with other domains are skipped |
| No space left on device | `docker system prune -f`, then `df -h`. Delete old backups in `/var/backups/umu-attendance/` if needed |
| Container keeps restarting | `docker compose logs app --tail=20` — read the last few lines before the crash message |
| Changes to `.env` not taking effect | Use `docker compose up -d app` — not `docker compose restart app`. `restart` keeps old env vars in memory; `up -d` recreates the container with the new values |

---

## Server security hardening

Do these immediately after the server is up. They protect the server itself, not just the app.

### SSH — disable password login

Password-based SSH login can be brute-forced. Key-based auth cannot.

```bash
# First, make sure your SSH key is already on the server and you can log in with it.
# Then disable password auth:
sudo nano /etc/ssh/sshd_config
```

Set these lines:
```
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
```

Save, then restart SSH:
```bash
sudo systemctl restart sshd
```

> Open a second SSH session before closing the first to verify you can still get in.

### UFW firewall

Docker manages its own iptables rules and bypasses UFW for container ports.
These rules protect the host itself (SSH) and make intent explicit:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### Fail2ban — block brute-force SSH attacks

```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check which IPs are currently banned
sudo fail2ban-client status sshd
```

### Automatic security updates

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
# Choose "Yes" when prompted
```

This automatically installs OS security patches without manual intervention.

### File permissions

```bash
# Only your user can read the secret files
chmod 600 /var/www/umu-attendance/server/.env
chmod 600 /var/www/umu-attendance/.env

# The app directory should not be world-writable
chmod 755 /var/www/umu-attendance
```

### What is already secure (you don't need to add these)

- MySQL and Redis are on the internal Docker network — they are not reachable from the internet even without a firewall rule
- All passwords use JWT in HttpOnly cookies — JavaScript cannot read them
- Google OAuth only — no passwords stored in the database, nothing to leak or brute-force
- HTTPS enforced — Nginx redirects all HTTP traffic to HTTPS
- Security headers set in Nginx: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- Helmet.js adds security headers on every API response

---

## Ongoing maintenance schedule

### Weekly (5 minutes)

```bash
# Are all containers running?
docker compose ps

# Any errors in the last 24 hours?
docker compose logs app --since 24h | grep -i error

# Disk space — warn if above 70%
df -h

# Memory — warn if swap is being used heavily
free -h
```

### Monthly (15 minutes)

```bash
# OS security patches
sudo apt update && sudo apt upgrade -y

# SSL certificate status (should auto-renew, but verify)
sudo certbot certificates
# "VALID: 89 days" is fine. Anything under 30 days — force renew:
sudo certbot renew --force-renewal && docker compose restart nginx

# Docker cleanup — removes old images and stopped containers
docker system prune -f

# Check backup files are being created
ls -lht /var/backups/umu-attendance/ | head -5
# Most recent file should be from last night
```

### Each new semester

1. **Settings → Current Period** — update academic year and semester number
2. **Moodle Sync → Configure Period** — update the Moodle semester category ID
3. **Moodle Sync → Run Full Sync** — pulls new students, lecturers, enrolments
4. Notify Faculty Admins to assign lecturers to any new course units
5. Verify a student can sign in and see their enrolled units

### After any code update

```bash
bash devops/scripts/deploy.sh
# Then verify:
docker compose ps          # all Up
curl -I https://attendance.umu.ac.ug   # HTTP 200
docker compose logs app --tail=20      # no crash errors
```

---

## Protecting student data (institutional responsibility)

Student attendance records are personal data. These practices protect the university
from data breaches and comply with data protection obligations.

### Access control

- **System Admin** — one or two people maximum. This role can see all data across all faculties.
- **Faculty Admins** — scoped to their faculty only. They cannot see other faculties' data.
- **Lecturers** — see only their own sessions and course units.
- **Students** — see only their own attendance. They cannot see classmates' records.
- Never share the System Admin Google account. Each person must use their own `@umu.ac.ug` account.

### Secrets — never share, never commit

| Secret | Where | Risk if leaked |
|---|---|---|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `server/.env` | Anyone can forge login tokens and impersonate any user |
| `MYSQL_ROOT_PASSWORD` | root `.env` | Full database access — all attendance records, all user data |
| `MYSQL_PASSWORD` | root `.env` | Read/write access to all attendance data |
| `MOODLE_WS_TOKEN` | `server/.env` | Read access to all Moodle users, enrolments, and course data |
| `GOOGLE_CLIENT_SECRET` | `server/.env` | Can be used to impersonate the OAuth app |
| `SMTP_PASS` | `server/.env` | Emails can be sent from the university attendance address |

If any of these are ever accidentally exposed (committed to GitHub, shared in a chat, etc.):

1. **Immediately** rotate the secret — generate a new one
2. Update `server/.env` on the server
3. Restart the app: `docker compose up -d app`
4. For `MOODLE_WS_TOKEN` — regenerate on the Moodle server and update
5. For `GOOGLE_CLIENT_SECRET` — regenerate in Google Cloud Console

### Database backups and retention

- Backups run automatically at 2am daily and are kept for 30 days
- Backups are stored on the same server (`/var/backups/umu-attendance/`)
- **Recommendation:** also copy backups off-server weekly (USB drive, university file server, or cloud storage):
  ```bash
  # Example: copy last backup to a network share
  scp /var/backups/umu-attendance/$(ls -t /var/backups/umu-attendance/ | head -1) \
    backup-user@nas.umu.ac.ug:/attendance-backups/
  ```
- Backups contain all student attendance records in plain SQL — treat backup files as sensitive. Store them securely and delete old ones properly.

### What to do if the server is compromised

1. **Take it offline immediately** — shut down the server or block all traffic in the firewall
2. **Do not wipe it yet** — preserve logs for investigation
3. **Copy the logs** before shutting down:
   ```bash
   docker compose logs app > /tmp/app-logs-incident.txt
   docker compose logs nginx > /tmp/nginx-logs-incident.txt
   sudo cp /var/log/auth.log /tmp/
   ```
4. **Rotate all secrets** — JWT secrets, DB passwords, Google Client Secret, Moodle token
5. **Restore from backup** on a fresh server using the deployment guide from Step 1
6. **Notify** the university data protection officer — student data may have been accessed

---

## System Admin checklist — first login

Do these in order on the first day. Each step depends on the previous one.

- [ ] Sign in with the `@umu.ac.ug` Google account matching `SEED_ADMIN_EMAIL`
- [ ] **Settings → Current Period** — set academic year and semester
- [ ] **Settings → Profile Editing** — enable for Students and Lecturers
- [ ] **Moodle Sync → Configure Period** — set Moodle semester category ID
- [ ] **Moodle Sync → Run Full Sync** — wait for it to complete, check the summary
- [ ] Verify: correct number of faculties, programmes, course units, lecturers, students synced
- [ ] **Imports → Faculty Admins** — upload `faculty_admins.csv`
- [ ] Ask one Faculty Admin to sign in and assign lecturers to course units
- [ ] Ask one Lecturer to sign in, open a test session, confirm code appears
- [ ] Ask one Student to sign in, enter the code, confirm they are marked Present
- [ ] Confirm the Faculty Admin can see the session and attendance record
- [ ] **Test email** — trigger an action that sends an email, confirm it arrives

---

## System Admin checklist — each semester

- [ ] **Settings → Current Period** — update to new semester
- [ ] **Moodle Sync → Configure Period** — update Moodle semester category ID
- [ ] **Moodle Sync → Run Full Sync** — check sync summary for errors
- [ ] Check **User Management** for any students or lecturers with wrong email domains (they will have been skipped by sync)
- [ ] Notify Faculty Admins: new semester has started, assign lecturers to new units
- [ ] Notify Lecturers: they can now open sessions for the new semester

---

## Things that must never happen in production

| Never do this | Why |
|---|---|
| Set `SEED_ON_EMPTY=true` | On an empty database it seeds demo data, destroying any real data that was accidentally deleted |
| Edit files inside a running Docker container | Changes disappear on next `docker compose up` |
| Run `git push --force` on main | Overwrites history — the server's next `git pull` will fail or pull the wrong code |
| Share the System Admin Google account | Audit logs become useless — you can't tell who did what |
| Store backup `.sql` files on a shared drive without access controls | Backup files contain all student records in plain text |
| Expose port 3306 (MySQL) in the firewall | Direct internet access to the database |
| Use the same JWT secret on two different servers | A token from one server becomes valid on the other |
| Delete the `/var/www/umu-attendance/server/assets/` volume mount | Wipes the PDF logo and update logs stored there |
