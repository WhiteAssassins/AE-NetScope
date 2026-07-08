# AE NetScope

[![CI](https://github.com/WhiteAssassins/AE-NetScope/actions/workflows/ci.yml/badge.svg)](https://github.com/WhiteAssassins/AE-NetScope/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-early%20public%20preview-yellow)

AE NetScope is a self-hosted web app for organizing LAN inventory data such as devices, IP addresses, MAC addresses, subnets, VLANs, services, hardware details, and technical notes.

## Early Public Preview

AE NetScope is in early public preview and is not production ready yet.

Do not use it with sensitive production network data at this stage. APIs, database schema, permission boundaries, security controls, and deployment guidance may change before v1.0.

Current alpha release notes are available in `RELEASE_NOTES_v0.1.6-alpha.1.md`. See `CHANGELOG.md` for release history.

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

## Versioning

The public project version is stored in the root `VERSION` file and mirrored in the GitHub release tag.

The API exposes the installed version at:

```text
/api/version
```

The web UI shows the installed version in the footer and in **Actualizaciones**, where administrators can compare the installed version with the latest GitHub release.

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
DATABASE_URL=postgresql+asyncpg://ae_netscope:CHANGE_ME@127.0.0.1:5432/ae_netscope
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD
MAX_IMPORT_JSON_BYTES=2000000
SESSION_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
SESSION_COOKIE_NAME=ae_netscope_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict
SESSION_TTL_SECONDS=28800
SECURITY_HEADERS_ENABLED=true
SECURITY_HSTS_ENABLED=true
SECURITY_HSTS_MAX_AGE=31536000
AE_NETSCOPE_RUN_MIGRATIONS=true
AE_NETSCOPE_MIGRATION_ATTEMPTS=30
AE_NETSCOPE_MIGRATION_RETRY_SECONDS=2
AE_NETSCOPE_PRE_MIGRATION_BACKUP=true
AE_NETSCOPE_MIGRATION_BACKUP_DIR=/app/backups
AE_NETSCOPE_AUTO_UPDATE_ENABLED=false
AE_NETSCOPE_AUTO_UPDATE_COMMAND=
PASSWORD_HASH_ALGORITHM=argon2id
AUTH_RATE_LIMIT_PER_MINUTE=5
AUTH_LOCKOUT_MINUTES=15
CRYPTO_POLICY_VERSION=1
PQC_READINESS_MODE=crypto-agile
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

Before startup migrations run, the container creates a PostgreSQL custom-format backup in `/app/backups` when `AE_NETSCOPE_PRE_MIGRATION_BACKUP=true`. The default Compose file mounts that directory as the persistent `ae_netscope_backups` volume.

Public image:

```text
ghcr.io/whiteassassins/ae-netscope:v0.1.6-alpha.1
```

From the project root:

```bat
set POSTGRES_PASSWORD=replace-with-local-postgres-password
set SESSION_SECRET=replace-with-at-least-32-random-bytes
docker compose pull
docker compose up -d
```

Then open:

```text
http://127.0.0.1:8080
```

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
http://127.0.0.1:8080/api/health/status
```

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
- Migration backups are mounted and writable.

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
docker build -t ghcr.io/whiteassassins/ae-netscope:v0.1.6-alpha.1 .
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

### 3. Install Node.js 24

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
DATABASE_URL=postgresql+asyncpg://ae_netscope:CHANGE_ME_DATABASE_PASSWORD@127.0.0.1:5432/ae_netscope
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD
MAX_IMPORT_JSON_BYTES=2000000
SESSION_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
SESSION_COOKIE_NAME=ae_netscope_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict
SESSION_TTL_SECONDS=28800
SECURITY_HEADERS_ENABLED=true
SECURITY_HSTS_ENABLED=true
SECURITY_HSTS_MAX_AGE=31536000
PASSWORD_HASH_ALGORITHM=argon2id
AUTH_RATE_LIMIT_PER_MINUTE=5
AUTH_LOCKOUT_MINUTES=15
CRYPTO_POLICY_VERSION=1
PQC_READINESS_MODE=crypto-agile
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
- Docker and TrueNAS installs create a PostgreSQL backup automatically before startup migrations when `AE_NETSCOPE_PRE_MIGRATION_BACKUP=true`.
- Docker migration backups are stored in `/app/backups`, backed by the `ae_netscope_backups` Compose volume by default.
- The restore UI validates the JSON first and shows a preview before replacing data.
- A restore replaces inventory records only: devices, interfaces, IPs, subnets, VLANs, and services.
- A restore does not modify users, sessions, password hashes, secrets, or environment variables.
- Before a restore is applied, the API returns a pre-restore backup and the web UI downloads it automatically.
- Keep production backups outside the repository and outside the web root.

PostgreSQL migration backups are custom-format `pg_dump` files. Restore them with `pg_restore` into a prepared PostgreSQL database after stopping AE NetScope.

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
ExecStart=/opt/ae-netscope/api/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
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

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` before opening issues or pull requests.

Do not post secrets, credentials, real network inventories, private IP plans, MAC address inventories, hostnames, screenshots of private infrastructure, or sensitive logs in public issues or pull requests.

For support boundaries, see `SUPPORT.md`.

## License

AE NetScope is free and open source software released under the MIT License.

Copyright is held by Christopher David Alberto Roque, also known as [WhiteAssassins](https://github.com/WhiteAssassins), CEO of AE White Devs LLC.

See `LICENSE` for the full terms.
