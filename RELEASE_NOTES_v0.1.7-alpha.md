# AE NetScope v0.1.7-alpha

AE NetScope v0.1.7-alpha is an early public preview focused on the first multilingual interface foundation, more useful operational health diagnostics, and database/authentication hardening for self-hosted installations.

## Important

This is an **Early public preview, not production ready**.

Use this release only for controlled testing, homelab review, and non-sensitive trial environments. APIs, database schema, permission boundaries, deployment guidance, translations, and UI behavior may change before v1.0.

AE NetScope is free and open source software released under the MIT License.

## Highlights

- Made English the primary, default, canonical, and fallback interface language.
- Added bundled English and Spanish locale files powered by `i18next` and `react-i18next`.
- Added manual language selection in **Settings > Language** with immediate preview and per-user persistence.
- Added automatic locale discovery so community contributors can add a language with one JSON file.
- Added strict translation tests for key parity, empty values, interpolation variables, English fallback, UTF-8 integrity, mojibake, control characters, and suspicious invisible characters.
- Migrated initial setup, login, navigation, topbar menus, global search, footer, loading states, Settings, and System status to the translation system.
- Added per-dependency latency and total diagnostic duration to `/api/health/status`.
- Improved System status with healthy-check counts, degraded dependency emphasis, retry handling, runtime endpoints, and optional 30-second auto-refresh.
- Protected first-admin creation with an installation token and atomic one-time setup state.
- Added HMAC-SHA256 protection for session and CSRF hashes while preserving and upgrading existing sessions.
- Added a dedicated bulk-export permission so viewer accounts cannot export the complete inventory.
- Added streamed request limits, note/description limits, sensitive-response cache controls, SQLite foreign keys, and authenticated dependency diagnostics.
- Added bounded cleanup for expired sessions, revoked sessions, audit history, and pre-migration PostgreSQL backups.
- Added PostgreSQL 18 migration validation and security regression checks to CI.

## Language Behavior

- English is used when no supported language preference is available.
- Spanish can be selected manually from Settings.
- The authenticated user's language preference is stored in the database and follows the account across sessions and devices.
- A browser-local language value supports unauthenticated screens and temporary fallback behavior.
- The remaining inventory and administration views are still being migrated progressively and may contain Spanish text in this alpha.

## Upgrade Safety

- Migration `0004_user_preferred_language` adds one non-null user preference column with the safe default `en`.
- Migration `0005_security_hardening` only adds setup state and indexes for session/audit retention; it does not delete or rewrite inventory or user data.
- Existing user, session, inventory, audit, PostgreSQL, and Redis data are preserved.
- Existing session hashes remain accepted and are transparently upgraded after successful use.
- Existing accounts receive English as their initial saved preference and can switch to Spanish after signing in.
- Detailed database and Redis health diagnostics now require authentication; public liveness/readiness responses remain minimal.
- Docker Compose users should update with `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent PostgreSQL, Redis, and migration-backup volumes.
- TrueNAS users should update through the TrueNAS Apps interface.

## Docker And TrueNAS

- Container image target: `ghcr.io/whiteassassins/ae-netscope:v0.1.7-alpha`.
- Pre-release channel tag: `ghcr.io/whiteassassins/ae-netscope:alpha`.
- TrueNAS staged package targets AE NetScope `0.1.7-alpha` with package revision `1.0.1`.
- TrueNAS-managed installations continue to use the TrueNAS update workflow rather than in-app automatic updates.
- Fresh Docker installations must configure `INITIAL_SETUP_TOKEN`; managed installs with an existing strong random `SESSION_SECRET` may use that value for initial setup.

## Known Limitations

- This alpha is still not production ready.
- Internationalization coverage is intentionally incremental; not every inventory view is translated yet.
- Network scanning and active discovery are not enabled.
- In-app automatic updates remain disabled unless explicitly configured for plain Docker deployments.
- PostgreSQL migration dumps are permission-restricted but not encrypted by AE NetScope; use encrypted host storage.
- Use only with non-sensitive demo, homelab, or test data.

## Verification

Release validation completed before publishing:

- API tests: `70 passed`.
- Web tests: `66 passed`.
- Translation tests: `6 passed`.
- API and web lint passed.
- Frontend production build passed.
- Alembic upgrade and schema drift checks passed on SQLite and PostgreSQL 18.
- Existing-user migration preservation test passed.
- Concurrent first-admin and last-admin safety tests passed.
- Docker image, Compose validation, and isolated full-stack smoke test passed.
- npm and Python dependency audits passed.
- Secret scan, tracked-artifact check, and release metadata validation passed.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.1.7-alpha
```
