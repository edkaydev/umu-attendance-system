#!/bin/bash
# update.sh — triggered by the System Admin "Update System" button.
# Runs on the HOST machine (not inside the Docker container).
# Output is tee'd to a log file that the API reads back for live display.
#
# Usage: bash /var/www/umu-attendance/devops/scripts/update.sh

set -e

APP_DIR="/var/www/umu-attendance"
LOG_FILE="$APP_DIR/server/assets/update.log"

# Start fresh log
echo "[UPDATE STARTED] $(date '+%Y-%m-%d %H:%M:%S')" > "$LOG_FILE"

run() {
  echo "" >> "$LOG_FILE"
  echo ">>> $*" >> "$LOG_FILE"
  "$@" >> "$LOG_FILE" 2>&1
}

cd "$APP_DIR"

run git pull origin main

run bash -c "cd client && npm install && npm run build"

run docker compose up -d --build

# Give the new container a moment to start before running migrations
sleep 8

run docker compose exec -T app npx prisma migrate deploy

echo "" >> "$LOG_FILE"
echo "[UPDATE COMPLETE] $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
