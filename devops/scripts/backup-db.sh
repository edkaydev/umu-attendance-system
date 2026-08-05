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
