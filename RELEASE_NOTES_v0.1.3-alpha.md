# AE NetScope v0.1.3-alpha

AE NetScope v0.1.3-alpha is an early public preview focused on the first validated container deployment path for local production-style testing, GHCR publishing, and future TrueNAS packaging work.

## Important

This is an **Early public preview, not production ready**.

This release may be usable for controlled testing, homelab review, and non-sensitive trial environments. Do not use it with sensitive production network data yet. APIs, database schema, permission boundaries, security controls, deployment guidance, and UI behavior may change before v1.0.

AE NetScope is source-available proprietary software. Internal business use is allowed, but resale, sublicensing, marketplace publishing, paid hosting, commercial managed-service use, and repackaging as another product require written permission from Christopher David Alberto Roque or AE White Devs LLC.

## Highlights

- Updated internal project version to `0.1.3-alpha`.
- Added initial production container packaging with Dockerfile, compose stack, PostgreSQL, Redis, startup migrations, OCI labels, configurable non-root UID/GID, and one-port API/web serving.
- Added FastAPI static web serving for the built Vite app, including SPA fallback routing for container deployments.
- Added PostgreSQL 18 compatible compose volume layout.
- Added Alembic sync migrations through `psycopg` for production PostgreSQL migration runs.
- Added API test coverage for the production static web mount.
- Isolated Redis/rate-limit behavior in API tests so local Redis state cannot cause flaky 429 responses.
- Updated vulnerable web and API dependency ranges so release hardening audits pass cleanly.
- Production cookie and HSTS defaults remain secure by default while allowing explicit environment overrides for controlled HTTP container previews.
- Updated README with production container preview instructions for local compose validation and GHCR image building.
- Updated TrueNAS checklist with verified container, PostgreSQL, Redis, healthcheck, migration, and persistence progress.

## Docker Validation

Validated locally with Docker Desktop:

- Docker image builds successfully.
- `docker compose up --build` starts AE NetScope, PostgreSQL, and Redis.
- PostgreSQL 18 initializes with the corrected volume layout.
- Redis healthcheck passes.
- Alembic migrations run against PostgreSQL.
- `/api/health/live`, `/api/health/status`, `/api/version`, and the web UI respond through the container.
- PostgreSQL data persists after container restart.

## Known Limitations

- This alpha is still not production ready.
- Network scanning/discovery is not enabled yet.
- The container path is validated locally, but public GHCR publishing and TrueNAS catalog packaging still need final release work.
- Use only with non-sensitive demo, homelab, or test data.

## Verification

Before publishing this release, run:

```bat
test.cmd
```

Expected checks:

- Secret scan.
- Tracked local/generated file check.
- Web and API dependency audits.
- API lint and tests.
- Frontend lint, tests, and production build.
