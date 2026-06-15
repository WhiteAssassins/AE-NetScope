# AE NetScope v0.1.2-alpha

AE NetScope v0.1.2-alpha is an early public preview focused on safer testing, clearer release visibility, stronger restore flows, production hardening, and license alignment.

## Important

This is an **Early public preview, not production ready**.

This release may be usable for controlled testing, homelab review, and non-sensitive trial environments. Do not use it with sensitive production network data yet. APIs, database schema, permission boundaries, deployment guidance, and UI behavior may change before v1.0.

AE NetScope is source-available proprietary software. Internal business use is allowed, but resale, sublicensing, marketplace publishing, paid hosting, commercial managed-service use, and repackaging as another product require written permission from Christopher David Alberto Roque or AE White Devs LLC.

## Highlights

- Updated internal project version to `0.1.2-alpha`.
- Replaced the previous MIT license text with the AE NetScope source-available proprietary license.
- Aligned README, contributing guide, support policy, code of conduct, release notes, public checklist, TrueNAS checklist, issue templates, and pull request template with the new license.
- Added JSON import preview before inventory restores.
- Added stronger backup validation for duplicate records and broken VLAN, network, device, interface, IP, and service references.
- Added automatic pre-restore backup returned by the API and downloaded from the web UI.
- Added production security headers, production-secure cookie behavior, HSTS controls, and import size limits.
- Added early request-size middleware for inventory import endpoints.
- Added a dedicated Updates page with installed version, latest GitHub release, status, release link, and upgrade checklist.
- Added Alembic migration tests for single-head history and clean upgrade to `head`.
- Updated README production guidance for backup policy and SQLite local to PostgreSQL production migration.

## Known Limitations

- This alpha is still not production ready.
- Network scanning/discovery is not enabled yet.
- PostgreSQL and Redis production paths are prepared, but broader production hardening is still ongoing.
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
