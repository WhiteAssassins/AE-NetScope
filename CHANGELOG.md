# Changelog

All notable changes to AE NetScope will be documented in this file.

## v0.1.7-alpha - 2026-07-12

### Added

- Added atomic initial-setup ownership state and an installation-token requirement for fresh non-local deployments.
- Added HMAC-SHA256 protection for persisted session and CSRF token hashes with transparent migration of legacy hashes.
- Added bounded retention for expired sessions, revoked sessions, audit history, and pre-migration PostgreSQL backups.
- Added request-body enforcement that counts streamed bytes even when `Content-Length` is absent.
- Added PostgreSQL migration validation to CI in addition to SQLite migration tests.
- Added security regression coverage for setup protection, export authorization, cache controls, legacy sessions, retention, request limits, SQLite foreign keys, and migration state.
- Added the first internationalization milestone using `i18next` and `react-i18next`.
- Added canonical English and Spanish locale files with automatic locale discovery.
- Added manual language selection in Settings with immediate preview and account persistence.
- Added `preferred_language` to user accounts through a non-destructive Alembic migration and a CSRF-protected preference endpoint.
- Added translation validation for key parity, empty values, interpolation variables, English fallback, UTF-8 integrity, mojibake, control characters, and suspicious invisible characters.
- Added an upgrade test proving that the language migration preserves existing users and assigns English as their initial preference.
- Added per-dependency latency, total diagnostic duration, and stable translatable message codes to the detailed health endpoint.
- Added a more useful System status view with healthy-check counts, degraded dependency emphasis, runtime endpoints, retry handling, and optional 30-second auto-refresh.

### Changed

- Added a dedicated `inventory:export` permission for admins and operators; viewers remain read-only without bulk export access.
- Built PostgreSQL URLs from structured connection components so reserved characters in passwords remain valid.
- Enabled SQLite foreign-key enforcement to match production referential-integrity behavior.
- Restricted detailed database and Redis health diagnostics to authenticated users and kept public readiness failures minimal.
- Added explicit request, note, and description size limits plus `no-store` caching rules for sensitive API responses.
- Made Argon2id explicit in code and removed unused configuration flags that implied unsupported cryptographic behavior.
- Changed startup backups to run only before pending migrations, use restrictive permissions, and enforce retention.
- Updated all project, API, web, Docker, Compose, release, and TrueNAS image markers to `0.1.7-alpha`.
- Made English the primary, default, canonical, and fallback interface language.
- Migrated initial setup, login, navigation, topbar menus, global search, footer, loading states, and Settings to translation keys.
- Migrated System status and dependency health messages to the English/Spanish translation system.
- Made user language preferences follow authenticated accounts across sessions and devices while retaining browser-local fallback behavior.
- Documented the translation contribution workflow and the current incremental translation scope.

### Fixed

- Decoupled browser-local settings from account language persistence so local preferences still save when the API is unavailable.
- Restored the persisted account language when a remote language update fails, preventing selector, interface, and storage state from diverging.
- Aligned frontend, API, database, and migration locale-code capacity at 64 characters for community-provided locale files.
- Made readiness depend only on required health checks so optional integrations cannot incorrectly degrade the application.
- Corrected active public and TrueNAS checklists that still referenced the project's former license model.
- Corrected the GHCR workflow OCI description so published images identify AE NetScope as open source software.
- Strengthened fallback tests so they verify a genuinely missing translation key, not only an unsupported locale.

### Verified

- API and web test suites pass.
- Translation-specific tests pass.
- Ruff, ESLint, the production web build, Alembic upgrade/check, dependency audit, secret scan, and tracked-artifact checks pass.

## v0.1.6-alpha - 2026-07-07

### Added

- Added a dedicated passive Topology view with expandable subnet cards, VLAN context, linked devices, linked IP records, unassigned-IP visibility, and navigation into the real inventory records.
- Added Dashboard and Topology frontend tests for summary rendering, empty states, navigation callbacks, and expand/collapse behavior.
- Added version-alignment tests across `VERSION`, root `package.json`, `web/package.json`, and `api/pyproject.toml`.
- Added cached GitHub release checks for `/api/version/updates`, including graceful fallback when GitHub cannot be reached.
- Added Docker and TrueNAS smoke checklists to the README.
- Added CI migration validation with Alembic `upgrade head` and `alembic check`.

### Changed

- Updated all project version markers to `0.1.6-alpha`.
- Improved Dashboard recent-activity layout so long audit entries do not overlap.
- Improved the subnet map into a more useful topology workflow while keeping it passive.
- Hardened automatic Docker update execution by validating release tags and running commands without shell execution.
- Made CI coverage artifacts and test summaries more tolerant when a failing step prevents report files from being generated.
- Documented safer Docker update behavior and warned against destructive `docker compose down -v` usage.
- Kept TrueNAS installs on the TrueNAS-managed update path instead of in-app automatic updates.

### Fixed

- Fixed version/update tests that previously treated the installed release as a future update candidate.
- Fixed session-refresh behavior for Docker/TrueNAS HTTP installs by keeping secure-cookie behavior environment-aware.
- Fixed CSV export hardening for spreadsheet-formula values.
- Fixed permission/session hardening around forced password changes and password-change session revocation.

### Verified

- API test suite passes.
- Web test suite passes.
- Frontend production build passes.
- Web and API coverage runs pass.
- Secret scan, tracked-artifact check, npm audit, pip-audit, Ruff, ESLint, and Alembic checks pass.

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
