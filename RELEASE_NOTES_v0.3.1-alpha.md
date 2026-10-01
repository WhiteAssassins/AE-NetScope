# AE NetScope v0.3.1-alpha

AE NetScope v0.3.1-alpha is a security-focused prerelease for the 0.3 line. It protects locally written credentials and decrypted backup files and prevents account data from carrying over between browser sessions.

## Important

This is an **early public preview, not production ready**. Version 0.3.0 remains the latest stable release. Install this prerelease explicitly if you want to test the security fixes before the next stable release.

Use controlled testing and homelab environments. Keep configured secrets stable and make a host-level backup before upgrading an installation containing important data.

AE NetScope is free and open source software released under the MIT License.

## Security Fixes

- Decrypted backup output and temporary plaintext backup files are created with owner-only permissions immediately, even under a permissive POSIX umask.
- Initial administrator credentials are written to a new owner-only file before the account is committed. Setup refuses to overwrite an existing file or follow a symlink, and cleans up a newly created credential file if setup fails.
- Switching accounts clears cached user-management and audit data. Late responses from an earlier session cannot refill those caches, and an in-session loss of permissions removes privileged data from the interface.
- Updated the transitive development dependency `brace-expansion` to a patched release.

## Upgrade Safety

- No database migration or new environment variable is required for an existing 0.3.0 installation.
- Keep `SESSION_SECRET` and any configured encryption keys unchanged. If rotating keys, follow the documented fallback-key procedure.
- Docker Compose users can select `ghcr.io/whiteassassins/ae-netscope:v0.3.1-alpha` (or use the updated `compose.yaml`), then run `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- Existing stable installations continue to follow the stable update channel. The prerelease must be selected explicitly.

## TrueNAS SCALE

- These changes do not modify the TrueNAS catalog definition, database schema, ports, datasets, or managed application configuration.
- The container runtime contract remains compatible with the official `truenas/apps` definition. Validation on a physical TrueNAS SCALE appliance remains outstanding.
- TrueNAS users should update only through the TrueNAS Apps interface after the official catalog adopts this image. Publishing this prerelease does not update that catalog.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.3.1-alpha
```

Prerelease channel:

```text
ghcr.io/whiteassassins/ae-netscope:alpha
```

The `latest` tag remains on the stable release.

## Verification

- Regression coverage for backup file permissions, initial administrator credential creation, account switching, late responses, and in-session permission changes.
- API suite: `174 passed`. Web suite: `127 passed`, with enforced coverage thresholds satisfied.
- Ruff, ESLint, frontend production build, release metadata validation, dependency audits, secret scan, and container build.

## Known Limitations

- Early-preview deployment precautions still apply.
- Active network discovery and scanning remain unavailable.
- Plain Docker automatic updates require explicit administrator configuration. TrueNAS uses its own Apps update workflow.
