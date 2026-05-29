# Security model

AE NetScope is designed for self-hosted sysadmin environments and may contain sensitive network inventory data.

## Authentication baseline

- Passwords are never encrypted or stored in plain text.
- Password storage target: Argon2id.
- Login state target: server-side sessions.
- Session storage target: Redis.
- Session cookies must be HttpOnly.
- Production session cookies must be Secure.
- Session cookies should use SameSite Strict by default.
- Login, logout, failed login, lockout, role changes, and recovery events must be audited.
- Rate limiting and temporary lockout are required for authentication endpoints.
- Multi-factor authentication should be added after the first session-based login is stable.

## Authorization baseline

- Authorization must be enforced in the API, not only in the web UI.
- Initial roles: admin, operator, viewer.
- Dangerous actions should require fresh authentication.
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
- Backups should be encrypted outside the application before any production release that supports backups.

## Current references

- NIST post-quantum cryptography standards: FIPS 203, FIPS 204, FIPS 205.
- OWASP Password Storage Cheat Sheet.
- OWASP Session Management Cheat Sheet.
- OWASP Cryptographic Storage Cheat Sheet.
- OWASP Key Management Cheat Sheet.
