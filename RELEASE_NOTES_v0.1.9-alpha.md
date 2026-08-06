# AE NetScope v0.1.9-alpha

AE NetScope v0.1.9-alpha is an early public preview focused on reliability, safer asynchronous workflows, dependency security, accessibility, and stronger automated regression coverage.

## Important

This is an **Early public preview, not production ready**.

Use this release only for controlled testing, homelab review, and non-sensitive trial environments. APIs, database schema, permissions, deployment guidance, translations, and UI behavior may change before v1.0.

AE NetScope is free and open source software released under the MIT License.

## Highlights

- Prevented stale session results when administrators switch rapidly between users.
- Kept the signed-in identity synchronized after an administrator edits their own account.
- Prevented Health from retaining a stale Ready state after a failed refresh.
- Made administrative settings load independently so one unavailable endpoint does not hide valid results from the others.
- Prevented overlapping update checks and release-history requests from replacing newer responses.
- Selected GitHub releases by semantic version rather than API response order.
- Hardened interface, language, time zone, date, and hour-format settings when browser storage is blocked.
- Added consistent keyboard focus visibility across interactive controls.
- Expanded API and web regression coverage and enforced coverage thresholds in CI.
- Updated vulnerable compatible Python and frontend dependencies.

## Upgrade Safety

- This release introduces no destructive database migration.
- Existing users, inventory, sessions, audit history, PostgreSQL data, Redis data, and backup volumes are preserved.
- Docker Compose users should update with `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- TrueNAS users should update through the TrueNAS Apps interface.

## Docker And TrueNAS

- Container image target: `ghcr.io/whiteassassins/ae-netscope:v0.1.9-alpha`.
- Pre-release channel tag: `ghcr.io/whiteassassins/ae-netscope:alpha`.
- The staged TrueNAS package targets AE NetScope `0.1.9-alpha`.
- TrueNAS-managed installations continue to use the TrueNAS update workflow rather than in-app automatic updates.

## Verification

Release validation completed before publishing:

- API tests: `99 passed` with `87%` coverage.
- Web tests: `121 passed` with at least `85%` statements, functions, and lines coverage.
- API and web lint passed.
- Frontend production build passed.
- npm and Python dependency audits report no known vulnerabilities.
- Release metadata validation passed.
- Secret and tracked-artifact checks passed.

## Known Limitations

- This alpha is still not production ready.
- Network scanning and active discovery are not enabled.
- In-app automatic updates remain disabled unless explicitly configured for plain Docker deployments.
- TrueNAS users must update through the TrueNAS Apps interface.
- Use only with non-sensitive demo, homelab, or test data.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.1.9-alpha
```
