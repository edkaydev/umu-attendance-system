# 11 — Demo Server Deployment (172.209.216.102)

Production-grade runbook for deploying the UMU Attendance System to the Azure
demo VM. Follow top-to-bottom on a fresh server; every step is idempotent
afterwards via the deploy script.

---

## 1. Deployment summary

| Item | Value |
|---|---|
| Cloud / region | Azure · South Africa North |
| OS image | Ubuntu Server 24.04 LTS |
| Public IP | `172.209.216.102` |
| Canonical URL | **https://172.209.216.102.sslip.io** |
| Bare-IP entry | `http://172.209.216.102` → 301 → canonical URL |
| TLS | Let's Encrypt (HTTP-01, webroot renewals, zero downtime) |
| Stack | nginx ↔ Node app + Redis ← MySQL (all in Docker Compose) |
| Repo checkout on server | `/var/www/umu-attendance` |

### Why `.sslip.io` and not `https://172.209.216.102` directly?

Let's Encrypt does not issue certificates for bare IP addresses.
[`sslip.io`](https://sslip.io) is a free wildcard DNS service:
`172.209.216.102.sslip.io` resolves to `172.209.216.102`, so the demo gets a
**trusted padlock at no cost and with no domain purchase**. The nginx config
redirects anyone who types the bare IP to this URL automatically, so either
address works for end users.

> When UMU IT provides the real domain (e.g. `attendance.umu.ac.ug`), see
> §9 "Migrating to a real domain".

---

## 2. Architecture on the VM

```
Internet ──▶ Azure NSG (:80, :443)
                │
             nginx (container, ports 80/443)
             ├── static PWA  ← client/dist bind mount
             ├── /.well-known/acme-challenge/ ← devops/certbot bind mount
             └── /api/* ──▶ app:4000 (Node/Express container)
                               ├── Prisma ──▶ mysql:8 (db_data volume)
                               └── rate-limit ──▶ redis:7 (redis_data volume)
```

Nothing except nginx is exposed publicly; MySQL and Redis are internal-only.

---

## 3. Prerequisites

### 3.1 Azure — open the firewall

VM ▸ **Networking settings** ▸ Create inbound port rule:

| Port | Source | Priority | Name |
|---|---|---|---|
| 80 | Any | 310 | HTTP |
| 443 | Any | 320 | HTTPS |

(22/SSH should already exist. Do **not** expose 3306 or 6379.)

### 3.2 Google OAuth — register this host

In [Google Cloud Console](https://console.cloud.google.com) ▸ APIs & Services ▸
Credentials ▸ your OAuth client:

* **Authorised redirect URI (add):**
  `https://172.209.216.102.sslip.io/api/auth/google/callback`

Local logins with email + password work without OAuth; the admin account is
seeded that way (§7), so this can also be done after go-live.

### 3.3 Your laptop — push pending work

The server clones from GitHub, so commit and push everything first:

```bash
git status                  # must be clean
git push origin main        # from your machine
```

---

## 4. Server setup (fresh VM)

```bash
ssh azureuser@172.209.216.102

# 4.1 System update
sudo apt update && sudo apt upgrade -y

# 4.2 Docker Engine + Compose plugin
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
sudo usermod -aG docker $USER && newgrp docker

# 4.3 Clone
sudo mkdir -p /var/www/umu-attendance && sudo chown $USER:$USER /var/www/umu-attendance
git clone https://github.com/edkaydev/umu-attendance-system.git /var/www/umu-attendance
cd /var/www/umu-attendance
```

---

## 5. Secrets — create the two env files

```bash
cp .env.example .env                 # root: compose DB credentials
cp server/.env.example server/.env   # app configuration
```

Generate strong values:

```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -base64 18   # DB password (URL-encode special chars!)
```

Edit `server/.env`:

```ini
NODE_ENV=production
PORT=4000
CLIENT_URL=https://172.209.216.102.sslip.io

DATABASE_URL=mysql://umu_user:<DB-PASSWORD>@db:3306/umu_attendance

GOOGLE_CLIENT_ID=<from console.cloud.google.com>
GOOGLE_CLIENT_SECRET=<from console.cloud.google.com>
GOOGLE_CALLBACK_URL=https://172.209.216.102.sslip.io/api/auth/google/callback

JWT_ACCESS_SECRET=<64-hex>
JWT_REFRESH_SECRET=<different-64-hex>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=attendance@umu.ac.ug
SMTP_PASS=<google-app-password>
ALERT_FROM_EMAIL=attendance@umu.ac.ug
ALERT_FROM_NAME=UMU Attendance System

CAMPUS_LAT=0.00389
CAMPUS_LNG=32.01353
CAMPUS_RADIUS_METERS=500

SEED_ADMIN_EMAIL=edward@umu.ac.ug
SEED_ADMIN_PASSWORD=<strong-password>
SEED_ADMIN_NAME=System Administrator
```

Edit root `.env` — password **must match** `DATABASE_URL` above:

```ini
MYSQL_ROOT_PASSWORD=<another-strong-password>
MYSQL_PASSWORD=<same-as-DATABASE_URL-password>
```

Lock permissions down:

```bash
chmod 600 server/.env .env
```

---

## 6. Deploy (one command)

```bash
cd /var/www/umu-attendance
sudo CERTBOT_EMAIL=edward@umu.ac.ug bash devops/scripts/demo-deploy.sh
```

What it does, in order: pulls code → builds the PWA → issues the Let's Encrypt
certificate (standalone on first run) → starts all containers → waits for the
health check → switches renewal to zero-downtime webroot mode → applies
Prisma migrations → seeds the first System Admin → smoke-tests
`https://…/api/health`.

Re-running the same command later performs a full **update** (it skips cert
issuance and admin seeding).

---

## 7. First login

1. Open **https://172.209.216.102.sslip.io**
2. Log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
3. Set the academic period: **Settings → Current Period** (required before
   any other setup)
4. Import demo data if desired — ready-made CSVs live in
   [`docs/demo-data/`](demo-data/) (follow its README for import order)

---

## 8. Operations

### Daily driver

```bash
cd /var/www/umu-attendance
docker compose ps                     # all four containers Up/healthy?
docker compose logs -f app            # tail API logs
docker compose restart app            # bounce API only
sudo bash devops/scripts/demo-deploy.sh   # ship new code
```

### Certificate renewal (automatic)

A systemd timer renews twice daily; the lineage is already in webroot mode,
so renewals do **not** stop nginx. Verify any time:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot   # next renewal window
```

### Nightly database backups

```bash
sudo crontab -e
# add (02:00 nightly, keeps last 30):
0 2 * * * cd /var/www/umu-attendance && MYSQL_PASSWORD='<DB-PASSWORD>' bash devops/scripts/backup-db.sh >> /var/log/umu-backup.log 2>&1
```

Restore drill (do once so you trust it):

```bash
docker compose exec -T db mysql -u umu_user -p'<DB-PASSWORD>' umu_attendance < /var/backups/umu-attendance/backup_<date>.sql
```

### Swap file (recommended on 2-vCPU burstable VMs)

Prevents Puppeteer PDF renders from ever OOM-killing containers:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 9. Migrating to a real domain later

1. Add DNS A record `attendance.umu.ac.ug → 172.209.216.102`
2. `sed -i 's/172\.209\.216\.102\.sslip\.io/attendance.umu.ac.ug/g' devops/nginx/umu-attendance.conf`
3. Update `server/.env`: `CLIENT_URL` + `GOOGLE_CALLBACK_URL`; update the
   OAuth redirect URI in Google Console
4. Issue the new cert: `sudo certbot certonly --webroot -w devops/certbot -d attendance.umu.ac.ug ...`
5. `sudo bash devops/scripts/demo-deploy.sh`

Old `.sslip.io` bookmarks keep working until the cert is replaced — plan the
cutover in a maintenance window.

---

## 10. Troubleshooting

| Symptom | Diagnosis / fix |
|---|---|
| Site unreachable, SSH works | NSG rules missing — re-check §3.1 |
| nginx restart loop: *cannot load certificate* | Cert absent — delete `/etc/letsencrypt/renewal/…` state if half-created, then re-run deploy script (standalone path needs port 80 free: `docker compose stop nginx`) |
| `certbot` fails *connection refused* on challenge | Port 80 closed upstream (NSG) or something else bound it: `sudo ss -ltnp 'sport = :80'` |
| App container unhealthy | `docker compose logs app --tail=100` — usually bad `DATABASE_URL` vs `MYSQL_PASSWORD` mismatch |
| Login works but API calls 401-loop | `CLIENT_URL` in `server/.env` doesn't match browsing origin; fix and `docker compose up -d app` |
| 502 after deploy | Container still starting or crashed — `docker compose ps`, then logs |
| PDF download hangs | Chromium cold start; check memory (`free -h`) — add swap per §8 |
| PWA shows old version | Hard-refresh once; SW picks up new build (index.html/sw.js are no-cache) |

---

## 11. Teardown (end of demo)

```bash
cd /var/www/umu-attendance
docker compose down          # containers stop; volumes kept
docker compose down -v       # ⚠️ also deletes database + redis data
```

Release the VM/disks in the Azure portal when done to stop billing.
