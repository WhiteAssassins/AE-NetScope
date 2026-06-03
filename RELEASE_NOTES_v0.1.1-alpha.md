# AE NetScope v0.1.1-alpha

AE NetScope v0.1.1-alpha is a maintenance alpha release.

## Important

This is an **Early public preview, not production ready**.

Do not use this release with sensitive production network data. APIs, database schema, permission boundaries, security controls, deployment guidance, and UI behavior may change before v1.0.

## Highlights

- Added a system status page for API, database, Redis, environment, release channel, and last health check.
- Added detailed health endpoint: `/api/health/status`.
- Added internal project version display and GitHub release update checks.
- Added account email change from Settings with current-password confirmation.
- Updated public release notes, changelog, and release checklist.
- Verified the full local test stack before publishing.

## Known Limitations

- This alpha is not production ready.
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
