# How to Deploy UMU Attendance to a Ubuntu Server
### A step-by-step guide for beginners

---

## What you will end up with

By the end of this guide, the UMU Attendance System will be:
- Running on your Ubuntu server
- Accessible from any browser on the network
- Secured with HTTPS (padlock in the browser)
- Automatically restarting if the server reboots

---

## What you need before you start

| Thing | Where to get it |
|---|---|
| An Ubuntu Server 22.04 or 24.04 machine | VPS provider (Railway, DigitalOcean, Hetzner) or a physical server on campus |
| The server's IP address | Shown in your VPS dashboard, or run `ip addr` on the server |
| A domain name pointed at the server | Ask UMU IT to add `attendance.umu.ac.ug → your IP` in DNS |
| SSH access to the server | Your VPS provider gives you a username + password or SSH key |
| The Google OAuth credentials | Already set up — Client ID and Secret from Google Cloud Console |
| A Gmail App Password for sending emails | See Step 9 below |

> **What is SSH?**
> SSH lets you control the server from your laptop by typing commands.
> You open a terminal and connect remotely — like TeamViewer but text-only.

---

## Step 0 — Connect to your server

On your laptop, open a terminal (Mac/Linux) or PowerShell (Windows) and type:

```bash
ssh your-username@your-server-ip
```

Example:
```bash
ssh ubuntu@41.210.100.50
```

It will ask for a password. Type it (nothing shows on screen while typing — that is normal). Press Enter.

You are now inside the server. Every command below is typed here.

---

## Step 1 — Update the server

Always do this first on a fresh server. It downloads security fixes.

```bash
sudo apt update && sudo apt upgrade -y
```

> `sudo` means "run as administrator".
> `apt` is Ubuntu's package manager (like an app store for the terminal).
> `-y` means "yes to everything" so it doesn't ask you to confirm each package.

This takes 1–3 minutes. Wait for it to finish.

---

## Step 2 — Install Docker

Docker lets you run the app, database, and web server as isolated containers.
Think of each container as a mini computer inside your server.

```bash
# Install required tools
sudo apt install -y ca-certificates curl gnupg

# Add Docker's official key (proves the download is genuine)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker to the list of sources Ubuntu can install from
echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Let your user run Docker without typing sudo every time
sudo usermod -aG docker $USER

# Apply the group change (or log out and back in)
newgrp docker
```

**Check it worked:**
```bash
docker --version
```
You should see something like: `Docker version 26.1.3`

---

## Step 3 — Install Git

Git lets you download the project code from GitHub.

```bash
sudo apt install -y git
```

**Check it worked:**
```bash
git --version
```

---

## Step 4 — Download the project

```bash
# Create a folder for the app
sudo mkdir -p /var/www/umu-attendance
sudo chown $USER:$USER /var/www/umu-attendance

# Download the code from GitHub
git clone https://github.com/edkaydev/umu-attendance-system.git /var/www/umu-attendance

# Go into the project folder
cd /var/www/umu-attendance
```

> `git clone` copies the entire project from GitHub to your server.
> You only do this once. After that you use `git pull` to get updates.

---

## Step 5 — Create the environment files

The `.env` files hold all your secret settings (database password, Google keys, etc.).
They are never uploaded to GitHub — you create them fresh on each server.

There are **two** env files:

1. **`server/.env`** — settings for the Node.js app.
2. **`.env`** (repo root) — the database passwords that Docker Compose reads.

```bash
cp server/.env.example server/.env
cp .env.example .env
nano server/.env
```

> `nano` is a simple text editor in the terminal.
> Use arrow keys to move. Edit the values. When done: **Ctrl+X → Y → Enter** to save.

Fill in each value in `server/.env`:

```bash
NODE_ENV=production
PORT=4000
CLIENT_URL=https://attendance.umu.ac.ug

# Database — change the password to something strong
DATABASE_URL=mysql://umu_user:ChooseAStrongPassword@db:3306/umu_attendance

# Google OAuth — from Google Cloud Console
GOOGLE_CLIENT_ID=paste-your-client-id-here
GOOGLE_CLIENT_SECRET=paste-your-client-secret-here
GOOGLE_CALLBACK_URL=https://attendance.umu.ac.ug/api/auth/google/callback

# JWT secrets — generate these (see below)
JWT_ACCESS_SECRET=paste-64-char-random-string-here
JWT_REFRESH_SECRET=paste-different-64-char-random-string-here
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Email — for sending attendance alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=attendance@umu.ac.ug
SMTP_PASS=paste-your-gmail-app-password-here
ALERT_FROM_EMAIL=attendance@umu.ac.ug
ALERT_FROM_NAME=UMU Attendance System

# PDF logo is committed at server/assets/umu-logo.svg and embedded as base64 (no env var needed)

# First system admin account
SEED_ADMIN_EMAIL=edward@umu.ac.ug
SEED_ADMIN_PASSWORD=choose-a-strong-password
SEED_ADMIN_NAME=System Administrator
```

**Generate the JWT secrets** (run this twice — one for each secret):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the output and paste it as your `JWT_ACCESS_SECRET`, run again for `JWT_REFRESH_SECRET`.

---

## Step 6 — Match the database password in both env files

The database password must be the **same** in both files:

- In `server/.env`, inside the `DATABASE_URL` value: `mysql://umu_user:ChooseAStrongPassword@db:3306/umu_attendance`
- In `.env` (root), the `MYSQL_PASSWORD=ChooseAStrongPassword` value

```bash
nano .env
```

> If these don't match, the app container won't be able to connect to the database.
> If a password contains special characters (like `#`, `@`, `%`), URL-encode it in
> `DATABASE_URL` — e.g. `Console.log#75` becomes `Console.log%2375`.

## Step 7 — Install Node.js (to build the frontend)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**Check it worked:**
```bash
node --version   # should show v20.x.x
npm --version    # should show 10.x.x
```

---

## Step 8 — Build the React frontend

This turns the React source code into static HTML/CSS/JS files that Nginx will serve.

```bash
cd /var/www/umu-attendance/client
npm install
npm run build
cd ..
```

> `npm install` downloads all the code libraries the frontend needs.
> `npm run build` compiles everything into the `client/dist/` folder.
> This takes 1–2 minutes.

---

## Step 9 — Gmail App Password (for emails)

The system sends three kinds of email, and nothing else:

1. **Attendance threshold alerts** — when a student falls below 80%/75%.
2. **Session-open notices** — enrolled students are told check-in is open and
   when it closes (the code is never emailed; it is shown in class).
3. **Weekly attendance summaries** — every Monday ~07:00 East Africa Time.

There is deliberately no "session ended" email and no emailed codes — the
dashboard is always the live source of truth.

Gmail requires an "App Password" — a special password just for apps, not your real password.

1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Click **Security** → **2-Step Verification** (must be turned on first)
3. Scroll down → **App passwords**
4. Select app: **Mail** → Select device: **Other** → type "UMU Attendance"
5. Click **Generate** → copy the 16-character password
6. Paste it as `SMTP_PASS` in your `server/.env` file

---

## Step 10 — Set up SSL (HTTPS) FIRST

Do this **before** starting the containers. Without HTTPS, browsers will show "Not Secure"
and Google OAuth will not work in production.

> **Important:** Nginx needs the certificate file to already exist when it starts.
> If the containers start without it, Nginx crash-loops with:
> `cannot load certificate "/etc/letsencrypt/live/...": No such file or directory`.
> That is why this step comes before "Start the containers" (Step 11).

**Option A — a real domain (e.g. `attendance.umu.ac.ug`)**

First make sure the domain points to this server's IP:
```bash
ping attendance.umu.ac.ug
```
It should return your server's IP address. If not, DNS hasn't updated yet — wait 10–30 minutes and try again.

**Option B — no domain yet (use the server IP)**

You can use a free subdomain that automatically points to your IP. For IP `41.210.100.50`
the address is `41.210.100.50.sslip.io` (replace with your real IP everywhere below).

---

**Get the certificate** (works for both options — pick your domain):

```bash
sudo apt install -y certbot

# Get a certificate for your domain
sudo certbot certonly --standalone -d attendance.umu.ac.ug
```

> Replace `attendance.umu.ac.ug` with `YOUR-IP.sslip.io` if using Option B.
> Certbot asks for your email and to agree to terms — type `Y` and press Enter.
> Certbot needs port 80. On a fresh server nothing is running yet, so it works directly.
> If you already started the containers, stop nginx first:
> `cd /var/www/umu-attendance && docker compose stop nginx`, run the certbot command,
> then `docker compose start nginx`.

The certificate is saved to `/etc/letsencrypt/live/YOUR-DOMAIN/fullchain.pem`.

**Auto-renewal** (certificates expire every 90 days — this renews them automatically):
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

**Make Nginx use your certificate.** The Nginx config at
`devops/nginx/umu-attendance.conf` must reference your domain's certificate paths:

```bash
nano devops/nginx/umu-attendance.conf
```

Change these two lines to your domain:
```nginx
ssl_certificate     /etc/letsencrypt/live/YOUR-DOMAIN/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/YOUR-DOMAIN/privkey.pem;
```

Also update `server_name` on both server blocks. Save: **Ctrl+X → Y → Enter**.

---

## Step 11 — Start the containers

```bash
cd /var/www/umu-attendance
docker compose up -d --build
```

> `-d` means "detached" — runs in the background so you can keep using the terminal.
> `--build` builds the Node.js Docker image from source.
> First time takes 3–5 minutes (downloading images).

**Check everything is running:**
```bash
docker compose ps
```

You should see four containers all with status `Up`:
```
NAME                       STATUS
umu-attendance-db-1        Up
umu-attendance-redis-1     Up
umu-attendance-app-1       Up
umu-attendance-nginx-1     Up
```

---

## Step 12 — Run database migrations

This creates all the database tables the app needs.

```bash
docker compose exec app npx prisma migrate deploy
```

> `exec app` means "run this command inside the app container".
> `prisma migrate deploy` applies all the database schema changes.

---

## Step 13 — Create the first System Admin account

```bash
docker compose exec app npm run seed:admin
```

This creates the System Admin account using the email and password you set in
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (default `edward@umu.ac.ug`).
That person signs in on the login page with that email + password, or with Google once
UMU Workspace has allowed the app. They can then add every other user (staff and
students) from **User Management → Add User** or by CSV import.

> The **login page now has an email + password form**, so nobody needs Google to sign in.
> Students use `@stud.umu.ac.ug` accounts and staff use `@umu.ac.ug` accounts.

---

## Step 14 — Update Google OAuth for production

Go back to Google Cloud Console → OAuth consent screen → Clients → edit your web client.
The redirect URI must use **https** and match your domain exactly:

**Authorised JavaScript origins:**
```
https://attendance.umu.ac.ug
```

**Authorised redirect URIs:**
```
https://attendance.umu.ac.ug/api/auth/google/callback
```

> Google lets a client have **several** origins and redirect URIs at once. If you deploy
> to a new domain/IP, just **add** the new ones — keep the old ones so the previous
> deployment keeps working.

Then check the OAuth consent screen **Audience** page:
- **User type** must be **External** (Internal only works for Google accounts inside the
  same Google Workspace that owns the Cloud project — this blocks everyone else).
- **Publishing status** must be **In production**. Google refuses to publish apps whose
  redirect URIs use plain `http://` — HTTPS is mandatory.

Also update your `server/.env`:
```bash
nano server/.env
```
Change:
```bash
CLIENT_URL=https://attendance.umu.ac.ug
GOOGLE_CALLBACK_URL=https://attendance.umu.ac.ug/api/auth/google/callback
```

Then restart the app container to pick up the new `.env`:
```bash
cd /var/www/umu-attendance
docker compose up -d app
```

> Use `docker compose up -d app`, not `docker compose restart app` — `restart` keeps the
> old environment variables, but `up -d` recreates the container and reads the new `.env`.

---

## Step 15 — Open the app

Go to `https://attendance.umu.ac.ug` in your browser.

You should see the UMU Attendance login page with an email + password form (and a Google
button). Sign in as the System Admin with `edward@umu.ac.ug` + the password you set
in `SEED_ADMIN_PASSWORD`.

**First things to do after logging in:**
1. Settings → Set the current Academic Year and Semester
2. Settings → Enable profile editing for students and lecturers
3. Academic Setup → Create Faculty, Programmes, Course Units
4. Users → Add User, or Import → CSV → Staff/Student accounts (each account gets a password)
5. Faculty Admins log in → assign lecturers to units
6. Students log in → complete their profiles → auto-enrolled

> CSV templates: **Staff** = `name,email,role,facultyCode,password` (role: lecturer | faculty_admin; facultyCode required),
> **Students** = `name,email,password`. Students choose their faculty, programme and year on first login. Download templates from the Import page.

---

## How to update the app when you push new code

Every time you push changes to GitHub, run this on the server:

```bash
cd /var/www/umu-attendance

# Pull the latest code
git pull origin main

# Rebuild the frontend
cd client && npm install && npm run build && cd ..

# Restart the containers with the new code
docker compose up -d --build

# Apply any new database changes
docker compose exec app npx prisma migrate deploy
```

Or use the deploy script:
```bash
bash devops/scripts/deploy.sh
```

---

## Moving to a NEW server or a NEW domain

The project is designed to be redeployed. When UMU gives you the new server's IP and
domain, follow this checklist. The domain must be changed in **four** places — missing one
causes either a wrong address or a Google login failure.

> Use the same steps as a fresh install (Step 0 onwards). The only extra work is replacing
> the old domain with the new one everywhere listed below.

| # | Place | What to change |
|---|---|---|
| 1 | **DNS** | Your domain's A record must point to the new server's IP. Check with `ping your-domain`. |
| 2 | **SSL certificate** | On the new server, run `sudo certbot certonly --standalone -d YOUR-DOMAIN` (Step 10). Certificates are per-domain and cannot be copied between servers. |
| 3 | **Nginx config** (`devops/nginx/umu-attendance.conf`) | `server_name` on both server blocks, and both `ssl_certificate`/`ssl_certificate_key` paths → `YOUR-DOMAIN`. |
| 4 | **`server/.env`** | `CLIENT_URL=https://YOUR-DOMAIN` and `GOOGLE_CALLBACK_URL=https://YOUR-DOMAIN/api/auth/google/callback` |
| 5 | **Google Cloud Console** | Add `https://YOUR-DOMAIN` to **Authorised JavaScript origins** and `https://YOUR-DOMAIN/api/auth/google/callback` to **Authorised redirect URIs** (old ones can stay). |
| 6 | **Environment files** | On a new server, `.env` and `server/.env` are created fresh from the `.example` files — nothing is committed to GitHub. Set a new strong database password and new JWT secrets. |

Quick search to find every leftover reference to the old domain:
```bash
grep -rn "old-domain-or-ip" . --include="*.conf" --include="*.env*" --exclude-dir=node_modules
```

> If the new server gets a **new IP** but keeps the **same domain**, only items 2, 4 and the
> DNS record change — the Google Console entries and Nginx `server_name` stay the same.

---

## Useful commands — day to day

```bash
# See if all containers are running
docker compose ps

# Watch live logs from the app (Ctrl+C to stop)
docker compose logs -f app

# Watch live logs from Nginx (web server)
docker compose logs -f nginx

# Restart the app (code change only — for .env changes use `docker compose up -d app`)
docker compose restart app

# Stop everything
docker compose down

# Start everything again
docker compose up -d

# Get inside the app container (like SSH but into Docker)
docker compose exec app sh
```

---

## Database backup

Run this any time you want to save a copy of your data:

```bash
bash devops/scripts/backup-db.sh
```

Backups are saved to `/var/backups/umu-attendance/`. The last 30 are kept automatically.

**Schedule automatic daily backup at 2am:**
```bash
crontab -e
```
Add this line at the bottom (it loads the database password from the root `.env` first):
```
0 2 * * * cd /var/www/umu-attendance && set -a && source .env && set +a && bash devops/scripts/backup-db.sh
```
Save: **Ctrl+X → Y → Enter**

---

## Troubleshooting

### "Cannot connect to server" / site not loading
```bash
# Check all containers are up
docker compose ps

# Check for errors in the app
docker compose logs app --tail=50
```

---

### "502 Bad Gateway" in the browser
The Node.js app crashed. Check why:
```bash
docker compose logs app --tail=100
```
Common causes: wrong `DATABASE_URL`, missing `.env` values, bad JWT secret.
Fix the `.env` then restart:
```bash
docker compose restart app
```

---

### "redirect_uri_mismatch" on Google login
The URL in your `.env` doesn't match what's registered in Google Console.

Check your `.env`:
```bash
grep GOOGLE_CALLBACK_URL server/.env
```
Make sure it exactly matches the URI in Google Cloud Console → Clients → your client → Authorised redirect URIs.

---

### "Access denied" when logging in
For **email + password** login: the email or password is wrong, or the account was not
created yet (System Admin must create/import it first). Students must use a
`@stud.umu.ac.ug` email and staff an `@umu.ac.ug` email.

For **Google** login, the Google account may not match a user in the database. Common causes:
- The email domain is wrong (must be `@umu.ac.ug` or `@stud.umu.ac.ug`)
- Staff account hasn't been imported yet (System Admin needs to import staff CSV)
- Account is deactivated (System Admin → Users → reactivate)

---

### Google login works but redirects back to login page
Usually a cookie problem. Check:
```bash
grep CLIENT_URL server/.env
```
It must be `https://` not `http://` in production, and must match the exact domain.

---

### Database connection error
```bash
# Check the database container is healthy
docker compose ps db

# Check db logs
docker compose logs db --tail=30
```
Common cause: `DATABASE_URL` password doesn't match `MYSQL_PASSWORD` in the root `.env` file.

---

### Emails not sending
```bash
docker compose logs app | grep -i smtp
```
Common causes:
- `SMTP_PASS` is your real Gmail password instead of an App Password
- 2-Step Verification not enabled on the Gmail account (required for App Passwords)
- Firewall blocking port 587 — check with `telnet smtp.gmail.com 587`

---

### PDF download not working / shows error
```bash
docker compose logs app | grep -i -E "pdf|puppeteer|chromium"
```
The app generates PDFs with Puppeteer's **bundled Chromium**. The `Dockerfile` already
installs the system libraries Chromium needs, but if the image is out of date (e.g. after
an OS update on the server), Chromium can fail to launch. Fix: rebuild the image with
`docker compose up -d --build`. Also check `server/assets/umu-logo.svg` exists (it is
committed to the repo and must not be deleted).

---

### "No space left on device"
Docker images and logs fill up disk over time. Clean up:
```bash
# Remove unused Docker images and containers
docker system prune -f

# Check disk usage
df -h
```

---

### Container keeps restarting
```bash
docker compose logs app --tail=20
```
Look for the error on the last line before it crashed. Usually a missing `.env` variable or database not ready yet.

---

### How to check server disk / memory

```bash
# Disk space
df -h

# Memory usage
free -h

# CPU and running processes
top
# Press Q to quit top
```

---

## Quick reference card

| Task | Command |
|---|---|
| Connect to server | `ssh ubuntu@your-ip` |
| Go to project folder | `cd /var/www/umu-attendance` |
| Check containers | `docker compose ps` |
| View app logs | `docker compose logs -f app` |
| Restart app | `docker compose restart app` |
| Deploy update | `bash devops/scripts/deploy.sh` |
| Backup database | `bash devops/scripts/backup-db.sh` |
| Check disk space | `df -h` |
| Edit env file | `nano server/.env` |
