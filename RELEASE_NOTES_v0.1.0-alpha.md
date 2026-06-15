# AE NetScope v0.1.0-alpha

AE NetScope v0.1.0-alpha is the first public alpha release.

## Important

This is an **Early public preview, not production ready**.

Do not use this release with sensitive production network data. APIs, database schema, permission boundaries, security controls, deployment guidance, and UI behavior may change before v1.0.

AE NetScope is source-available proprietary software. Internal business use is allowed, but resale, sublicensing, marketplace publishing, paid hosting, commercial managed-service use, and repackaging as another product require written permission from Christopher David Alberto Roque or AE White Devs LLC.

## Highlights

- LAN inventory dashboard for devices, IPs/MACs, subnets, VLANs, services, hardware details, and technical notes.
- Real login with session cookies, CSRF protection, Argon2id password hashing, roles, permissions, first-admin setup, and forced password change support.
- Admin user management with role changes, activation state, password reset, session review, and session revocation.
- Audit/history views for operational changes.
- Inventory backup/export and restore flows.
- Health checks, detailed system status page, and Redis-backed login rate limiting.
- Internal project versioning with installed-version display and GitHub release update checks.
- Account email change from Settings with current-password confirmation.
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
