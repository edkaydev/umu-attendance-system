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
