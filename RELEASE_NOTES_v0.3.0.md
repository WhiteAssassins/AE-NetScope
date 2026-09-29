# AE NetScope v0.3.0

AE NetScope v0.3.0 moves to the stable release channel and adds optional MCP inventory integration, scoped access tokens, inventory correctness fixes, and updated dependencies.

## Important

The project remains an **early public preview, not production ready**. The stable release channel identifies the published version; it does not extend the deployment validation described below.

Use controlled testing and homelab environments. Keep configured secrets stable and make a host-level backup before upgrading an installation containing important data.

AE NetScope is free and open source software released under the MIT License.

## Highlights

- Added an optional MCP gateway with 15 tools over stdio and Streamable HTTP.
- Added inventory search, full device details, dashboard summaries, and passive inventory-quality checks.
- Added tools to create or edit devices, IP addresses, networks, VLANs and services, and to add device interfaces.
- Added named integration tokens managed in Settings, with expiration, revocation, and read-only or read/write access.
- Kept inventory validation, relationships, role permissions, and audit events enforced by the existing API.
- Added English and Spanish integration settings and [gateway setup documentation](https://github.com/WhiteAssassins/AE-NetScope/blob/v0.3.0/docs/mcp.md).

## Fixed

- Restored audit-message search for encrypted audit records.
- Made the primary address reported for devices with multiple interfaces consistent.
- Rejected network CIDR changes that would leave assigned IP addresses outside the new range.
- Prevented downstream application errors from re-entering the maintenance middleware fallback.
- Normalized update-command release tags and rejected supplied blank tags.
- Preserved browser sessions and CSRF checks behind proxies forwarding Basic, Digest, or unrelated Bearer credentials.
- Removed an unused browser-side GitHub request blocked by the application content security policy.
- Cached the derived field-encryption key to avoid repeated derivation while reading encrypted records.

## Security And Dependencies

- Integration tokens are stored as hashes and checked against the owner's current permissions and account state.
- Tokens cannot delete inventory, export or restore backups, manage users, change settings, or create other tokens.
- Invalid recognized integration credentials cannot fall back to a browser session.
- HTTP gateway requests use each caller's token and never inherit a process-wide token.
- Updated API and web dependencies, including patched transitive `browserslist` and `undici` releases.
- Kept the optional gateway SDK out of the normal application container.

## Upgrade Safety

- Added the additive migration `0012_integration_tokens` for token storage. Container startup applies migrations automatically.
- Existing users, inventory, encrypted records, sessions, audit records, database data, cache data, and persistent volumes are preserved by the upgrade path.
- Keep `SESSION_SECRET` and any configured encryption keys unchanged. If rotating keys, follow the documented fallback-key procedure.
- Docker Compose users should first set the application image to `ghcr.io/whiteassassins/ae-netscope:v0.3.0` (or use the updated `compose.yaml`), then run `docker compose pull` followed by `docker compose up -d`.
- Existing alpha installations continue checking the prerelease channel. Moving to the stable channel requires installing this release explicitly, or waiting for the corresponding TrueNAS catalog update.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- TrueNAS users should update only through the TrueNAS Apps interface after the official catalog adopts this image.

## TrueNAS SCALE

- Compatibility was checked against the official `truenas/apps` definition, not the older staging package in this repository.
- Run the MCP gateway on the client computer or another host and connect it to the existing application web address.
- The gateway requires no new port, dataset, database user, or integration secret in the managed application.
- Isolated container validation used the official catalog's PostgreSQL 18.6 and Valkey 9.1.2 image digests, including upgrade from migration 0011, encrypted inventory preservation, browser login, token writes, restart persistence, and UID/GID 568 and 1000 with a read-only root filesystem.
- Validation on a physical TrueNAS SCALE appliance remains outstanding. Publishing this release does not automatically update the official catalog.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.3.0
```

Stable channel:

```text
ghcr.io/whiteassassins/ae-netscope:latest
```

The `alpha` tag remains the prerelease channel and is not advanced by this stable release.

## Verification

- API suite: `169 passed`, with `88.25%` coverage.
- Web suite: `124 passed`, with enforced statement, function and line coverage thresholds satisfied.
- Regression coverage includes MCP protocol, token authorization, proxy sessions, translations, and stable-channel update selection.
- Ruff, ESLint, frontend production build, and container build.
- Dependency audits, secret scanning, tracked-artifact checks, release metadata alignment, and migration checks.

## Known Limitations

- Early-preview deployment precautions still apply.
- Active network discovery and scanning remain unavailable.
- OAuth discovery and browser-based remote connector authorization are not implemented by the MCP gateway.
- Encrypted notes and hardware fields are available through device details rather than inventory text search.
- Plain Docker automatic updates require explicit administrator configuration. TrueNAS uses its own Apps update workflow.
- Host or dataset encryption remains recommended for searchable identifiers stored as queryable database fields.
