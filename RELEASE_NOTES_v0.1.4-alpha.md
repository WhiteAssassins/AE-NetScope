# AE NetScope v0.1.4-alpha

AE NetScope v0.1.4-alpha is an early public preview focused on TrueNAS packaging readiness and Redis password support for container deployments.

## Important

This is an **Early public preview, not production ready**.

Use this release only for controlled testing, homelab review, and non-sensitive trial environments. APIs, database schema, permission boundaries, deployment guidance, and UI behavior may change before v1.0.

AE NetScope is source-available proprietary software. Internal business use is allowed, but resale, sublicensing, marketplace publishing, paid hosting, commercial managed-service use, and repackaging as another product require written permission from Christopher David Alberto Roque or AE White Devs LLC.

## Highlights

- Updated internal project version to `0.1.4-alpha`.
- Added `REDIS_PASSWORD` support in the API configuration.
- Updated Docker Compose Redis service to require authentication.
- Added test coverage for password-protected Redis URL generation.
- Prepared the first TrueNAS Apps community package staging.
- Updated TrueNAS metadata, questions, image values, template, and test values for the `v0.1.4-alpha` image.
- Validated the TrueNAS render path inside the official validation container.

## Docker And TrueNAS Notes

- Container image target: `ghcr.io/whiteassassins/ae-netscope:v0.1.4-alpha`.
- TrueNAS package target: `truenas/ix-dev/community/ae-netscope`.
- Redis now expects a password in production-style deployments.
- For HTTP-only local or LAN testing, keep secure cookies and HSTS disabled until HTTPS is configured.

## Known Limitations

- This alpha is still not production ready.
- Network scanning/discovery is not enabled yet.
- TrueNAS installation still needs validation on a real TrueNAS SCALE system.
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
