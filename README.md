# AE NetScope

[![CI](https://github.com/WhiteAssassins/AE-NetScope/actions/workflows/ci.yml/badge.svg)](https://github.com/WhiteAssassins/AE-NetScope/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-source--available-orange)
![Status](https://img.shields.io/badge/status-early%20public%20preview-yellow)

AE NetScope is a self-hosted web app for organizing LAN inventory data such as devices, IP addresses, MAC addresses, subnets, VLANs, services, hardware details, and technical notes.

## Early Public Preview

AE NetScope is in early public preview and is not production ready yet.

Do not use it with sensitive production network data at this stage. APIs, database schema, permission boundaries, security controls, and deployment guidance may change before v1.0.

Current alpha release notes are available in `RELEASE_NOTES_v0.1.0-alpha.md`. See `CHANGELOG.md` for release history.

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

The web UI shows the installed version in the footer and in **Ajustes**, where administrators can compare the installed version with the latest GitHub release.

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

## Configuration

Development can use `.env` copied from `.env.example`.

Production should use system environment variables or a systemd `EnvironmentFile`, not a committed `.env` file.

Important variables:

```text
APP_ENV=production
APP_NAME="AE NetScope"
APP_URL=https://netscope.example.com
API_CORS_ORIGINS=https://netscope.example.com
DATABASE_URL=postgresql+asyncpg://ae_netscope:CHANGE_ME@127.0.0.1:5432/ae_netscope
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
SESSION_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
SESSION_COOKIE_NAME=ae_netscope_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict
SESSION_TTL_SECONDS=28800
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
SESSION_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
SESSION_COOKIE_NAME=ae_netscope_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict
SESSION_TTL_SECONDS=28800
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
```

Restart:

```bash
sudo systemctl restart ae-netscope-api
sudo systemctl reload nginx
```

### 15. Verify production

```bash
curl -I https://netscope.example.com
curl https://netscope.example.com/api/health
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

AE NetScope is public source-available software under a proprietary license. You may use it for personal, educational, homelab, and internal business purposes, including inside a company.

Copyright is held by Christopher David Alberto Roque, also known as [WhiteAssassins](https://github.com/WhiteAssassins), CEO of AE White Devs LLC.

You may not sell, resell, sublicense, repackage, host as a commercial service, publish to marketplaces, or present AE NetScope as your own product without written permission from Christopher David Alberto Roque or AE White Devs LLC. See `LICENSE`.
