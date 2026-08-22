#!/usr/bin/env bash
# demo-deploy.sh — one-shot production-grade deployment to the demo server.
#
# Target: Azure Ubuntu VM 172.209.216.102 (South Africa North)
# Public URL: https://172.209.216.102.sslip.io   (bare IP http → redirects here)
#
# Idempotent: safe to re-run for updates. Skips steps that are already done.
#
# Prerequisites (see docs/11-demo-deployment.md):
#   - Docker + docker compose plugin installed
#   - certbot installed
#   - server/.env and .env created from the *.example files
#   - ports 80/443 open in the Azure NSG
#
# Usage:  sudo bash devops/scripts/demo-deploy.sh

set -euo pipefail

APP_DIR="/var/www/umu-attendance"
DOMAIN="172.209.216.102.sslip.io"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-edward@umu.ac.ug}"

cd "$APP_DIR"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Run with sudo (certbot + docker need root)."; exit 1; }
[[ -f server/.env ]] || { echo "server/.env missing — see docs/11-demo-deployment.md step 4."; exit 1; }
[[ -f .env ]]        || cp .env.example .env

say "Pulling latest code"
git pull --ff-only origin main

say "Building React PWA"
(cd client && npm ci --silent && npm run build)

say "TLS certificate"
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
    # Fresh server: nginx is not up yet, so use standalone (binds :80 itself).
    certbot certonly \
        --standalone \
        -d "$DOMAIN" \
        --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email \
        --non-interactive
else
    echo "Certificate for $DOMAIN already exists — skipping issuance."
fi

say "Starting containers"
docker compose up -d --build

say "Waiting for app health check"
for i in $(seq 1 30); do
    if docker compose exec -T app node -e \
        "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
        >/dev/null 2>&1; then
        echo "App is healthy."
        break
    fi
    [[ $i -eq 30 ]] && { echo "App failed to become healthy:"; docker compose logs --tail=50 app; exit 1; }
    sleep 3
done

# Once nginx answers :80, re-register the lineage as webroot so automated
# renewals (systemd timer) are zero-downtime — no nginx stop/start needed.
certbot certonly \
    --webroot -w "$APP_DIR/devops/certbot" \
    -d "$DOMAIN" \
    --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email \
    --non-interactive \
    --deploy-hook "docker compose -f $APP_DIR/docker-compose.yml restart nginx" \
    >/dev/null && echo "Renewal mode: webroot (zero-downtime)."

say "Running database migrations"
docker compose exec -T app npx prisma migrate deploy

if [[ ! -f .admin-seeded ]]; then
    say "Seeding first System Admin"
    docker compose exec -T app npm run seed:admin && touch .admin-seeded
fi

say "Verifying HTTPS endpoint"
curl -fsS "https://$DOMAIN/api/health" >/dev/null && echo "https://$DOMAIN is UP."

cat <<EOF

──────────────────────────────────────────────────────────────
 Demo deployed.
   URL:      https://$DOMAIN
   Bare IP:  http://172.209.216.102  → redirects to the URL above
   Logs:     docker compose logs -f app
   Update:   sudo bash devops/scripts/demo-deploy.sh
──────────────────────────────────────────────────────────────
EOF
