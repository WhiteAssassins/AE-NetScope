# Security model

AE NetScope is designed for self-hosted sysadmin environments and may contain sensitive network inventory data.

## Authentication baseline

- Passwords are never encrypted or stored in plain text.
- Passwords are hashed with Argon2id.
- Login state uses server-side, database-backed sessions.
- Session and CSRF tokens are stored only as keyed hashes.
- Session cookies are HttpOnly and use SameSite Strict by default.
- Production session cookies are Secure and HSTS is enabled.
- Sessions have absolute and idle expiration limits.
- Identity, password, MFA, role, and account-status changes revoke affected sessions.
- Login, logout, failed login, lockout, role changes, and recovery events must be audited.
- Rate limiting and temporary lockout are required for authentication endpoints.
- TOTP and WebAuthn credentials are protected by server-side verification and encrypted secret storage.

## Authorization baseline

- Authorization must be enforced in the API, not only in the web UI.
- Initial roles: admin, operator, viewer.
- Sensitive profile and security actions require the current password or a valid security ceremony.
- Administrative changes should be written to the audit log.

## Post-quantum readiness

AE NetScope should be post-quantum ready through crypto-agility, not custom cryptography.

- Do not implement custom cryptographic primitives.
- Keep cryptographic algorithms configurable and versioned.
- Store algorithm metadata with hashes, encrypted payloads, signatures, and tokens when applicable.
- Prefer modern TLS at the deployment edge.
- Support migration to hybrid or post-quantum TLS when it is available in the deployed reverse proxy/runtime.
- Track NIST PQC standards:
  - FIPS 203: ML-KEM
  - FIPS 204: ML-DSA
  - FIPS 205: SLH-DSA
- Use post-quantum signatures only through mature, maintained, reviewed libraries.
- Keep a clear key rotation path for any future signing or encryption keys.

## Data protection

- Secrets must come from environment variables or a secret manager.
- `.env` must never be committed.
- `.env.example` must use safe placeholder values only.
- Logs must not expose passwords, session IDs, API tokens, private LAN scan output, or internal credentials.
- Sensitive descriptive inventory fields, session metadata, and audit details are encrypted with AES-256-GCM using domain-separated keys.
- PostgreSQL migration dumps and persisted pre-restore backups are authenticated and encrypted before plaintext temporary files are removed.
- Encryption keys must be stored separately from database and backup volumes and kept stable across upgrades.
- Key rotation requires temporarily configuring the previous key as a decryption fallback.
- IP addresses, MAC addresses, CIDRs, account identifiers, and names remain queryable. Full database confidentiality requires host full-disk or encrypted-dataset protection.
- Redis and PostgreSQL are internal-only services in the supported Compose deployment and Redis authentication is mandatory outside local development.
- Managed deployments reject placeholder secrets and fail-open rate limiting at startup.

## Current references

- NIST post-quantum cryptography standards: FIPS 203, FIPS 204, FIPS 205.
- OWASP Password Storage Cheat Sheet.
- OWASP Session Management Cheat Sheet.
- OWASP Cryptographic Storage Cheat Sheet.
- OWASP Key Management Cheat Sheet.
