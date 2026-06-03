# AE NetScope v0.1.0-alpha

AE NetScope v0.1.0-alpha is the first public alpha release.

## Important

This is an **Early public preview, not production ready**.

Do not use this release with sensitive production network data. APIs, database schema, permission boundaries, security controls, deployment guidance, and UI behavior may change before v1.0.

## Highlights

- LAN inventory dashboard for devices, IPs/MACs, subnets, VLANs, services, hardware details, and technical notes.
- Real login with session cookies, CSRF protection, Argon2id password hashing, roles, permissions, first-admin setup, and forced password change support.
- Admin user management with role changes, activation state, password reset, session review, and session revocation.
- Audit/history views for operational changes.
- Inventory backup/export and restore flows.
- Health checks and Redis-backed login rate limiting.
- CI checks for API lint/tests, frontend lint/tests/build, coverage reports, dependency audits, secret scanning, and forbidden tracked local files.

## Known Limitations

- This alpha is not production ready.
- Network scanning/discovery is not enabled yet.
- PostgreSQL and Redis production paths are prepared, but broader production hardening is still ongoing.
- Some workflows are intentionally conservative while the data model stabilizes.

## Recommended Use

- Homelab testing.
- UI and workflow feedback.
- Reviewing project structure, security model, and contribution flow.
- Non-sensitive demo or sample data only.

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
