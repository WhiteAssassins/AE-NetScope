# AE NetScope

[![CI](https://github.com/WhiteAssassins/AE-NetScope/actions/workflows/ci.yml/badge.svg)](https://github.com/WhiteAssassins/AE-NetScope/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-early%20public%20preview-yellow)

AE NetScope is a self-hosted web app for organizing LAN inventory data such as devices, IP addresses, MAC addresses, subnets, VLANs, services, hardware details, and technical notes.

English is the primary, default, and fallback interface language. Spanish is bundled and can be selected per user from **Settings > Language**.

## Live Demo

Explore AE NetScope without installing it at **[netscope-demo.aewhitedevs.com](https://netscope-demo.aewhitedevs.com/)**.

The public demo uses fictional, non-sensitive inventory data and is intended only for evaluating the current early preview. Do not enter real credentials or sensitive network information.

## Early Public Preview

AE NetScope is in early public preview and is not production ready yet.

Do not use it with sensitive production network data at this stage. APIs, database schema, permission boundaries, security controls, and deployment guidance may change before v1.0.

Current alpha release notes are available in `RELEASE_NOTES_v0.2.0-alpha.1.md`. See `CHANGELOG.md` for release history.

## Current Status

- Web dashboard foundation.
- FastAPI backend foundation.
- Session-based login.
- Argon2id password hashing.
- HttpOnly session cookie.
- CSRF protection for authenticated writes.
- Mandatory first-password change for the generated local admin.
- Initial roles and permissions: `admin`, `operator`, `viewer`.
- Initial Alembic migration for auth, sessions, and audit events.
- Core inventory schema for VLANs, networks, devices, interfaces, IP addresses, and services.
- Dashboard data loaded from the API instead of static frontend mocks.
- Device list, device detail, edit, interface creation, and deactivate flow.
- IP and MAC table with search, state filters, manual IP registration, assignment to interfaces, and duplicate protection.
- IP deletion, subnet management, VLAN association, gateway validation, and subnet utilization metrics.
- VLAN management with utilization summaries, duplicate protection, editing, and deletion.
- Deletion flows for devices and subnets with reference cleanup for related IP records.
- Service management with device association, ports, protocols, status filters, editing, and deletion.
- Internationalization foundation with English as the primary, default, and fallback language.
- Bundled Spanish translation, manual language selection, and per-user language persistence.
- System status diagnostics with dependency latency, total check duration, degraded-state visibility, and optional 30-second auto-refresh.
- Passive inventory-quality checks for incomplete records, duplicate device identifiers, overlapping subnets, unclassified IPs, and missing relationships.
- Inventory-quality scoring with direct navigation from each finding to the affected record.
- Floating GitHub repository link with a backend-cached star count.

## Languages

English is AE NetScope's canonical interface language, default language, and runtime fallback. Spanish is included and can be selected manually from **Settings > Language**.

The selected language is stored in the authenticated user account so it follows the user across browsers and devices. A browser-local copy is also kept for unauthenticated screens and temporary fallback behavior. Existing accounts receive English as their initial preference when the language migration is applied and can switch to Spanish at any time.

The current internationalization milestone covers initial setup, login, navigation, topbar menus, global search, footer, loading states, Settings, and System status. The remaining inventory and administration views are being migrated progressively; untranslated interface text falls back to English once it is moved into the translation system.

Community translations live in `web/src/i18n/locales/`. Adding a locale requires one JSON file based on `en.json`; files are discovered automatically. Translation checks reject missing or extra keys, empty values, mismatched interpolation variables, malformed UTF-8, common mojibake, control characters, and suspicious invisible characters. See `CONTRIBUTING.md` for the contribution steps.

## Versioning

The public project version is stored in the root `VERSION` file and mirrored in the GitHub release tag.

The API exposes the installed version at:

```text
/api/version
```

The web UI shows the installed version in the footer and in **Updates**, where administrators can compare the installed version with the latest GitHub release.

## Local Development

From the project root, run:

```bat
start-dev.cmd
```

Then open:

```text
http://127.0.0.1:5173
```

API health check:

```text
http://127.0.0.1:8000/api/health
```

The first local admin account is generated automatically when `start-dev.cmd` prepares the API database. The credentials are written to:

```text
api/.local-admin.txt
```

That file is local only and must not be committed.

Local development also seeds fictional inventory data so the dashboard has safe sample content.

## Local Checks

```bat
test.cmd
```

Coverage reports:

```bat
npm run test:coverage
```

Translation validation:

```bat
npm --prefix web run test:i18n
```

The API coverage XML is generated at `api/coverage.xml`. The web coverage report is generated under `web/coverage/`.

GitHub Actions runs the same main checks on push and pull requests. The workflow summary includes a simple test and coverage report, and the full coverage artifacts are attached to the workflow run.

## Pre-Release Hardening Checks

Before publishing a release, run:

```bat
test.cmd
```

This checks for obvious hardcoded secrets, forbidden tracked local files, dependency advisories, API lint, API tests, web lint, web tests, and web build.

You can also run the hardening checks individually:

```bat
npm run secrets:scan
npm run tracked:check
npm run deps:audit
```

## Stack

- React
- TypeScript
- Vite
- i18next and react-i18next
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL for production data
- Redis for cache, queues, and future background jobs
- Argon2id password hashing
- Docker/OCI image path for production-style deployments

## Configuration

Development can use `.env` copied from `.env.example`.

Production should use system environment variables or a systemd `EnvironmentFile`, not a committed `.env` file.

Important variables:

```text
APP_ENV=production
APP_NAME="AE NetScope"
DEPLOYMENT_PLATFORM=docker
APP_URL=https://netscope.example.com
APP_WEB_DIST_DIR=/app/web
API_CORS_ORIGINS=https://netscope.example.com
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=ae_netscope
POSTGRES_USER=ae_netscope
POSTGRES_PASSWORD=CHANGE_ME_DATABASE_PASSWORD
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD
MAX_IMPORT_JSON_BYTES=2000000
MAX_REQUEST_BODY_BYTES=1000000
SESSION_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
DATA_ENCRYPTION_KEY=CHANGE_ME_INDEPENDENT_DATA_KEY
DATA_DECRYPTION_FALLBACK_KEYS=
MFA_ENCRYPTION_KEY=CHANGE_ME_INDEPENDENT_MFA_KEY
MFA_DECRYPTION_FALLBACK_KEYS=
INITIAL_SETUP_TOKEN=CHANGE_ME_ONE_TIME_INSTALLATION_TOKEN
SESSION_COOKIE_NAME=ae_netscope_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict
SESSION_TTL_SECONDS=28800
SESSION_IDLE_TIMEOUT_SECONDS=1800
SESSION_TOUCH_INTERVAL_SECONDS=60
SECURITY_HEADERS_ENABLED=true
SECURITY_HSTS_ENABLED=true
SECURITY_HSTS_MAX_AGE=31536000
AE_NETSCOPE_RUN_MIGRATIONS=true
AE_NETSCOPE_MIGRATION_ATTEMPTS=30
AE_NETSCOPE_MIGRATION_RETRY_SECONDS=2
AE_NETSCOPE_PRE_MIGRATION_BACKUP=true
AE_NETSCOPE_MIGRATION_BACKUP_DIR=/app/backups
AE_NETSCOPE_MIGRATION_BACKUP_RETENTION_COUNT=10
INVENTORY_BACKUP_DIR=/app/backups
INVENTORY_BACKUP_RETENTION_COUNT=10
BACKUP_ENCRYPTION_KEY=CHANGE_ME_INDEPENDENT_BACKUP_KEY
BACKUP_DECRYPTION_FALLBACK_KEYS=
AE_NETSCOPE_AUTO_UPDATE_ENABLED=false
AE_NETSCOPE_AUTO_UPDATE_COMMAND=
AUTH_RATE_LIMIT_PER_MINUTE=5
REDIS_RATE_LIMIT_FAIL_OPEN=false
AUTH_LOCKOUT_MINUTES=15
SESSION_RECORD_RETENTION_DAYS=30
AUDIT_RETENTION_DAYS=365
```

For the production web build, set:

```text
VITE_API_BASE_URL=/api
```

## Docker Installation

These Docker instructions are the supported alpha container installation path for local testing and TrueNAS packaging validation.

AE NetScope includes an early production-style container path. The public image serves the built Vite web app and FastAPI API from one HTTP port, starts with PostgreSQL and Redis, and runs Alembic migrations on startup.

This path is intended for local validation, public alpha testing, and future TrueNAS packaging work. It is still alpha software.

Use `compose.yaml` for local HTTP container testing. Running the image directly with `docker run` uses the image defaults and requires explicit environment variables for the target deployment. For real HTTPS production, set `APP_ENV=production`, `APP_URL=https://...`, `SESSION_COOKIE_SECURE=true`, and `SECURITY_HSTS_ENABLED=true`.

Passkeys are available when the deployment defines `WEBAUTHN_RP_ID` as the public hostname and `WEBAUTHN_ORIGIN` as the exact public origin, for example `netscope.example.com` and `https://netscope.example.com`. Production passkeys require HTTPS. TOTP remains available without these WebAuthn variables.

Keep `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`, and `BACKUP_ENCRYPTION_KEY` stable across upgrades and container replacements. Changing `SESSION_SECRET` invalidates active sessions. Changing an encryption key without its previous value in the corresponding `*_DECRYPTION_FALLBACK_KEYS` variable can make protected data unreadable. Keep old fallback keys only until startup has migrated existing values to the new primary key, then remove them.

When dedicated data or backup keys are omitted, AE NetScope derives domain-separated keys from the MFA key or session secret for compatibility. Dedicated independent keys are strongly recommended for managed installations. Generate each secret separately with a password manager or `openssl rand -base64 48`; never reuse the examples from this README.

Before a pending startup migration runs, the container creates an AES-256-GCM encrypted PostgreSQL custom-format backup in `/app/backups` when `AE_NETSCOPE_PRE_MIGRATION_BACKUP=true`. It skips the backup when the schema is already current, creates files with mode `0600`, removes the plaintext dump after encryption, and retains the newest 10 by default. The default Compose file mounts that directory as the persistent `ae_netscope_backups` volume.

Public image:

```text
ghcr.io/whiteassassins/ae-netscope:v0.2.0-alpha.1
```

From the project root:

```bat
set POSTGRES_PASSWORD=replace-with-local-postgres-password
set REDIS_PASSWORD=replace-with-local-redis-password
set SESSION_SECRET=replace-with-at-least-32-random-bytes
set DATA_ENCRYPTION_KEY=replace-with-independent-data-key
set BACKUP_ENCRYPTION_KEY=replace-with-independent-backup-key
set INITIAL_SETUP_TOKEN=replace-with-one-time-installation-token
docker compose pull
docker compose up -d
```

Then open:

```text
http://127.0.0.1:8080
```

On a fresh Docker installation, enter `INITIAL_SETUP_TOKEN` in the setup screen before creating the first administrator. Existing installations are marked as already configured by the migration and do not repeat setup. Managed installations that already provide a strong random `SESSION_SECRET` may use that value as the setup token when no dedicated installation token is available.

Safe update path:

```bat
docker compose pull
docker compose up -d
```

Do not use `docker compose down -v` unless you intentionally want to delete PostgreSQL, Redis, and migration-backup volumes.

The admin update page checks GitHub releases from the app itself and shows both the latest stable release and the latest prerelease. Alpha installs follow the prerelease channel; stable installs follow stable releases.

Automatic updates from the AE NetScope admin UI are disabled by default. For plain Docker or Docker Compose installs, they are only available when `DEPLOYMENT_PLATFORM=docker`, `AE_NETSCOPE_AUTO_UPDATE_ENABLED=true`, and `AE_NETSCOPE_AUTO_UPDATE_COMMAND` is configured by the server administrator. The command can include `{tag}`, which is replaced with the selected release tag. TrueNAS installs always keep this disabled and must be updated from the TrueNAS Apps interface.

Health checks:

```text
http://127.0.0.1:8080/api/health/live
http://127.0.0.1:8080/api/health/ready
```

`/api/health/live` and `/api/health/ready` are intentionally minimal and public. Detailed database and Redis diagnostics under `/api/health/status` require an authenticated user.

### Docker Smoke Checklist

Before publishing a container release, verify the public image with:

```bat
docker compose -p ae-netscope-smoke down
docker compose -p ae-netscope-smoke pull
docker compose -p ae-netscope-smoke up -d
```

Then check:

- `http://127.0.0.1:8080/api/health/live` returns `ok`.
- `http://127.0.0.1:8080/api/health/status` shows API, database, and Redis.
- First setup or login works.
- Browser refresh keeps the session.
- JSON export and at least one CSV export download correctly.
- `docker compose -p ae-netscope-smoke restart ae-netscope` keeps PostgreSQL data.
- `docker compose -p ae-netscope-smoke down` stops the stack without deleting volumes.

Do not run `docker compose -p ae-netscope-smoke down -v` unless the smoke data should be deleted.

### TrueNAS Smoke Checklist

Before updating the TrueNAS catalog app, verify:

- The app renders from `basic-values.yaml`.
- A basic install reaches the web UI.
- `/api/health/status` reports API, PostgreSQL, and Redis.
- Login/setup works and survives browser refresh.
- Restarting the app keeps inventory data.
- The update page says TrueNAS updates must use the TrueNAS Apps interface.
- The migration backup directory is writable, or the temporary fallback is reported in the app log.

Stop the stack:

```bat
docker compose down
```

The local compose file starts AE NetScope, PostgreSQL, and Redis. Do not use the default compose passwords for any exposed or production deployment.

The PostgreSQL volume is mounted at `/var/lib/postgresql` to match the PostgreSQL 18 container layout.

To stop the stack and keep data volumes:

```bat
docker compose down
```

To remove the stack and local data volumes:

```bat
docker compose down -v
```

### Local Image Build

The default `compose.yaml` uses the published GHCR image and does not build locally. To build from source, use the build override:

```bat
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

The image creates a non-root `ae-netscope` user. Build args `AE_NETSCOPE_UID` and `AE_NETSCOPE_GID` default to `568` for future TrueNAS compatibility.

To build the image manually:

```bat
docker build -t ghcr.io/whiteassassins/ae-netscope:v0.2.0-alpha.1 .
```

Container images are published to GitHub Container Registry when a GitHub Release is published.

Pre-releases also update the `alpha` tag. The `latest` tag is reserved for stable non-prerelease releases.

## Production Install on Debian 13

These steps assume:

- Debian 13 server.
- Domain: `netscope.example.com`.
- App user: `ae-netscope`.
- App path: `/opt/ae-netscope`.
- Nginx serves the web build.
- FastAPI listens on `127.0.0.1:8000`.
- PostgreSQL and Redis run on the same server.

Replace the domain, passwords, and repository URL with your own values.

### 1. Update the server

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

Reconnect after reboot.

### 2. Install system packages

```bash
sudo apt update
sudo apt install -y \
  git curl ca-certificates build-essential \
  python3 python3-venv python3-pip \
  postgresql postgresql-contrib \
  redis-server nginx
```

### 3. Install Node.js 24.15 or newer

The web toolchain requires Node.js `24.15.0` or newer on the 24 line, or `26.0.0`
or newer. The command below installs the current 24.x release, which satisfies
this. If you already have an older Node 24 installed, upgrade it before
continuing.

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

### 4. Create the system user

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin ae-netscope
```

### 5. Clone the project

```bash
sudo mkdir -p /opt/ae-netscope
sudo chown ae-netscope:ae-netscope /opt/ae-netscope
sudo -u ae-netscope git clone https://github.com/YOUR_USER/YOUR_REPO.git /opt/ae-netscope
```

### 6. Create PostgreSQL database and user

Generate a strong database password first:

```bash
openssl rand -base64 36
```

Create the database and user:

```bash
sudo -u postgres psql
```

Inside `psql`:

```sql
CREATE USER ae_netscope WITH PASSWORD 'CHANGE_ME_DATABASE_PASSWORD';
CREATE DATABASE ae_netscope OWNER ae_netscope;
\q
```

### 7. Create global environment file

```bash
sudo mkdir -p /etc/ae-netscope
sudo nano /etc/ae-netscope/ae-netscope.env
```

Example:

```text
APP_ENV=production
APP_NAME="AE NetScope"
APP_URL=https://netscope.example.com
API_CORS_ORIGINS=https://netscope.example.com
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=ae_netscope
POSTGRES_USER=ae_netscope
POSTGRES_PASSWORD=CHANGE_ME_DATABASE_PASSWORD
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD
MAX_IMPORT_JSON_BYTES=2000000
MAX_REQUEST_BODY_BYTES=1000000
SESSION_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
DATA_ENCRYPTION_KEY=CHANGE_ME_INDEPENDENT_DATA_KEY
DATA_DECRYPTION_FALLBACK_KEYS=
MFA_ENCRYPTION_KEY=CHANGE_ME_INDEPENDENT_MFA_KEY
MFA_DECRYPTION_FALLBACK_KEYS=
INITIAL_SETUP_TOKEN=CHANGE_ME_ONE_TIME_INSTALLATION_TOKEN
SESSION_COOKIE_NAME=ae_netscope_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict
SESSION_TTL_SECONDS=28800
SESSION_IDLE_TIMEOUT_SECONDS=1800
SESSION_TOUCH_INTERVAL_SECONDS=60
SECURITY_HEADERS_ENABLED=true
SECURITY_HSTS_ENABLED=true
SECURITY_HSTS_MAX_AGE=31536000
AUTH_RATE_LIMIT_PER_MINUTE=5
REDIS_RATE_LIMIT_FAIL_OPEN=false
AUTH_LOCKOUT_MINUTES=15
SESSION_RECORD_RETENTION_DAYS=30
AUDIT_RETENTION_DAYS=365
BACKUP_ENCRYPTION_KEY=CHANGE_ME_INDEPENDENT_BACKUP_KEY
BACKUP_DECRYPTION_FALLBACK_KEYS=
```

Secure the file:

```bash
sudo chown root:ae-netscope /etc/ae-netscope/ae-netscope.env
sudo chmod 640 /etc/ae-netscope/ae-netscope.env
```

### 8. Install API dependencies

```bash
cd /opt/ae-netscope
sudo -u ae-netscope python3 -m venv api/.venv
sudo -u ae-netscope api/.venv/bin/python -m pip install --upgrade pip
sudo -u ae-netscope api/.venv/bin/python -m pip install -e "api[worker]"
```

### 9. Run database migrations

```bash
cd /opt/ae-netscope/api
sudo -u ae-netscope bash -lc 'set -a; source /etc/ae-netscope/ae-netscope.env; set +a; .venv/bin/python -m alembic upgrade head'
```

For every upgrade, run migrations before starting the API again. The migration chain is tested in CI and should have a single Alembic head.

### 10. Create the initial admin

For the current early version, the bootstrap command creates the first admin if there are no users:

```bash
cd /opt/ae-netscope/api
sudo -u ae-netscope bash -lc 'set -a; source /etc/ae-netscope/ae-netscope.env; set +a; .venv/bin/python -m app.cli'
```

The generated credentials are written to:

```text
/opt/ae-netscope/api/.local-admin.txt
```

Use them once, then change the password immediately in the web UI. Remove the file after storing the credentials safely:

```bash
sudo shred -u /opt/ae-netscope/api/.local-admin.txt
```

### 11. Build the web app

```bash
cd /opt/ae-netscope
sudo -u ae-netscope npm --prefix web ci
sudo -u ae-netscope env VITE_API_BASE_URL=/api npm --prefix web run build
```

## Backup and Restore Policy

- Export a JSON backup before every upgrade, restore, or migration.
- Docker and TrueNAS installs create an authenticated encrypted PostgreSQL backup automatically before startup migrations when `AE_NETSCOPE_PRE_MIGRATION_BACKUP=true`.
- Docker migration backups are stored in `/app/backups`, backed by the `ae_netscope_backups` Compose volume by default.
- Migration backups are created only when the schema is behind, are encrypted with AES-256-GCM, use mode `0600`, and retain the newest 10 files by default. Change retention with `AE_NETSCOPE_MIGRATION_BACKUP_RETENTION_COUNT`.
- The restore UI validates the JSON first and shows a preview before replacing data.
- A restore replaces inventory records only: devices, interfaces, IPs, subnets, VLANs, and services.
- A restore does not modify users, sessions, password hashes, secrets, or environment variables.
- Before a restore is applied, the API persists an encrypted pre-restore JSON backup in `/app/backups` and the web UI also downloads a plaintext copy directly to the authenticated administrator.
- Restore backups use mode `0600` where supported and retain the newest 10 files by default. Change this with `INVENTORY_BACKUP_RETENTION_COUNT`.
- Keep production backups outside the repository and outside the web root.
- Keep encryption keys outside backup volumes. A backup and its key stored together provide no theft protection.
- Application encryption does not replace host or dataset encryption. Use full-disk encryption or an encrypted TrueNAS dataset for PostgreSQL, Redis, and backup volumes.

PostgreSQL migration backups are encrypted custom-format `pg_dump` files. Decrypt one inside the application container before using `pg_restore`:

```bash
python -m app.backup_cli decrypt /app/backups/ae-netscope-pre-migration-TIMESTAMP.dump.enc --output /tmp/ae-netscope.dump
```

The command authenticates the backup before exposing plaintext and refuses to overwrite an existing output file. Copy the decrypted dump to the recovery host, restore it with `pg_restore`, then securely remove the temporary plaintext.

## SQLite Local to PostgreSQL Production

SQLite is for local development only. PostgreSQL is the production target.

Recommended path:

1. Upgrade the local app to the latest code and run `test.cmd`.
2. Export inventory JSON from the local app.
3. Prepare PostgreSQL and run `alembic upgrade head` in production.
4. Create the first production admin.
5. Import the JSON backup from the production web UI.
6. Confirm `/api/health/status` shows API, database, and Redis checks.

Do not copy the local SQLite database file directly into production.

### 12. Create the systemd service

```bash
sudo nano /etc/systemd/system/ae-netscope-api.service
```

Service file:

```ini
[Unit]
Description=AE NetScope API
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=ae-netscope
Group=ae-netscope
WorkingDirectory=/opt/ae-netscope/api
EnvironmentFile=/etc/ae-netscope/ae-netscope.env
ExecStart=/opt/ae-netscope/api/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2 --no-server-header
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/ae-netscope/api

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ae-netscope-api
sudo systemctl status ae-netscope-api
```

### 13. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/ae-netscope
```

Nginx config:

```nginx
server {
    listen 80;
    server_name netscope.example.com;

    root /opt/ae-netscope/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/ae-netscope /etc/nginx/sites-enabled/ae-netscope
sudo nginx -t
sudo systemctl reload nginx
```

### 14. Add HTTPS

Install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Request a certificate:

```bash
sudo certbot --nginx -d netscope.example.com
```

After HTTPS is active, confirm these production variables remain set:

```text
APP_URL=https://netscope.example.com
API_CORS_ORIGINS=https://netscope.example.com
SESSION_COOKIE_SECURE=true
SECURITY_HSTS_ENABLED=true
```

Restart:

```bash
sudo systemctl restart ae-netscope-api
sudo systemctl reload nginx
```

### 15. Verify production

```bash
curl -I https://netscope.example.com
curl https://netscope.example.com/api/health/live
curl https://netscope.example.com/api/health/status
sudo journalctl -u ae-netscope-api -n 100 --no-pager
```

Open:

```text
https://netscope.example.com
```

Login with the generated admin and change the password when prompted.

## Updating Production

```bash
cd /opt/ae-netscope
sudo -u ae-netscope git pull
sudo -u ae-netscope api/.venv/bin/python -m pip install -e "api[worker]"
cd /opt/ae-netscope/api
sudo -u ae-netscope bash -lc 'set -a; source /etc/ae-netscope/ae-netscope.env; set +a; .venv/bin/python -m alembic upgrade head'
cd /opt/ae-netscope
sudo -u ae-netscope npm --prefix web ci
sudo -u ae-netscope env VITE_API_BASE_URL=/api npm --prefix web run build
sudo systemctl restart ae-netscope-api
sudo systemctl reload nginx
```

## Security

See `SECURITY.md` for the authentication, session, and post-quantum readiness model.

AE NetScope encrypts sensitive device details, network locations and gateways, VLAN descriptions, session metadata, audit messages, audit IPs, and persisted backups with authenticated encryption. Passwords remain one-way Argon2id hashes and session tokens are stored only as keyed hashes. IP addresses, MAC addresses, CIDRs, account identifiers, and record names remain queryable database fields; protect the PostgreSQL/SQLite volume with host-level encryption if disclosure of the full network map is in scope.

Managed environments reject public placeholder secrets, insecure production cookies, missing Redis authentication, and fail-open Redis rate limiting at startup. API responses are non-cacheable, cross-site mutations are rejected, idle sessions expire, and changes to account identity or security settings revoke other sessions.

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` before opening issues or pull requests.

Do not post secrets, credentials, real network inventories, private IP plans, MAC address inventories, hostnames, screenshots of private infrastructure, or sensitive logs in public issues or pull requests.

For support boundaries, see `SUPPORT.md`.

## License

AE NetScope is free and open source software released under the MIT License.

Copyright is held by Christopher David Alberto Roque, also known as [WhiteAssassins](https://github.com/WhiteAssassins), CEO of AE White Devs LLC.

See `LICENSE` for the full terms.
