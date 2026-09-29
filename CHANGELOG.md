# Changelog

All notable changes to AE NetScope will be documented in this file.

## Unreleased

### Fixed

- Fixed audit log search returning no results when matching text inside audit messages, which are stored encrypted and cannot be matched by a database `LIKE`.
- Fixed the device list and device responses reporting an arbitrary interface address when a device has more than one interface.
- Fixed a network CIDR change silently leaving assigned IP addresses outside the new range; the change is now rejected while those addresses remain assigned.
- Fixed the maintenance-mode middleware wrapping the downstream request in its own error handler, so application errors no longer re-enter its fallback path.
- Fixed the automatic update route substituting the untrimmed release tag into the configured command after validating the trimmed value, and rejecting a supplied blank tag instead of launching the command with an unsubstituted placeholder.

### Security

- Updated the transitive `browserslist` dependency to a patched release that fixes unbounded cache growth and an untrusted custom-stats prototype write.

### Changed

- Updated the web runtime and tooling dependencies, including React, i18next, react-i18next, Lucide, Recharts, Vite, Vitest, ESLint, typescript-eslint, Testing Library, jsdom, and the Node type definitions.
- Raised the API dependency floors for FastAPI, Starlette, SQLAlchemy, Alembic, Uvicorn, Redis, psycopg, cryptography, pydantic-settings, pwdlib, aiosqlite, setuptools, Dramatiq, and the development toolchain.
- Held TypeScript on the 6.x line because typescript-eslint does not yet support TypeScript 7.
- Removed the unused browser-side GitHub releases request, which the API content security policy blocks through `connect-src 'self'`.
- Cached the derived field-encryption key so reading a list of records no longer runs one key derivation per encrypted value.

### Verified

- Verified the complete API and web test suites, lint checks, frontend production build, SQLite migration upgrade and check, dependency audits, secret scan, tracked-artifact check, and release metadata alignment.
- Added regression coverage for encrypted audit search, stable device primary addressing, network CIDR changes that would strand IP addresses, and maintenance-mode error handling.

## v0.2.0-alpha.1 - 2026-08-21

### Fixed

- Fixed the Hardware view silently hiding physical assets whose imported or API-created device types use English, mixed case, aliases, or custom labels.
- Fixed browser password managers treating the global navigation search as a credential username field when opening Settings.

### Changed

- Classified hardware through normalized physical-device aliases and populated asset metadata while continuing to exclude virtual machines and containers.
- Added explicit search, password, passkey-name, and one-time-code autocomplete semantics to account security controls.

### Verified

- Added regression coverage for localized, aliased, mixed-case, custom, and virtual device classifications.
- Verified the complete API and web test suites, lint checks, frontend production build, dependency audits, secret scan, tracked-artifact check, coverage thresholds, and release metadata alignment.

## v0.2.0-alpha - 2026-08-12

### Security

- Added authenticated application-level encryption for sensitive inventory details, session metadata, audit messages, audit IP addresses, persisted restore backups, and PostgreSQL pre-migration dumps.
- Added independent data and backup encryption keys with controlled fallback-key rotation and a recovery CLI for encrypted backups.
- Added absolute and idle session expiration, bounded activity updates, and broader session revocation after identity, password, MFA, role, lock, and account-status changes.
- Added constant-cost password verification for unknown, inactive, and locked accounts and HMAC-protected Redis rate-limit identifiers.
- Added startup rejection for placeholder managed-deployment secrets, unauthenticated Redis, and fail-open rate limiting, plus an explicit warning for HTTP-only managed deployments without secure cookies.
- Added cross-site mutation rejection, stricter CORS and browser security headers, non-cacheable API responses, hidden managed-deployment OpenAPI schemas, minimal public liveness output, and hidden SQL query parameters.
- Hardened the Compose stack with a read-only application filesystem, temporary writable memory, dropped capabilities, process limits, no-new-privileges, Redis protected mode, and PostgreSQL SCRAM initialization.
- Removed unnecessary build utilities from the runtime container and suppressed the Uvicorn server header.
- Prevented plaintext values beginning with the encrypted-value marker from bypassing field encryption or blocking key migration.
- Added bounded, coalesced, negatively cached, and rate-limited GitHub metadata requests to prevent unauthenticated request amplification.
- Applied request-body limits to JSON-bearing `DELETE` endpoints, including TOTP removal.
- Separated administrator self-service recovery from user management and required current-password verification before passkey deletion.
- Added account lockout accounting for invalid TOTP attempts, atomic TOTP replay prevention, and atomic single-use WebAuthn challenges.
- Added audit events for initial setup, logout, and failed passkey authentication without recording submitted credentials.
- Updated the transitive `nanoid` dependency to a patched release.

### Changed

- Added reversible Alembic migrations for session activity tracking and encrypted-field storage, including safe decryption before schema downgrade.
- Preserved TrueNAS HTTP compatibility while making Redis rate limiting fail closed by default in managed deployments.
- Preserved upgrades for existing TrueNAS installations with non-placeholder internal passwords of any historical length and custom runtime UIDs that cannot write to `/app/backups`.
- Updated deployment, key-rotation, backup-recovery, and host-encryption guidance.
- Replaced CSP-incompatible dynamic progress styles with native progress elements.

### Verified

- Added regression tests for key rotation, tamper detection, encrypted database storage, encrypted backup recovery, session idling, runtime configuration, cross-site requests, migration upgrades, and encrypted downgrades.
- Added regression tests for ciphertext-prefix handling, bounded `DELETE` bodies, GitHub request coalescing, administrator self-recovery boundaries, TOTP lockout and replay, passkey verification, single-use WebAuthn challenges, and authentication audit events.
- Validated a production image against isolated PostgreSQL 18 and Redis 8 containers, including real migrations, encrypted values at rest, backup decryption, hidden OpenAPI, and minimal health output.
- Validated the TrueNAS runtime contract with UID/GID 568, PostgreSQL 18.4, Valkey 9.1.1, HTTP cookies, omitted dedicated encryption keys, and migration to the current schema head.

## v0.1.9-alpha - 2026-08-05

### Changed

- Improved user administration so rapid user switching cannot display stale session data and edits to the signed-in account update the application header immediately.
- Improved Health, administrative settings, and Updates so failed or overlapping requests cannot leave stale success states or overwrite newer results.
- Improved release selection to use semantic version ordering instead of relying on the order returned by GitHub.
- Hardened language, regional-preference, and interface-setting persistence when browser storage is unavailable or blocked.
- Added consistent visible keyboard focus styles across search, select, form, and action controls.
- Raised automated API and frontend coverage requirements and expanded regression coverage for API clients, bootstrap behavior, users, settings, updates, date/time handling, and WebAuthn helpers.
- Updated release and TrueNAS submission checklists to reflect the MIT license and the English-first localization model.

### Security

- Updated `cryptography`, `undici`, and `brace-expansion` to patched compatible releases.
- Added dependency-audit verification after the security updates.

### Fixed

- Fixed stale sessions appearing after switching quickly between users.
- Fixed stale signed-in identity after an administrator edits their own account.
- Fixed Health displaying a previous Ready state after a refresh failure.
- Fixed Settings failures and stuck saving states when `localStorage` is blocked.
- Fixed one failed administrative endpoint discarding valid results from the other settings endpoints.
- Fixed competing update and release-history requests overwriting newer responses.

### Verified

- API suite passes with `99` tests and at least `85%` coverage.
- Web suite passes with `121` tests and at least `85%` statements, functions, and lines coverage.
- API and web lint, frontend build, dependency audits, release metadata validation, and repository hygiene checks pass.

## v0.1.8-alpha - 2026-07-20

### Added

- Added passive inventory-quality checks with documentation scoring, categorized findings, relationship summaries, and navigation to affected records.
- Added an About page with project, creator, company, license, repository, support, and installed-version information.
- Added repository statistics, system health, installed-version visibility, update state, and improved notifications to the top bar.
- Added regional preferences for time zone, date format, and 12/24-hour display.
- Added account-session management, TOTP authentication, WebAuthn/passkey support, maintenance mode, and update-attempt history.
- Added richer user-management details, editable account identity and roles, activation controls, MFA/passkey visibility, session counts, and individual session revocation.
- Added release-history and changelog browsing to the Updates view.
- Added an administrative search-engine visibility policy backed by dynamic `robots.txt`, `X-Robots-Tag`, and HTML robots metadata.
- Added Alembic migrations `0006` through `0008` for regional/security settings, language capacity alignment, and the search-indexing policy.
- Added regression tests for account security, maintenance behavior, user administration, updates, repository information, About, quality checks, notifications, and crawler policy behavior.

### Changed

- Expanded English and Spanish translation coverage across inventory, administration, support, quality, updates, and account workflows.
- Improved Settings organization with browser-local interface preferences and permission-gated administrative controls.
- Improved the Users view for repeated administrative work and clearer high-risk account actions.
- Improved the Updates view with cached GitHub release data and graceful behavior when GitHub is temporarily unavailable.
- Improved footer and top-bar navigation while keeping version and project information visible without obstructing the workspace.
- Updated all project, API, web, Docker, Compose, release, and staged TrueNAS image markers to `0.1.8-alpha`.

### Security

- Kept search-engine indexing blocked by default and fail-closed if the policy cannot be loaded.
- Added encrypted TOTP secret storage and CSRF-protected account-security operations.
- Added cache controls and permission checks around administrative, session, and user-management responses.
- Kept TrueNAS-managed installations on their platform update path and limited in-app automatic updates to explicitly configured Docker deployments.
- Updated `brace-expansion`, `postcss`, and `nanoid` to patched releases after dependency security advisories.

### Fixed

- Fixed long activity text and management controls that could overlap or lose clarity at narrower widths.
- Fixed stale installed-version references across runtime metadata, tests, container tags, documentation, and staged TrueNAS metadata.
- Fixed the active document robots directive so it changes immediately after an administrator updates the crawler policy.

### Verified

- API suite passes with `96` tests.
- Web suite passes with `102` tests.
- Ruff, ESLint, the production web build, Alembic upgrade/check, release metadata validation, and local crawler-policy checks pass.
- npm and Python dependency audits report no known vulnerabilities.

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
