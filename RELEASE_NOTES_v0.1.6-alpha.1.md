# AE NetScope v0.1.6-alpha.1

AE NetScope v0.1.6-alpha.1 is an early public preview focused on passive topology, safer update handling, Docker/TrueNAS smoke validation, and stronger release checks.

## Important

This is an **Early public preview, not production ready**.

Use this release only for controlled testing, homelab review, and non-sensitive trial environments. APIs, database schema, permission boundaries, deployment guidance, and UI behavior may change before v1.0.

AE NetScope is open source software licensed under the MIT License.

## Highlights
- Fixed startup migrations against PostgreSQL 18 by installing PostgreSQL client 18 in the container image.

- Added a passive Topology view with expandable subnets, VLAN context, linked devices, linked IPs, and unassigned-IP visibility.
- Improved Dashboard recent activity so long audit text does not overlap.
- Added tests for Dashboard, Topology, version alignment, GitHub update checks, and automatic-update hardening.
- Cached GitHub release checks and kept the update page usable if GitHub is temporarily unavailable.
- Hardened automatic Docker update execution by validating release tags and avoiding shell execution.
- Added Alembic migration checks to CI.
- Added Docker and TrueNAS smoke checklists to the README.
- Documented safer Docker update flow and warned against deleting persistent volumes.

## Docker And TrueNAS Notes

- Container image target: `ghcr.io/whiteassassins/ae-netscope:v0.1.6-alpha.1`.
- Pre-release channel tag: `ghcr.io/whiteassassins/ae-netscope:alpha`.
- TrueNAS package target: `truenas/ix-dev/community/ae-netscope`.
- TrueNAS installs should be updated through the TrueNAS Apps interface.

## Upgrade Safety

- Docker Compose users should update with `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update. That command deletes PostgreSQL, Redis, and migration-backup volumes.
- The existing PostgreSQL and Redis volume names are preserved in `compose.yaml`.
- A PostgreSQL pre-migration backup is created in `/app/backups` when `AE_NETSCOPE_PRE_MIGRATION_BACKUP=true`.
- TrueNAS users should update through the TrueNAS Apps interface so the catalog-managed datasets remain attached.
- No destructive Alembic migration is introduced in this release.

## Known Limitations

- This alpha is still not production ready.
- Network scanning/discovery is not enabled.
- In-app automatic updates are disabled unless explicitly configured for Docker installs.
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
- Coverage runs.
- Alembic migration check.
