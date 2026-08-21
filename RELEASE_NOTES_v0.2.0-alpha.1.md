# AE NetScope v0.2.0-alpha.1

AE NetScope v0.2.0-alpha.1 is a bugfix prerelease for the v0.2.0 alpha line. It restores physical assets that could be hidden from Hardware and prevents account email autofill from leaking into global search on Settings.

## Important

This is an **early public preview, not production ready**.

Use this release only for controlled testing, homelab review, and non-sensitive trial environments. Keep configured secrets stable and make a host-level backup before upgrading an installation containing important data.

AE NetScope is free and open source software released under the MIT License.

## Fixed

- Hardware now recognizes English, Spanish, mixed-case, aliased, and custom physical device types instead of requiring exact Spanish labels.
- Custom device records with physical asset metadata such as vendor, model, serial number, CPU, memory, storage, warranty, or rack position now appear in Hardware.
- Virtual machines and containers remain excluded from the physical Hardware inventory.
- The global navigation search now identifies itself as a non-credential search field and opts out of browser autofill.
- Settings password, TOTP, and passkey inputs now provide stable names and appropriate browser autocomplete hints.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.2.0-alpha.1
```

Pre-release channel:

```text
ghcr.io/whiteassassins/ae-netscope:alpha
```

## Upgrade Safety

- This release introduces no database migration.
- Existing users, inventory, sessions, audit records, PostgreSQL data, Redis or Valkey data, and Docker volumes are preserved.
- Docker Compose users should update with `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- TrueNAS users should update only through the TrueNAS Apps interface.

## Verification

- Complete API and web test suites pass.
- API and web coverage thresholds pass.
- Ruff, ESLint, and the frontend production build pass.
- Dependency audits, secret scanning, tracked-artifact checks, and release metadata validation pass.

## Known Limitations

- This alpha is not production ready.
- Active network discovery and scanning remain intentionally unavailable.
- Plain Docker automatic updates remain disabled unless explicitly configured by the administrator.
- TrueNAS installations must use the TrueNAS Apps interface for updates.
