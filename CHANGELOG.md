# Changelog

All notable changes to AE NetScope will be documented in this file.

## v0.1.5-alpha - 2026-06-29

### Added

- Added a dedicated Profile view for account email changes, password-change access, role visibility, and active permission review.
- Added keyboard-friendly global search behavior with `Ctrl K`, `Escape`, arrow navigation, and `Enter` selection.
- Added search coverage for hardware metadata, technical notes, audit events, users, and app sections.

### Changed

- Unified backups, JSON restore, and CSV exports into a single Datos workflow.
- Removed the duplicate Respaldos frontend view in favor of the unified Datos section.
- Updated dashboard links so recent devices and audit entries open the specific target context.
- Simplified Settings so it only handles local interface preferences and the Early Public Preview notice.
- Kept version/release checks in the dedicated Actualizaciones view.
- Reworked user-management row actions into a compact actions menu.
- Improved the footer so Documentation opens the public README and Support opens the internal support page.

### Verified

- Frontend production build passes.
- Frontend test suite passes.

## v0.1.4-alpha - 2026-06-25

### Added

- Redis password support through `REDIS_PASSWORD` for production and TrueNAS deployments.
- Initial TrueNAS Apps community package staging under `truenas/ix-dev/community/ae-netscope`.
- TrueNAS app metadata, questions, image values, Docker Compose template, generated library compatibility, and basic test values.

### Changed

- Updated local production compose to run Redis with password authentication.
- Updated GHCR image references and internal project version to `0.1.4-alpha`.
- Updated TrueNAS packaging to target AE NetScope `v0.1.4-alpha`.
- Updated TrueNAS submission checklist with current packaging and validation status.

### Verified

- API test suite passes.
- TrueNAS app YAML validates statically.
- TrueNAS render path was validated in the official validation container for the staged app package.

### Status

- Early public preview.
- Not production ready.
- Intended for TrueNAS, homelab, review, and controlled non-sensitive trial environments.

## v0.1.3-alpha - 2026-06-25

### Added

- Initial production container packaging with Dockerfile, compose stack, PostgreSQL, Redis, startup migrations, OCI labels, configurable non-root UID/GID, and one-port API/web serving.
- Static web serving from FastAPI for container deployments, including SPA fallback routing.
- PostgreSQL 18 compatible compose volume layout.
- Alembic sync migrations through `psycopg` for production PostgreSQL migration runs.
- API test coverage for the production static web mount.
- README production container preview instructions for local compose validation and GHCR image building.

### Changed

- Updated vulnerable web and API dependency ranges so release hardening audits pass cleanly.
- Production cookie and HSTS defaults remain secure by default while allowing explicit environment overrides for controlled HTTP container previews.
- Isolated Redis/rate-limit behavior in API tests so local Redis state cannot cause flaky 429 responses.
- Updated TrueNAS checklist with verified container, PostgreSQL, Redis, healthcheck, migration, and persistence progress.

### Verified

- Docker image builds successfully.
- `docker compose up --build` starts AE NetScope, PostgreSQL, and Redis.
- `/api/health/live`, `/api/health/status`, `/api/version`, and the web UI respond through the container.
- PostgreSQL data persists after container restart.

### Status

- Early public preview.
- Container path is now validated locally.
- Not production ready.
- Intended for homelab, review, and controlled non-sensitive trial environments.

## v0.1.2-alpha - 2026-06-15

### Added

- Source-available proprietary license alignment across public project documentation.
- Import preview for JSON inventory backups before replacing current data.
- Stronger backup validation for duplicate records and broken VLAN, network, interface, device, IP, and service references.
- Automatic pre-restore backup returned by the API and downloaded from the web UI.
- Production hardening with security headers, production-secure cookies, HSTS controls, and import size limits.
- Dedicated update page with installed version, latest GitHub release, status, release link, and upgrade checklist.
- Alembic migration tests for single-head history and clean upgrade to `head`.
- README production guidance for backup/restore policy and SQLite local to PostgreSQL production migration.

### Changed

- Documentation and release materials aligned with the source-available proprietary license.

### Status

- Early public preview.
- Potentially usable for controlled testing with non-sensitive data.
- Not production ready.
- Intended for homelab, review, and limited trial environments.

## v0.1.1-alpha - 2026-06-03

### Added

- Internal version source, API version endpoint, installed-version display, and GitHub release update check.
- System status view with API, database, Redis, environment, release channel, and last-check details.
- Account email change flow with current-password confirmation and audit logging.

### Status

- Early public preview.
- Not production ready.
- Intended for testing, feedback, and controlled non-sensitive environments only.

## v0.1.0-alpha - 2026-06-03

### Added

- Initial public alpha of AE NetScope.
- FastAPI backend with session authentication, CSRF protection, roles, permissions, audit events, health checks, Redis-backed rate limiting, and setup flow for the first admin.
- React/Vite frontend with dashboard, login, user management, roles and permissions, settings, support, backups, technical notes, and inventory views.
- LAN inventory management for devices, IPs/MACs, subnets, VLANs, services, and hardware metadata.
- JSON/CSV export and JSON restore for inventory backups.
- Test coverage for API and frontend, CI workflow, coverage reports, dependency audits, secret scanning, and tracked-artifact checks.
- Public project documents: README, license, contributing guide, code of conduct, security policy, support policy, issue templates, and pull request template.

### Status

- Early public preview.
- Not production ready.
- Intended for testing, feedback, and controlled non-sensitive environments only.
