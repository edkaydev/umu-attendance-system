# Deployment Guide

**Target:** Ubuntu Server 22.04/24.04 LTS · Docker Compose · Let's Encrypt SSL · Google OAuth · Moodle sync

---

## What you will end up with

- The full UMU Attendance System running at `https://attendance.umu.ac.ug`
- Secured with HTTPS (browser padlock, auto-renewing certificate)
- Server hardened against brute-force, kernel exploits, and unauthorized access
- Kernel-level audit logging of every privilege escalation and sensitive operation
- File integrity monitoring that alerts on unauthorized changes to system binaries
- Rate-limited Nginx that blocks API abuse and bot scanning
- Restarting automatically if the server reboots
- Connected to Moodle so academic structure, lecturers, and students sync on demand
- Daily automated database backups, last 30 kept
- Docker logs rotation so disks don't fill up

---

## What you need before you start

| Thing | Where to get it |
|---|---|
| Ubuntu Server 22.04 or 24.04 machine | VPS provider or physical server on campus |
| Server IP address | VPS dashboard, or run `ip addr` on the server |
| Domain name pointing at the server | Ask UMU IT: add an A record `attendance.umu.ac.ug → your IP` in DNS |
| SSH access to the server | VPS provider gives a username + password or SSH key |
| Google OAuth credentials | Google Cloud Console (see Step 14) |
| Gmail App Password for sending emails | Gmail account → Security → App Passwords (see Step 8) |
| Moodle admin access | To run the one-time setup script on the Moodle server (see Step 15) |

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

**Do not** open 3306 (MySQL) or 6379 (Redis) to the internet. These services are on the
Docker internal network only. Exposing them gives an attacker direct database access
with no application-layer protection.

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

**Why:** Running the latest kernel and packages patches known vulnerabilities. The
reboot loads the new kernel. Skipping this step leaves known exploits unpatched.

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

### 3.1 — Harden the Docker daemon

By default Docker runs containers as root inside the container, logs grow forever,
and the daemon exposes the Unix socket to any process on the host. These changes
lock that down.

```bash
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 },
    "nproc": { "Name": "nproc", "Hard": 4096, "Soft": 2048 }
  },
  "storage-driver": "overlay2"
}
EOF
```

**What each option does:**

| Option | Why |
|---|---|
| `live-restore: true` | Containers keep running when Docker daemon restarts (e.g. during `apt upgrade`). Without this, a daemon restart kills all containers. |
| `userland-proxy: false` | Disables Docker's userland proxy — uses iptables DNAT instead. Faster networking, less memory, fewer edge cases with port conflicts. |
| `no-new-privileges: true` | Prevents containers from gaining new privileges via setuid/setgid binaries. Stops a container exploit from escalating to root. |
| `log-driver` + `log-opts` | Caps each container's log at 10 MB × 3 files = 30 MB max per container. Without this, a chatty container fills the disk until the server locks up. |
| `default-ulimits` | Sets file descriptor and process limits per container. Prevents a single container from exhausting all system resources. |
| `storage-driver: overlay2` | The most performant and stable storage driver for modern Linux kernels. Default on most installs but explicit is better. |

Apply the daemon config:
```bash
sudo systemctl restart docker
```

**Verify the limits took effect:**
```bash
docker info | grep -A 5 "Default Runtime"
docker inspect $(docker ps -q) | grep -A 2 "LogConfig"
```

---

## Step 4 — Install Node.js 20 (needed only to build the frontend)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v20.x.x
```

**Why on the server?** The React PWA must be compiled into static files (`client/dist/`)
before Nginx can serve it. This only happens during deployment — the Node.js container
runs the pre-built output.

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
# From Google Cloud Console — see Step 14.
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
# SMTP_PASS must be a Gmail App Password, not your real Gmail password — see Step 8.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=attendance@umu.ac.ug
SMTP_PASS=paste-16-char-gmail-app-password-here
ALERT_FROM_EMAIL=attendance@umu.ac.ug
ALERT_FROM_NAME=UMU Attendance System

# ── Moodle integration ────────────────────────────────────────────────────────
# Token is generated by devops/scripts/moodle/setup-webservice.php — see Step 15.
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

**Why two secrets?** If one is compromised (e.g. leaked in a log), the attacker
can't forge the other token type. Access tokens are short-lived (1 hour); refresh
tokens are long-lived (7 days). Separate secrets mean a leaked refresh token can't
be used to generate access tokens, and vice versa.

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

**Why `MYSQL_ROOT_PASSWORD` too?** MySQL uses it for the root superuser account.
Even though the app connects as `umu_user`, the root password protects against
anyone who gains access to the MySQL container's shell.

### Lock both files

```bash
chmod 600 server/.env .env
```

**Why 600?** Only the file owner can read. Even if another user on the system
gets a shell, they can't read the secrets. Permission 644 would let any user
read JWT secrets and database passwords.

---

## Step 7 — Set up swap file (do this BEFORE starting containers)

Prevents Puppeteer (PDF generation) and MySQL from crashing the server on low RAM:

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

**Why before containers?** Docker containers start immediately and can consume all
RAM within seconds. Puppeteer launches Chromium (headless Chrome) for PDF generation,
which alone needs 300-500 MB. Without swap, the Linux OOM killer picks a process to
kill — often MySQL, which destroys unsaved data.

---

## Step 8 — Get a Gmail App Password

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

## Step 9 — Get an SSL certificate (do this BEFORE starting containers)

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

## Step 10 — Build the frontend

The React PWA must be compiled into static files before Nginx can serve it.

```bash
cd /var/www/umu-attendance/client
npm install
npm run build
cd ..
```

This takes 1–3 minutes and creates `client/dist/`. Nginx serves files from there.

---

## Step 11 — Start all containers

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

## Step 12 — Run database migrations and seed the first admin

### Fresh install (first time on an empty database)

`prisma migrate deploy` runs migrations in **alphabetical** directory order. The
first migration alphabetically is `20250710_add_excuse_requests`, which has
`REFERENCES users` and `REFERENCES sessions` — but those tables don't exist yet.
They're created by `20260804204504_init`, which sorts later. This is why
`prisma migrate deploy` fails on a fresh database with:

```
Error: FOREIGN KEY constraint `excuse_requests_studentId_fkey` is violated.
```

**The fix for fresh installs:** Apply the consolidated init SQL directly (it contains
the final schema with all tables, all foreign keys, all indexes), then tell Prisma
that every incremental migration is already applied.

```bash
# 1. Apply the consolidated schema (creates all tables in correct order)
docker compose exec -T db mysql -u umu_user -p"StrongPassword" umu_attendance \
  < server/prisma/migrations/init/migration.sql

# 2. Tell Prisma all incremental migrations are already applied
docker compose exec app bash devops/scripts/mark-migrations-applied.sh

# 3. Seed the first System Admin
docker compose exec app npm run seed:admin
```

**What `mark-migrations-applied.sh` does:** It runs `prisma migrate resolve --applied`
for every incremental migration name. This tells Prisma's migration history table
"these are already done" — so future `prisma migrate deploy` calls will only run
new migrations added after this point.

### Existing database (updates to a running system)

```bash
docker compose exec app npx prisma migrate deploy
```

This is safe because the incremental migrations run in a non-alphabetical but
chronologically-correct order that Prisma tracks internally.

---

## Step 13 — Google OAuth setup

All users sign in via Google OAuth. This must be configured in Google Cloud Console
before anyone can log in.

### 13.1 Create the project and OAuth client

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

### 13.2 Configure the consent screen

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

### 13.3 Publish the app (required)

1. Back on the OAuth consent screen → click **Publish App → Confirm**
2. Status must change to **In production**

Apps left in "Testing" mode only allow the specific test users you listed.
Apps with `http://` redirect URIs are blocked by Google. Both conditions require
the app to be published with HTTPS URIs.

### 13.4 Allow the app in UMU Google Workspace

By default, Google Workspace admins block all third-party OAuth apps. Without this
step, users see: **"Access blocked: UMU Attendance System has not completed the
Google verification process"**.

Ask the UMU IT Google Workspace admin to:

1. Sign in to [admin.google.com](https://admin.google.com)
2. Go to **Security → Access and data control → API controls**
3. Click **Manage Third-Party App Access → Add app → OAuth App Name or Client ID**
4. Paste the **Client ID** from Step 13.1
5. Set access to **Trusted** → Save

---

## Step 14 — Set up Moodle integration and get the token

Moodle is the source of truth for academic structure (faculties, programmes, course units),
lecturers, and students. The attendance system syncs from Moodle on demand — read-only.

### 14.1 What the setup script does

The file `devops/scripts/moodle/setup-webservice.php` runs on the Moodle server and:

1. Enables Web Services and the REST protocol in Moodle site settings
2. Creates the external service `UMU Attendance Sync` (`umu_attendance_sync`) and
   attaches the 10 required read-only functions
3. Creates a service account user `umu_sync_admin` (never used for browser login)
4. Assigns the system Manager role so the account can read all users and enrolments
5. Issues a permanent token and prints it to the console

The script is **fully idempotent** — safe to run multiple times. If everything already
exists it just reuses it and prints the existing token.

### 14.2 Run the script on the Moodle server

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

### 14.3 Read the output and copy the token

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

### 14.4 Alternative — generate the token manually in the Moodle admin UI

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

### 14.5 Configure which Moodle semester is active

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

## Step 15 — Verify the deployment

Open `https://attendance.umu.ac.ug` in a browser. You should see the UMU Attendance
login page with a **Sign in with Google** button.

1. Click **Sign in with Google** → use the `SEED_ADMIN_EMAIL` account
2. You should land on the **System Admin dashboard**

If the login fails — see the Troubleshooting section at the bottom.

---

## Step 16 — Complete first-time setup as System Admin

After first login, do these steps in order:

1. **Settings → Current Period** — set academic year (e.g. `2026/2027`) and semester number
2. **Settings → Profile Editing** — turn on for Students and Lecturers
3. **Moodle Sync → Configure Period** — enter the Moodle semester category ID (Step 14.5)
4. **Moodle Sync → Run Full Sync** — pulls all faculties, programmes, course units,
   lecturers, and students from Moodle. Takes 1–5 minutes depending on Moodle size.
5. **Imports → Faculty Admins** — upload the Faculty Admin CSV
   Format: `email,fullName,facultyCode` — one row per admin, no header needed

After sync completes, the system **auto-detects** each student's programme/faculty/year
from their Moodle course enrolments. Most students will never see the manual profile
form — they sign in with Google and land directly on their dashboard.

**What happens for students on first login (automatic, no action needed):**

```
Student signs in with Google
        ↓
System detects moodleUserId is set → runs auto-detection
        ↓
Walks CourseUnit → Semester → ProgrammeYear → Programme
        ↓
Picks the programme with the most enrolments (majority vote)
        ↓
Sets faculty, programme, year, semester automatically
        ↓
If studentNumber and regNumber exist → redirect to dashboard (fully done)
If not → show confirmation card with detected path + Student Number input
```

**What happens for lecturers on first login (automatic):**

```
Lecturer signs in with Google
        ↓
System detects moodleUserId is set → runs auto-detection
        ↓
Finds their current-period course assignments
        ↓
Derives faculty memberships from the courses they teach
        ↓
Sets primary faculty + up to 2 additional faculties automatically
        ↓
Redirect to lecturer dashboard (fully done)
```

**Edge cases where manual profile completion is still needed:**

- Student enrolled in equal numbers of courses across two programmes (tie — system can't decide)
- Student has no Moodle enrolments yet (sync hasn't pulled their courses)
- Student's courses don't map to any programme in the hierarchy
- Non-Moodle students (imported via CSV) — no Moodle data to detect from

For these cases, the student sees the full profile form (Campus → Faculty → Programme → Year).

**After sync, verify and proceed:**

6. Faculty Admins sign in with Google → complete profiles → assign lecturers to course units
7. Students sign in with Google → auto-detected profiles → check in to sessions

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

## Step 18 — Server hardening

Do all of these immediately after the server is up and the app is running. They protect
the server itself — not just the application. Each section is independent; you can do
them in any order.

### 18.1 — SSH hardening

Password-based SSH login can be brute-forced. Key-based auth cannot — the attacker
would need your private key file, not just a password guess.

```bash
# First, make sure your SSH key is already on the server and you can log in with it.
# Copy your local key to the server (run from YOUR machine, not the server):
# ssh-copy-id ubuntu@YOUR-SERVER-IP

# Then disable password auth:
sudo nano /etc/ssh/sshd_config
```

Set these lines:
```
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

Save, then restart SSH:
```bash
sudo systemctl restart sshd
```

> **Open a second SSH session before closing the first** to verify you can still get in.
> If you lock yourself out, your VPS provider's console is the only way back in.

**What each setting does:**

| Setting | Why |
|---|---|
| `PasswordAuthentication no` | Only key-based login. Passwords can be brute-forced; keys cannot. |
| `PermitRootLogin no` | Root can't SSH in at all. Forces use of a named user with sudo. Audit logs show who did what. |
| `MaxAuthTries 3` | After 3 failed attempts, the connection is dropped. Throttles brute-force. |
| `ClientAliveInterval 300` | Server sends a keepalive every 5 minutes. Dead connections are cleaned up instead of hanging. |
| `ClientAliveCountMax 2` | If 2 keepalives go unanswered (10 minutes), the connection is killed. |
| `X11Forwarding no` | Disables X11 forwarding. Not needed for a server and expands the attack surface. |

### 18.2 — UFW firewall

Docker manages its own iptables rules and bypasses UFW for container ports. UFW
protects the **host itself** — specifically SSH and any non-Docker services.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
sudo ufw status
```

**Why UFW exists alongside Docker's networking?** UFW protects the host OS. Docker's
iptables rules protect container ports. They operate at different layers. If someone
installs a rogue service on the host (e.g. via a compromised npm postinstall script),
UFW blocks it from being accessible.

### 18.3 — Fail2ban (block brute-force SSH attacks)

```bash
sudo apt install fail2ban -y

# Create a custom jail config (the default sshd jail is too lenient)
sudo tee /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 3
banaction = ufw

[sshd]
enabled = true
port    = 22
filter  = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime  = 3600
EOF

sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check which IPs are currently banned
sudo fail2ban-client status sshd
```

**Why 3 attempts and 1 hour ban?** Legitimate users rarely mistype their SSH key
passphrase 3 times in 10 minutes. Attackers try thousands of passwords. A 1-hour ban
per IP is annoying enough to make attackers move on, but short enough that accidental
lockouts are rare. The `ufw` banaction means banned IPs are blocked at the firewall
level — the SSH daemon never even sees the connection.

### 18.4 — Kernel hardening (sysctl)

These settings harden the Linux kernel itself against network attacks, information
leaks, and privilege escalation.

```bash
sudo tee /etc/sysctl.d/99-umu-hardening.conf << 'EOF'
# ── Network security ──────────────────────────────────────────────────────────

# SYN flood protection. TCP SYN cookies let the kernel respond to connection
# attempts without allocating memory until the handshake completes. Without
# this, an attacker can exhaust kernel memory with half-open connections.
net.ipv4.tcp_syncookies = 1

# Ignore ICMP redirects — prevents an attacker from rerouting traffic
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Ignore source-routed packets — prevents an attacker from specifying the
# route a packet takes to bypass firewall rules
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Log suspicious packets (Martian packets, malformed options) to dmesg.
# Useful for detecting port scans and network mapping.
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# Ignore broadcast ICMP (smurf attack protection)
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Reject ICMP error responses for broadcast/multicast (harder to exploit)
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Reverse path filtering — drops packets that arrive on an interface
# but whose source IP would route out a different interface. Prevents
# IP spoofing and certain man-in-the-middle attacks.
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# ── Memory protection ─────────────────────────────────────────────────────────

# ASLR (Address Space Layout Randomization) — randomizes where libraries,
# stack, and heap are loaded in memory. Makes exploitation harder because
# the attacker can't predict memory addresses.
kernel.randomize_va_space = 2

# Restrict core dumps — prevents setuid programs from dumping memory.
# Core dumps can contain secrets (passwords, keys) and help attackers
# reverse-engineer binary behavior.
fs.suid_dumpable = 0

# Restrict dmesg to root — prevents non-root users from reading kernel
# log messages that might reveal system configuration.
kernel.dmesg_restrict = 1

# Restrict kernel pointer exposure — /proc/sys/kernel/ksysdig and similar
# files reveal kernel memory addresses. Root-only access prevents info leaks.
kernel.kptr_restrict = 2

# ── File system ───────────────────────────────────────────────────────────────

# Restrict symlink/linkfollowing — prevents a user from creating a symlink
# to a file they can't read, then tricking a root process into following it.
fs.protected_symlinks = 1
fs.protected_hardlinks = 1
EOF

# Apply immediately
sudo sysctl --system
```

**Verify:**
```bash
sysctl net.ipv4.tcp_syncookies         # should be 1
sysctl kernel.randomize_va_space       # should be 2
sysctl fs.suid_dumpable               # should be 0
```

### 18.5 — Disable unused services and kernel modules

```bash
# Disable USB storage (if this is a VPS — no physical USB access)
echo "install usb-storage /bin/true" | sudo tee /etc/modprobe.d/disable-usb-storage.conf

# Disable cramfs, freevxfs, hfs, hfsplus, udf (unused filesystems that expand attack surface)
for fs in cramfs freevxfs hfs hfsplus udf; do
  echo "install $fs /bin/true" | sudo tee /etc/modprobe.d/disable-${fs}.conf
done

# Disable IPv6 if not needed (reduces attack surface)
sudo tee /etc/sysctl.d/98-ipv6.conf << 'EOF'
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
EOF
sudo sysctl --system
```

**Why disable unused kernel modules?** Each loaded module increases the attack surface.
If a vulnerability is found in the `cramfs` filesystem driver (for example), and it's
not loaded, it can't be exploited. Even if you never mounted a cramfs filesystem, the
module is still in kernel memory.

### 18.6 — Automatic security updates

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
# Choose "Yes" when prompted
```

This automatically installs OS security patches without manual intervention.
Kernel security patches are the most critical — a 0-day in the kernel can be
exploited before you even know the vulnerability exists.

**What it covers:** Only security patches for the OS and installed packages.
It does NOT upgrade to new Ubuntu releases (e.g. 22.04 → 24.04) — that's a
separate, manual process.

### 18.7 — Audit logging (auditd)

`auditd` is the Linux Audit Daemon. It logs every system call related to file access,
privilege escalation, and authentication to a tamper-evident audit log. This is the
system's "security camera" — it records who did what and when.

```bash
sudo apt install auditd audispd-plugins -y

# Configure audit rules
sudo tee /etc/audit/rules.d/umu-attendance.rules << 'EOF'
# Track changes to SSH configuration
-w /etc/ssh/sshd_config -p wa -k sshd_config

# Track changes to Docker configuration
-w /etc/docker/daemon.json -p wa -k docker_config

# Track privilege escalation (sudo usage)
-w /usr/bin/sudo -p x -k privilege_escalation

# Track user/group changes
-w /usr/sbin/useradd -p x -k user_modification
-w /usr/sbin/usermod -p x -k user_modification
-w /usr/sbin/groupadd -p x -k group_modification
-w /usr/sbin/userdel -p x -k user_deletion

# Track cron job changes
-w /etc/crontab -p wa -k cron_modification
-w /etc/cron.d/ -p wa -k cron_modification
-w /var/spool/cron/ -p wa -k cron_modification

# Track application directory changes
-w /var/www/umu-attendance/server/.env -p wa -k app_secrets
-w /var/www/umu-attendance/.env -p wa -k app_secrets

# Track kernel module loading (detect rootkit injection)
-w /sbin/insmod -p x -k kernel_module
-w /sbin/rmmod -p x -k kernel_module
-w /sbin/modprobe -p x -k kernel_module

# Track firewall changes
-w /usr/sbin/ufw -p x -k firewall_change
-w /usr/sbin/iptables -p x -k firewall_change
-w /usr/sbin/nft -p x -k firewall_change

# Make audit configuration immutable (requires reboot to change)
# This prevents an attacker from disabling audit logging.
# Remove this line temporarily if you need to modify audit rules.
-e 2
EOF

# Restart auditd to load the rules
sudo systemctl restart auditd
sudo systemctl enable auditd
```

**Why auditd matters:**

Without auditd, you can see *that* a Docker container crashed, but not *who* ran
the command that caused it. With auditd, every `sudo`, every config file change,
every user creation is logged with the user's UID, the timestamp, and the exact
command. If the server is compromised, these logs survive in
`/var/log/audit/audit.log` and can't be modified by the attacker (the log is
append-only by the kernel).

**Query the audit log:**
```bash
# See all privilege escalation events
sudo ausearch -k privilege_escalation

# See all changes to app secrets
sudo ausearch -k app_secrets

# See all SSH config changes
sudo ausearch -k sshd_config

# Generate a summary report
sudo aureport --summary
```

### 18.8 — File integrity monitoring (AIDE)

AIDE (Advanced Intrusion Detection Environment) creates a cryptographic hash
database of every system file. If an attacker modifies a binary, installs a
rootkit, or changes a system library, AIDE detects it on the next check.

```bash
sudo apt install aide -y

# Initialize the baseline database (takes 2-5 minutes)
sudo aideinit

# Move the new database into place
sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Schedule a daily check via cron
sudo tee /etc/cron.daily/aide-check << 'SCRIPT'
#!/bin/bash
/usr/bin/aide --check | /usr/bin/mail -s "AIDE Integrity Report - $(hostname)" root
SCRIPT
sudo chmod +x /etc/cron.daily/aide-check
```

**What AIDE checks:** File permissions, ownership, size, and SHA-256 hash of
every file in `/usr/bin`, `/usr/sbin`, `/etc`, `/lib`, and `/boot`. Any change
generates a report.

**When to re-baseline:** After any legitimate system update (`apt upgrade`),
re-run `sudo aideinit` and replace the database. Otherwise the update triggers
false positives.

**Why not just auditd?** Auditd logs *who ran what command*. AIDE detects *what
files were actually modified*. They're complementary — auditd is the security
camera, AIDE is the building inspector.

### 18.9 — Log rotation for Docker logs

Docker's JSON log driver writes to `/var/lib/docker/containers/<id>/<id>-json.log`.
By default these grow forever. A chatty application can fill a 50 GB disk in weeks.

We already set `max-size: 10m` and `max-file: 3` in the Docker daemon config (Step 3.1),
which caps each container at 30 MB of logs. But the host's own system logs also need
rotation:

```bash
sudo tee /etc/logrotate.d/umu-attendance << 'EOF'
/var/backups/umu-attendance/*.sql {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
}
EOF
```

**Verify Docker log limits are active:**
```bash
docker inspect umu-attendance-app-1 --format '{{.HostConfig.LogConfig}}'
# Should show: {json-file map[max-file:3 max-size:10m]}
```

### 18.10 — Process limits and ulimits

These prevent any single process from consuming all system resources (file descriptors,
process count, memory):

```bash
# Set system-wide process limits
sudo tee /etc/security/limits.d/99-umu-attendance.conf << 'EOF'
# Hard limits — kernel-enforced maximum, cannot be exceeded even with ulimit -n
*    hard    nofile    65536
root hard    nofile    65536
*    hard    nproc     4096
root hard    nproc     4096

# Soft limits — default for new processes, can be raised by the user up to the hard limit
*    soft    nofile    65536
root soft    nofile    65536
*    soft    nproc     2048
root soft    nproc     2048

# Core dump size — 0 disables core dumps entirely
*    hard    core      0
*    soft    core      0
EOF

# Also set systemd-level limits for Docker containers
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/limits.conf << 'EOF'
[Service]
LimitNOFILE=65536
LimitNPROC=4096
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
```

**Why 65536 file descriptors?** MySQL can have hundreds of concurrent connections,
each needing a file descriptor. Node.js uses file descriptors for every open socket.
The default 1024 is too low — once exhausted, the application starts failing with
"Too many open files" errors and becomes unresponsive.

### 18.11 — Restrict su and sudo access

```bash
# Only members of the 'adm' or 'sudo' group can use su
sudo chmod 750 /bin/su
sudo chgrp sudo /bin/su

# Log all sudo commands to a dedicated log file
sudo tee /etc/sudoers.d/umu-logging << 'EOF'
Defaults    logfile="/var/log/sudo.log"
Defaults    log_input, log_output
Defaults    iolog_dir="/var/log/sudo-io/%{user}"
EOF
sudo chmod 440 /etc/sudoers.d/umu-logging

# Verify sudoers syntax (never save a broken sudoers file)
sudo visudo -cf /etc/sudoers.d/umu-logging
```

**Why log sudo?** If an attacker compromises a low-privilege user account, they
need `sudo` to escalate. Logging every `sudo` invocation creates an audit trail
that `auditd` also captures, but having it in a dedicated file makes it easy to
monitor: `tail -f /var/log/sudo.log`.

### 18.12 — SSH login banner

Display a legal warning to anyone who connects via SSH. This is required by many
institutional security policies and deters casual attackers:

```bash
sudo tee /etc/issue.net << 'EOF'
*******************************************************************
  UNAUTHORIZED ACCESS TO THIS SYSTEM IS PROHIBITED.
  
  All connections are logged and monitored. Disconnect immediately
  if you are not an authorized user of this system.
*******************************************************************
EOF

# Tell SSH to display the banner
sudo sed -i 's|^#Banner none|Banner /etc/issue.net|' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

### 18.13 — Restrict cron access

```bash
# Only root and users in the cron.allow file can use cron
echo "root" | sudo tee /etc/cron.allow
echo "$USER" | sudo tee -a /etc/cron.allow
sudo chmod 600 /etc/cron.allow

# If /etc/cron.deny exists, remove it (it overrides cron.allow)
sudo rm -f /etc/cron.deny
```

**Why?** Without this, any user on the system can create cron jobs that run as
themselves. An attacker who gets shell access could set up a persistent backdoor
via cron.

---

## Step 19 — Nginx hardening

Update `devops/nginx/umu-attendance.conf` with production-ready security settings.
Replace the demo domain with your actual domain in all four places.

```bash
nano devops/nginx/umu-attendance.conf
```

Replace the entire file with:

```nginx
# UMU Attendance System — Production Nginx Config
#
# Canonical URL: https://attendance.umu.ac.ug
#
# For a different domain, replace DEMO-HOST everywhere and point the
# certificate paths at the correct Let's Encrypt directory.

upstream umu_app {
    server app:4000;
}

# ── Rate limiting zones ──────────────────────────────────────────────────────
# These are defined at the http level (outside server blocks) and referenced
# inside location blocks. The keys are defined by the variable in key=.

# General API rate limit: 20 requests/second per IP, burst of 40
# Prevents any single IP from overwhelming the API
limit_req_zone $binary_remote_addr zone=api_general:10m rate=20r/s;

# Auth rate limit: 5 requests/second per IP, burst of 10
# Login/callback endpoints are expensive (OAuth redirect, JWT signing)
limit_req_zone $binary_remote_addr zone=api_auth:10m rate=5r/s;

# Check-in rate limit: 10 requests/second per IP, burst of 20
# Students should only submit one check-in per session, but mobile
# networks can retry on timeout
limit_req_zone $binary_remote_addr zone=api_checkin:10m rate=10r/s;

# ── Port 80: ACME challenges + force HTTPS ──────────────────────────────────
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Let's Encrypt HTTP-01 renewals while nginx is up (webroot mode)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
    }

    location / {
        return 301 https://attendance.umu.ac.ug$request_uri;
    }
}

# ── Port 443: the application ───────────────────────────────────────────────
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name attendance.umu.ac.ug;

    ssl_certificate     /etc/letsencrypt/live/attendance.umu.ac.ug/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/attendance.umu.ac.ug/privkey.pem;

    # Modern TLS only — TLS 1.0/1.1 are broken
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP Stapling — faster TLS handshakes, no privacy leak to CA
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 1.1.1.1 valid=300s;
    resolver_timeout 5s;

    # ── Security headers ─────────────────────────────────────────────────────
    # HSTS: tell browsers to ONLY use HTTPS for 6 months. Even if an attacker
    # strips the HTTPS redirect, the browser refuses HTTP.
    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;

    # Prevent MIME type sniffing — stops browsers from guessing content types
    add_header X-Content-Type-Options "nosniff" always;

    # Prevent clickjacking — page can only be embedded in same-origin iframes
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Control referrer information — don't leak full URLs to third parties
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Permissions Policy — disable browser features the app doesn't use
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;

    # Content Security Policy — restrict where resources can load from
    # This is aggressive; loosen only if a specific legitimate resource breaks.
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self';" always;

    client_max_body_size 10m;

    # ── Logging ───────────────────────────────────────────────────────────────
    # Access log with IPs for security analysis; error log for debugging
    access_log /var/log/nginx/umu-access.log;
    error_log  /var/log/nginx/umu-error.log warn;

    # ── Serve React PWA ──────────────────────────────────────────────────────
    root /usr/share/nginx/html;
    index index.html;

    # Hashed build assets are immutable: cache hard, but NEVER fall back to
    # index.html — serving HTML for a missing .js yields a blank white page.
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Entry points that must always revalidate, or PWA updates never land.
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
    location = /sw.js {
        add_header Cache-Control "no-cache";
    }
    location = /registerSW.js {
        add_header Cache-Control "no-cache";
    }
    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache";
    }

    # SPA routes + everything else (icons etc.)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # ── API proxy ─────────────────────────────────────────────────────────────
    # Proxy API requests to the Node.js app container(s).
    # Docker's embedded DNS re-resolves `app` every 10 s so replicas added or
    # removed via `docker compose up --scale app=N` are picked up live.
    location /api/ {
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $app_upstream app;

        # Rate limiting: burst of 40, then 20 req/s per IP
        limit_req zone=api_general burst=40 nodelay;
        limit_req_status 429;

        proxy_pass http://$app_upstream:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_connect_timeout 5s;

        # Long-lived requests (PDF generation can take several seconds)
        proxy_read_timeout 60s;
    }

    # Auth endpoints get stricter rate limiting
    location /api/auth/ {
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $app_upstream app;

        limit_req zone=api_auth burst=10 nodelay;
        limit_req_status 429;

        proxy_pass http://$app_upstream:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
    }

    # Check-in endpoint gets moderate rate limiting
    location /api/checkin {
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $app_upstream app;

        limit_req zone=api_checkin burst=20 nodelay;
        limit_req_status 429;

        proxy_pass http://$app_upstream:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }

    # ── Block common attack patterns ─────────────────────────────────────────
    # Deny requests for common exploit paths
    location ~* \.(env|git|svn|htaccess|htpasswd|ini|log|bak|sql)$ {
        return 404;
    }

    # Deny PHP execution (defense in depth — there's no PHP, but if someone
    # uploads a .php file somehow, it shouldn't execute)
    location ~* \.php$ {
        return 404;
    }
}
```

**Apply the new config:**
```bash
docker compose exec nginx nginx -t   # test syntax
docker compose exec nginx nginx -s reload   # apply zero-downtime
```

**Verify rate limiting is working:**
```bash
# Generate 50 rapid requests — should get some 429 responses after the burst
for i in $(seq 1 50); do curl -s -o /dev/null -w "%{http_code}\n" https://attendance.umu.ac.ug/api/health; done
```

---

## Step 20 — Set up monitoring

### 20.1 — Quick health dashboard

Install `htop` and `docker stats` aliases:

```bash
sudo apt install htop iotop ncdu -y
```

Daily health check script:
```bash
sudo tee /usr/local/bin/health-check.sh << 'SCRIPT'
#!/bin/bash
echo "=== Server Health: $(date) ==="
echo ""
echo "--- Uptime ---"
uptime
echo ""
echo "--- Disk ---"
df -h / | tail -1 | awk '{print $5 " used of " $2}'
echo ""
echo "--- Memory ---"
free -h | grep Mem
echo ""
echo "--- Docker Containers ---"
docker compose -f /var/www/umu-attendance/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"
echo ""
echo "--- SSL Certificate ---"
sudo certbot certificates 2>/dev/null | grep -A 2 "Certificate Name" | head -5
echo ""
echo "--- Last 5 login attempts ---"
sudo last -5
echo ""
echo "--- Fail2ban bans ---"
sudo fail2ban-client status sshd 2>/dev/null | grep "Currently banned"
SCRIPT
sudo chmod +x /usr/local/bin/health-check.sh
```

Run it anytime:
```bash
sudo health-check.sh
```

### 20.2 — Disk space alert (cron)

Add a cron job that alerts if disk usage exceeds 80%:

```bash
sudo tee /usr/local/bin/disk-alert.sh << 'SCRIPT'
#!/bin/bash
USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$USAGE" -gt 80 ]; then
    echo "WARNING: Disk usage is ${USAGE}% on $(hostname) at $(date)" | \
      mail -s "DISK ALERT: $(hostname)" root 2>/dev/null || \
      echo "WARNING: Disk usage is ${USAGE}% — mail not configured, check manually"
fi
SCRIPT
sudo chmod +x /usr/local/bin/disk-alert.sh

# Add to crontab — runs every 6 hours
(crontab -l 2>/dev/null; echo "0 */6 * * * /usr/local/bin/disk-alert.sh") | crontab -
```

### 20.3 — Docker container auto-restart watchdog

Docker's `restart: always` policy handles most crashes, but this cron job catches
edge cases where the container is "running" but the health check fails:

```bash
sudo tee /usr/local/bin/docker-watchdog.sh << 'SCRIPT'
#!/bin/bash
cd /var/www/umu-attendance

# Check if app container health check is failing
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' umu-attendance-app-1 2>/dev/null)
if [ "$HEALTH" = "unhealthy" ]; then
    echo "$(date): App container unhealthy, restarting..." >> /var/log/docker-watchdog.log
    docker compose restart app
fi

# Check if any container is in "restarting" loop
RESTARTING=$(docker compose ps --format "{{.Status}}" | grep -c "Restarting")
if [ "$RESTARTING" -gt 0 ]; then
    echo "$(date): $RESTARTING container(s) in restart loop, doing full restart..." >> /var/log/docker-watchdog.log
    docker compose down && docker compose up -d
fi
SCRIPT
sudo chmod +x /usr/local/bin/docker-watchdog.sh

# Run every 5 minutes
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/docker-watchdog.sh") | crontab -
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
| 8 | **Re-apply hardening** | Run Steps 18.1-18.13 on the new server (sysctl, auditd, AIDE, etc.) |

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

# Run a migration (existing database)
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

### Security and audit

```bash
# See currently banned IPs
sudo fail2ban-client status sshd

# Unban a specific IP (accidentally banned?)
sudo fail2ban-client set sshd unbanip 1.2.3.4

# View audit log for privilege escalation
sudo ausearch -k privilege_escalation

# View audit log for app secret changes
sudo ausearch -k app_secrets

# View sudo log
sudo tail -20 /var/log/sudo.log

# Run AIDE integrity check
sudo aide --check

# Check UFW status
sudo ufw status numbered

# See what kernel modules are loaded
lsmod
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
| Nginx crash-loop "cannot load certificate" | Certificate doesn't exist yet — run certbot first (Step 9), then `docker compose up -d nginx`. Also check `server_name` and cert paths in `devops/nginx/umu-attendance.conf` match your domain |
| Google login: "redirect_uri_mismatch" | `GOOGLE_CALLBACK_URL` in `server/.env` must match exactly what's registered in Google Cloud Console (including `https://`, no trailing slash) |
| Google login: "Access blocked" | OAuth consent screen must be External + status In production. Also, UMU Workspace admin must allow the app — Step 13.4 |
| Google login: "Access Denied / not-registered" | The user's email is not in the database yet. System Admin must import them, or run a Moodle sync first |
| Emails not sending | `SMTP_PASS` must be a Gmail App Password (16 chars), not your real Gmail password. 2-Step Verification must be enabled on the Gmail account |
| PDF not generating | `docker compose up -d --build` to rebuild the app image (Puppeteer/Chromium must be installed). Check `server/assets/umu-logo.svg` exists. Add a 2 GB swap file — Step 7 |
| PWA not installing | Check `/manifest.webmanifest` returns HTTP 200. Check PWA icons exist in `client/public/` |
| Moodle sync: "MOODLE_NOT_CONFIGURED" | Set `MOODLE_BASE_URL` and `MOODLE_WS_TOKEN` in `server/.env`, then `docker compose up -d app` |
| Moodle sync: "semester not resolved" | Go to System Admin → Moodle Sync → Configure Period and set the Moodle semester category ID |
| Moodle sync: users skipped "wrong domain" | Student emails must be `@stud.umu.ac.ug`. Lecturer emails must be `@umu.ac.ug`. Users with other domains are skipped |
| No space left on device | `docker system prune -f`, then `df -h`. Delete old backups in `/var/backups/umu-attendance/` if needed |
| Container keeps restarting | `docker compose logs app --tail=20` — read the last few lines before the crash message |
| Changes to `.env` not taking effect | Use `docker compose up -d app` — not `docker compose restart app`. `restart` keeps old env vars in memory; `up -d` recreates the container with the new values |
| "Too many open files" error | Check that `daemon.json` ulimits were applied: `docker info | grep -i ulimit`. Also check `/etc/security/limits.d/99-umu-attendance.conf` exists. |
| SSH key login not working after hardening | Run `sudo systemctl restart sshd` and try again. Verify your key is in `~/.ssh/authorized_keys`. Check `/var/log/auth.log` for the specific error. |
| Fail2ban banned your IP | `sudo fail2ban-client set sshd unbanip YOUR-IP`. Then check why — were you mistyping the passphrase? |
| AIDE reports false positives after apt upgrade | Re-initialize the database: `sudo aideinit && sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db` |

---

## Ongoing maintenance schedule

### Daily (automated, no action needed)

- Database backups at 2am (cron job from Step 17)
- Docker container auto-restart watchdog (cron job from Step 20.3)
- Disk space alert check (cron job from Step 20.2)
- AIDE integrity check (cron job from Step 18.8)

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

# Fail2ban — any IPs banned?
sudo fail2ban-client status sshd

# Backup files being created?
ls -lht /var/backups/umu-attendance/ | head -3
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

# Re-baseline AIDE after OS updates
sudo aideinit && sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Review audit log for anything suspicious
sudo aureport --summary
sudo ausearch -k privilege_escalation --start recent

# Check Docker daemon config is still correct
docker info | grep -A 5 "Live Restore"
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
6. Check audit logs: `sudo ausearch -k app_secrets` — see if anyone accessed the secrets file

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

1. **Take it offline immediately** — `sudo ufw deny all` blocks all traffic
2. **Do not wipe it yet** — preserve logs for investigation
3. **Copy the logs** before anything else:
   ```bash
   docker compose logs app > /tmp/app-logs-incident.txt
   docker compose logs nginx > /tmp/nginx-logs-incident.txt
   sudo cp /var/log/auth.log /tmp/
   sudo cp /var/log/audit/audit.log /tmp/
   sudo cp /var/log/sudo.log /tmp/
   sudo fail2ban-client status sshd > /tmp/fail2ban-incident.txt
   ```
4. **Preserve the AIDE database** — it shows what files changed since last baseline:
   ```bash
   sudo cp /var/lib/aide/aide.db /tmp/aide-incident.db
   ```
5. **Rotate all secrets** — JWT secrets, DB passwords, Google Client Secret, Moodle token
6. **Restore from backup** on a fresh server using the deployment guide from Step 1
7. **Notify** the university data protection officer — student data may have been accessed

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
- [ ] Ask one Lecturer to sign in — their faculty should be auto-detected from course assignments
- [ ] Ask one Student to sign in — their programme/year should be auto-detected from Moodle enrolments, just enter Student Number
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

## Deployment verification checklist

Run this after every fresh deploy or server rebuild to confirm everything is locked down:

- [ ] **SSH:** `PasswordAuthentication no` in `/etc/ssh/sshd_config`, root login disabled
- [ ] **UFW:** `sudo ufw status` shows only 22, 80, 443 allowed
- [ ] **Fail2ban:** `sudo fail2ban-client status sshd` shows the service is active
- [ ] **Docker daemon:** `docker info | grep "Live Restore"` shows `true`
- [ ] **Sysctl:** `sysctl net.ipv4.tcp_syncookies` shows `1`, `kernel.randomize_va_space` shows `2`
- [ ] **Auditd:** `sudo systemctl status auditd` shows active, rules loaded
- [ ] **AIDE:** `sudo aide --check` runs without errors (baseline is current)
- [ ] **Log rotation:** `docker inspect umu-attendance-app-1 --format '{{.HostConfig.LogConfig}}'` shows `max-size:10m`
- [ ] **Env files:** `ls -la server/.env .env` both show `600` permissions
- [ ] **Nginx:** `docker compose exec nginx nginx -t` passes, `curl -I https://...` returns 200
- [ ] **SSL:** `sudo certbot certificates` shows valid cert with >30 days remaining
- [ ] **Containers:** `docker compose ps` shows all Up (healthy)
- [ ] **Backups:** `ls -lht /var/backups/umu-attendance/ | head -3` shows a recent file

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
| Skip the `mark-migrations-applied.sh` step on fresh install | `prisma migrate deploy` fails because alphabetically-first migrations reference tables that don't exist yet |
| Run `docker compose restart app` after editing `.env` | `restart` keeps old env vars in memory — always use `docker compose up -d app` |
| Disable auditd or AIDE to "save resources" | You lose the only record of who ran what commands — invaluable during incident response |
| Leave the server's default SSH port open without fail2ban | Port 22 bots scan constantly — without fail2ban, brute-force attempts fill auth.log and slow the server |
