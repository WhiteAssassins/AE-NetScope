# AE NetScope v0.2.0-alpha

AE NetScope v0.2.0-alpha is an early public preview focused on protecting stored network data, strengthening authentication and session handling, securing backups, and preserving Docker and TrueNAS upgrade compatibility.

## Important

This is an **early public preview, not production ready**.

This release introduces authenticated encryption for sensitive stored fields and encrypted pre-migration backups. Keep all configured secrets stable across updates and make a host-level backup before upgrading an installation containing important data.

AE NetScope is free and open source software released under the MIT License.

## Security Highlights

- Added authenticated AES-256-GCM encryption for sensitive inventory fields, session metadata, audit details, inventory restore backups, and PostgreSQL pre-migration dumps.
- Added independent data and backup encryption keys with controlled fallback-key rotation.
- Added absolute and idle session expiration with bounded activity updates.
- Expanded session revocation after password, email, MFA, role, lock, and account-status changes.
- Added constant-cost password verification for unknown, inactive, and locked accounts.
- Added HMAC-protected Redis rate-limit identifiers and fail-closed managed-deployment defaults.
- Added TOTP failure lockout accounting and atomic replay prevention.
- Made WebAuthn challenges atomic and single-use.
- Required current-password verification before deleting a passkey.
- Separated administrator self-service credential recovery from the user-management panel.
- Added audit events for initial setup, logout, failed MFA, and failed passkey authentication.
- Added bounded request bodies to JSON-bearing DELETE endpoints.
- Added bounded, coalesced, negatively cached, and rate-limited GitHub metadata requests.
- Hardened CORS, cache controls, browser security headers, cross-site mutation checks, health output, and managed API documentation exposure.
- Hardened the container with a read-only application filesystem, dropped capabilities, no-new-privileges, process limits, PostgreSQL SCRAM, and Redis protected mode.
- Updated the vulnerable transitive `nanoid` dependency.

## Data And Backups

- Added reversible Alembic migrations `0009_session_idle`, `0010_sensitive_data`, and `0011_auth_replay`.
- Existing plaintext sensitive fields are encrypted during startup after the schema reaches the current migration head.
- Malformed values beginning with the reserved encryption marker are preserved as literal data and safely encrypted.
- PostgreSQL pre-migration backups are encrypted before being retained.
- Added a recovery CLI for authenticated encrypted backup files.
- Added configurable key rotation through `DATA_DECRYPTION_FALLBACK_KEYS`, `MFA_DECRYPTION_FALLBACK_KEYS`, and `BACKUP_DECRYPTION_FALLBACK_KEYS`.

## Upgrade Safety

- Existing users, inventory, sessions, audit records, PostgreSQL data, Redis or Valkey data, and Docker volumes are preserved.
- Existing TrueNAS installations remain compatible with HTTP access, PostgreSQL 18.4, Valkey 9.1.1, historical non-placeholder internal passwords, and custom runtime UID/GID values.
- Keep `SESSION_SECRET` unchanged during the upgrade. When dedicated encryption keys are configured, keep those unchanged as well.
- If rotating an encryption key, provide the previous value through the corresponding fallback-key variable until startup migration completes.
- Docker Compose users should update with `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- TrueNAS users should update only through the TrueNAS Apps interface.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.2.0-alpha
```

Pre-release channel:

```text
ghcr.io/whiteassassins/ae-netscope:alpha
```

## Verification

- API suite: `130 passed`.
- Web suite: `121 passed`.
- API coverage remains above the enforced `85%` threshold.
- Web statements, functions, and lines remain above the enforced `85%` thresholds.
- Ruff and ESLint pass.
- Frontend production build passes.
- Alembic reaches `0011_auth_replay (head)` with no schema drift.
- npm and Python dependency audits report no known vulnerabilities.
- Secret scanning, tracked-artifact checks, Compose validation, shell syntax validation, and release metadata validation pass.
- The official TrueNAS catalog contract was checked against `APP_ENV=production`, PostgreSQL 18.4, Valkey 9.1.1, HTTP/HTTPS mode, and image tag updates.

## Known Limitations

- This alpha is not production ready.
- Active network discovery and scanning remain intentionally unavailable.
- Plain Docker automatic updates remain disabled unless explicitly configured by the administrator.
- TrueNAS installations must use the TrueNAS Apps interface for updates.
- Host or dataset encryption is still recommended because searchable identifiers such as IP addresses, MAC addresses, CIDRs, account identifiers, and record names remain queryable database fields.
