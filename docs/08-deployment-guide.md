# 08 — Deployment Guide

## Target Environment
- **Server OS:** Ubuntu Server 22.04 LTS
- **Deployment:** Docker + Docker Compose
- **Domain:** e.g. `attendance.umu.ac.ug`
- **SSL:** Certbot (Let's Encrypt) or self-signed cert

---

## Services (Docker Compose)

| Service | Image | Port |
|---|---|---|
| `db` | mysql:8 | 3306 (internal only) |
| `app` | Custom Node.js build | 4000 (internal only) |
| `nginx` | nginx:alpine | 80, 443 (public) |

---

## Step 1 — Install Docker on Ubuntu Server

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg

# Add Docker's GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repo
echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow running docker without sudo
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

```bash
cp server/.env.example server/.env
nano server/.env
```

Fill in all values:

```bash
NODE_ENV=production
PORT=4000
CLIENT_URL=https://attendance.umu.ac.ug

DATABASE_URL=mysql://umu_user:StrongPassword123@db:3306/umu_attendance

GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://attendance.umu.ac.ug/api/auth/google/callback

JWT_ACCESS_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>

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

## Step 4 — Add UMU Badge

```bash
cp /path/to/umu-badge.png server/assets/umu-badge.png
```

---

## Step 5 — Build and Start

```bash
# Build React frontend
cd client && npm install && npm run build && cd ..

# Start all services
docker compose up -d --build

# Check all containers are running
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

This creates the first System Admin account using the email defined in `.env`.

---

## Step 8 — SSL with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate (replace with real domain)
sudo certbot --nginx -d attendance.umu.ac.ug

# Auto-renewal (runs twice daily)
sudo systemctl enable certbot.timer
```

---

## docker-compose.yml (overview)

```yaml
version: '3.9'

services:
  db:
    image: mysql:8
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: umu_attendance
      MYSQL_USER: umu_user
      MYSQL_PASSWORD: StrongPassword123
    volumes:
      - db_data:/var/lib/mysql

  app:
    build: .
    restart: always
    env_file: ./server/.env
    depends_on:
      - db
    volumes:
      - ./client/dist:/app/client/dist
      - ./server/assets:/app/assets

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

---

## Nginx Config (overview)

```nginx
server {
    listen 80;
    server_name attendance.umu.ac.ug;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name attendance.umu.ac.ug;

    ssl_certificate /etc/letsencrypt/live/attendance.umu.ac.ug/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/attendance.umu.ac.ug/privkey.pem;

    # Serve React PWA
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js
    location /api/ {
        proxy_pass http://app:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Deploy Script (`devops/scripts/deploy.sh`)

Run this every time you push an update:

```bash
#!/bin/bash
set -e
cd /var/www/umu-attendance

echo "Pulling latest code..."
git pull origin main

echo "Building frontend..."
cd client && npm install && npm run build && cd ..

echo "Restarting containers..."
docker compose up -d --build

echo "Running migrations..."
docker compose exec app npx prisma migrate deploy

echo "Done. Deployment complete."
```

Make executable:
```bash
chmod +x devops/scripts/deploy.sh
```

---

## Database Backup (`devops/scripts/backup-db.sh`)

```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR=/var/backups/umu-attendance

mkdir -p $BACKUP_DIR

docker compose exec db mysqldump \
  -u umu_user -pStrongPassword123 umu_attendance \
  > $BACKUP_DIR/backup_$DATE.sql

echo "Backup saved: $BACKUP_DIR/backup_$DATE.sql"

# Keep only last 30 backups
ls -t $BACKUP_DIR/*.sql | tail -n +31 | xargs -r rm
```

Schedule daily backup via cron:
```bash
crontab -e
# Add:
0 2 * * * /var/www/umu-attendance/devops/scripts/backup-db.sh
```

---

## Google OAuth Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project: "UMU Attendance System"
3. Enable the **Google+ API** and **Google OAuth2 API**
4. Create OAuth 2.0 credentials (Web Application type)
5. Add Authorized redirect URIs:
   ```
   https://attendance.umu.ac.ug/api/auth/google/callback
   ```
6. Copy Client ID and Client Secret into `server/.env`
7. In Google Workspace Admin, restrict OAuth to `@umu.ac.ug` and `@stud.umu.ac.ug` domains

---

## Monitoring

```bash
# View live logs
docker compose logs -f app

# View Nginx logs
docker compose logs -f nginx

# Check container status
docker compose ps

# Restart a single service
docker compose restart app
```

---

## Troubleshooting

| Problem | Check |
|---|---|
| App not starting | `docker compose logs app` |
| DB connection error | Verify `DATABASE_URL` in `.env`, ensure `db` container is healthy |
| Google login failing | Check `GOOGLE_CALLBACK_URL` matches exactly in Google Console |
| PDF not generating | Ensure Chromium installed in Docker image, check `UMU_BADGE_PATH` |
| Emails not sending | Verify `SMTP_PASS` is a Google App Password, not account password |
| 502 Bad Gateway | Node.js app crashed — check `docker compose logs app` |
