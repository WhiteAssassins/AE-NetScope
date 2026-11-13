# AE NetScope v0.3.3-alpha

AE NetScope v0.3.3-alpha is a bug-fix prerelease for the 0.3 line. It tightens inventory validation, fixes sign-in lockout and password-change edge cases, makes exported backups restorable, corrects release update detection, and improves several interface details.

## Important

This is an **early public preview, not production ready**. Version 0.3.0 remains the latest stable release. Install this prerelease explicitly if you want to test these fixes before the next stable release.

Use controlled testing and homelab environments. Keep configured secrets stable and make a host-level backup before upgrading an installation containing important data.

AE NetScope is free and open source software released under the MIT License.

## Fixed

### Inventory

- Creating a device or adding an interface now validates the IP address against the selected subnet. A missing subnet returns `404` and an address outside it returns `422`, matching the IP address endpoints.
- IPv4 network and broadcast addresses are rejected as host IP addresses and gateways. `/31` and `/32` subnets are not affected, and existing records are not changed.
- Partial updates reject `null` for required fields with `422` instead of a misleading conflict or, for services, a server error.
- An explicit `null` now detaches an IP address from its subnet, or clears a subnet gateway, in the same request that changes the address or CIDR.
- IP addresses and subnets are listed in numeric order, so `10.0.0.2` comes before `10.0.0.11`.
- IP assignment types are limited to `static`, `dhcp` and `reserved`, in any letter case.
- A service now reports the same primary IP address as its device.
- Whitespace-only device notes are stored as empty and no longer counted on the dashboard.

### Backups and exports

- Backups exported from any valid inventory can be restored again, including device names that differ only in case and repeated services on a device.
- Restored interfaces get the same MAC address normalization as the API.
- CSV exports expand nested values into separate columns, such as `vlan.vlan_id` for subnets.
- The pre-restore backup download works in browsers that ignore links detached from the page.

### Accounts and security

- An expired account lockout resets the failed sign-in counter, so one mistyped password no longer locks the account again.
- Changing a password requires a new value, so a temporary password issued by an administrator cannot stay in use after the mandatory change.
- Initial setup requires a username with at least two non-whitespace characters.

### Updates and releases

- Prerelease installations are offered a newer stable release, such as 0.4.0 over 0.3.3-alpha.
- The container publishing workflow stops when the release tag does not match `VERSION` or the release channel.

### Interface

- "Your session expired" is shown only on browsers that were signed in, not to first-time visitors.
- Hardware warranties stay valid through the whole local day of their expiry date.
- The technical notes card on the dashboard opens the notes page.
- The last change of recent devices uses the user's time zone and date format.
- Integration token audit events are translated.
- Notifications keep working when browser storage is unavailable.

## Dependencies

- Updated jsdom to 31 and refreshed the web lockfile to the latest compatible releases.
- Raised the minimum versions of FastAPI, pydantic-settings, pytest-asyncio and Ruff.
- The web toolchain now declares Node.js `^24.15.0 || >=26.0.0`. The container build already uses the current Node.js 24 release.

## Upgrade Safety

- This release adds the migration `0015_assignment_type_values`, applied automatically by the container entrypoint. It normalizes the letter case of existing IP assignment types; unsupported values become `static`.
- No new environment variable, port, or volume is required.
- Keep `SESSION_SECRET` and any configured encryption keys unchanged. If rotating keys, follow the documented fallback-key procedure.
- Docker Compose users can select `ghcr.io/whiteassassins/ae-netscope:v0.3.3-alpha` (or use the updated `compose.yaml`), then run `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- Existing stable installations continue to follow the stable update channel. The prerelease must be selected explicitly.

## TrueNAS SCALE

- These changes do not modify the TrueNAS catalog definition, ports, datasets, or managed application configuration. The new migration runs inside the existing database.
- The container runtime contract remains compatible with the official `truenas/apps` definition. Validation on a physical TrueNAS SCALE appliance remains outstanding.
- TrueNAS users should update only through the TrueNAS Apps interface after the official catalog adopts this image. Publishing this prerelease does not update that catalog.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.3.3-alpha
```

Prerelease channel:

```text
ghcr.io/whiteassassins/ae-netscope:alpha
```

The `latest` tag remains on the stable release.

## Verification

- Regression coverage for every fix listed above, including the assignment type migration.
- API suite: `199 passed`. Web suite: `143 passed`, with enforced coverage thresholds satisfied.
- Ruff, ESLint, TypeScript, frontend production build, release metadata validation, dependency audits, and secret scan.

## Known Limitations

- Early-preview deployment precautions still apply.
- Active network discovery and scanning remain unavailable.
- OAuth discovery and browser-based remote connector authorization are not implemented by the MCP server.
- Plain Docker automatic updates require explicit administrator configuration. TrueNAS uses its own Apps update workflow.
