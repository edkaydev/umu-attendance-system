# Campus Handoff Checklist — Bring-Up Credentials

This box is pre-deployed and ready. To go fully live at campus you need to
obtain the credentials below from UMU ICT, then drop them into
`server/.env` (and Google Cloud Console) and run the commands noted.

## 1. Google OAuth (required to log in at all)

Create (or have ICT create) a **Google Cloud OAuth 2.0 Client** in the
`umu.ac.ug` Google Workspace. Use the `attendance@umu.ac.ug` account as owner.

| Variable | What to put |
|---|---|
| `GOOGLE_CLIENT_ID` | `xxxxxxxx.apps.googleusercontent.com` from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | The client secret from Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://attendance.umu.ac.ug/api/auth/google/callback` |

In Google Cloud Console:
- **Authorized redirect URI** must exactly match the callback URL above.
- **Add test users**: `attendance@umu.ac.ug` (sys admin) + any test accounts.
  (For production; set the app to "In production" once approved.)

## 2. Email SMTP (alerts / notifications)

Use the `attendance@umu.ac.ug` Gmail account. Generate a **Google App Password**:
Google Account → Security → 2-Step Verification → App passwords → generate one
for "Mail".

| Variable | What to put |
|---|---|
| `SMTP_USER` | `attendance@umu.ac.ug` |
| `SMTP_PASS` | The 16-char app password (letters, no spaces) |
| `ALERT_FROM_EMAIL` | `attendance@umu.ac.ug` |

## 3. System Admin account

Seed the sys admin as `attendance@umu.ac.ug` so it matches the Google account:

```bash
sudo docker compose exec app npm run seed:admin
```

(Set `SEED_ADMIN_EMAIL=attendance@umu.ac.ug` in `server/.env` first.)

## 4. Moodle sync token (from the LIVE Moodle server)

The token must come from the **live** Moodle at `https://elearning.umu.ac.ug`,
maintained by ICT. Ask them to run:

```bash
sudo -u www-data php /var/www/moodle/admin/cli/setup-webservice.php
```

using the script `devops/scripts/moodle/setup-webservice.php`. It prints the
token. Put it (and the correct base URL) in `server/.env`:

| Variable | What to put |
|---|---|
| `MOODLE_BASE_URL` | `https://elearning.umu.ac.ug` (or wherever live Moodle is) |
| `MOODLE_WS_TOKEN` | The 64-char token printed by the script |
| `MOODLE_WS_SERVICE` | `umu_attendance_sync` (default) |

## 5. DNS

Point `attendance.umu.ac.ug` at this box's **public** IP (once ICT assigns one),
and ensure port 443 (and 80 for ACME) is reachable.

---

## After obtaining everything

1. Edit `server/.env` with the real values.
2. Re-issue a real Let's Encrypt cert:
   ```bash
   sudo certbot certonly --standalone -d attendance.umu.ac.ug
   ```
3. Point nginx at the new cert (update `devops/nginx/umu-attendance.conf`).
4. Rebuild + restart:
   ```bash
   sudo docker compose up -d --build
   ```
5. Verify:
   - `https://attendance.umu.ac.ug` loads
   - Log in via Google as `attendance@umu.ac.ug`
   - Sys Admin dashboard renders
   - Moodle Sync → Test Connection passes

## Everything else is already configured on the box

- `NODE_ENV=production`
- `CLIENT_URL=https://attendance.umu.ac.ug`
- Database (MySQL) + Redis — running, migrations applied, seeded
- JWT secrets — generated
- Geo-fencing (Nkozi coordinates)
- Docker Compose services — db, redis, app, nginx
