# AE NetScope v0.3.4-alpha

AE NetScope v0.3.4-alpha is a large bug-fix prerelease for the 0.3 line. It hardens account security and sessions, protects encrypted data during key rotation, tightens inventory validation, makes the dashboard and audit log accurate on larger inventories, and fixes many interface details across the administration panel and the inventory views.

## Important

This is an **early public preview, not production ready**. Version 0.3.0 remains the latest stable release. Install this prerelease explicitly if you want to test these fixes before the next stable release.

Use controlled testing and homelab environments. Keep configured secrets stable and make a host-level backup before upgrading an installation containing important data.

AE NetScope is free and open source software released under the MIT License.

## Fixed

### Accounts, sessions and security

- An authenticator code used to confirm or disable TOTP cannot be replayed to sign in. TOTP can no longer be disabled when it was never enabled, or confirmed again while it is active.
- Changing or resetting a password, resetting multi-factor authentication or deactivating an account revokes the account's integration tokens.
- Every tab of a session shares the same CSRF token, so opening a new tab no longer breaks saves in the others.
- Sign-out ends the session even without a CSRF token. The interface says so when the server could not be reached, and the mandatory password change screen offers signing out.
- When a session ends while the app is open, the interface returns to sign-in with an explanation.
- During maintenance, signed-in users stay in the app and see the maintenance notice, also on the sign-in screen.
- Authenticator codes are accepted with a space or hyphen, as authenticator apps display them.
- A pasted setup token with accented characters is rejected with a clear error instead of a server error. The first administrator keeps the language and time zone of the setup screen.
- Passwords made only of spaces, time zones that browsers cannot use, and blank integration token or passkey names are rejected.
- A passkey sign-in clears earlier failed password attempts, and outdated password hashes are upgraded from every password prompt.
- Failed password checks when creating an integration token are audited. Repeated revocations, deactivations and unchanged user updates no longer create duplicate audit events, and every audit event records the client address.
- Sign-in, password change and setup errors explain rate limits, outages, unsupported passkeys and rejected passwords instead of reporting invalid credentials.

### Data protection, backups and updates

- After a key rotation without its fallback key, protected values that no key can decrypt are left untouched instead of being re-encrypted and lost. Adding the previous key to `DATA_DECRYPTION_FALLBACK_KEYS` recovers them, and requests that need them answer `503` with that instruction.
- Startup no longer decrypts every protected value when no key rotation is configured.
- The JSON backup downloads as a file. The data page warns when a backup of the current inventory exceeds the restore limit, and rejected restores explain why and confirm the inventory was not changed.
- Backups exported by earlier versions still restore when they contain values the stricter input rules now reject.
- Automatic updates start only for published releases newer than the installed version, ask for confirmation, and explain when another update is running. Untagged update commands are reconciled from their starting version.
- The release check reads a full page of GitHub releases, so an older stable release stays visible behind many prereleases. Release history is requested by channel, and release screenshots are offered as links.

### Inventory

- Names are trimmed and cannot be blank. Optional details lose surrounding spaces, and blank ones are stored as empty.
- Device, subnet and service statuses are limited to the values the interface offers, accepting common Spanish names and any letter case.
- Warranty dates must use `YYYY-MM-DD`, service protocols are required and stored in lowercase, and MAC addresses are accepted with hyphens, Cisco dotted groups or no separators.
- IP addresses of deactivated devices are reported as inactive. A subnet cannot be set for an interface without an IP address.
- Interface, address and service changes update the device's last change.
- Inventory save errors explain the reason, such as an IP outside the subnet or IPs a CIDR change would leave out, and form fields are limited to the lengths the API accepts.
- The MCP server explains validation and conflict errors instead of a generic message.

### Dashboard, quality and audit

- The dashboard lists five recent devices even when devices have several addresses, chooses the busiest subnet from every subnet, and summarizes service status by relevance.
- Subnet and VLAN address counts use grouped queries, and the columns used by inventory and audit queries are indexed.
- The audit log searches event types and actors across the whole history, filters by group through the API, and no longer stays loading when it cannot be read.
- Your own actions no longer count as unread notifications.

### Interface

- When part of the inventory cannot be loaded, the last loaded data stays visible with a warning instead of empty lists.
- Device details report network failures, prevent repeated actions and always show the device opened last. Deactivating a device asks for confirmation.
- Opening the same record again from search or notifications works, and saving another record no longer jumps back to the record reached through navigation.
- Pages keep working with an unsupported time zone or an invalid date, and the preferred initial view applies after signing in.
- Regional language variants such as `es-MX` use the bundled language, and a first visit follows the browser language.
- Hardware lists printers, phones, sensors, IoT and access-control devices, and expired warranties stand apart from those expiring soon.
- Temporary passwords can be copied on installations reached over plain HTTP.
- Many smaller fixes to messages, filters, status colors and confirmations across users, settings, notes, topology, services and VLANs.

## Documentation

- Documented `FORWARDED_ALLOW_IPS` for installations behind a reverse proxy, and passed it through `compose.yaml` and `.env.example` with the existing default of `127.0.0.1`.

## Dependencies

- Updated the web dependencies to their latest compatible releases, including i18next, react-i18next, Recharts, Lucide, ESLint, typescript-eslint and Testing Library.
- Raised the minimum versions of FastAPI, SQLAlchemy, email-validator and pwdlib to their current releases.

## Upgrade Safety

- This release adds the migration `0016_foreign_key_indexes`, applied automatically by the container entrypoint. It only adds indexes and does not change stored data.
- No new environment variable, port, or volume is required.
- Existing integration tokens keep working until the account's password is changed or reset. Create a new token for MCP clients after changing a password.
- A saved `Factory` or `localtime` time zone must be replaced the next time the regional settings are saved.
- A device whose stored warranty is not a date must have it corrected before the device form can be saved again.
- Browser tabs open during the upgrade may need one reload to receive the new session-bound CSRF token.
- Keep `SESSION_SECRET` and any configured encryption keys unchanged. If rotating keys, follow the documented fallback-key procedure.
- Docker Compose users can select `ghcr.io/whiteassassins/ae-netscope:v0.3.4-alpha` (or use the updated `compose.yaml`), then run `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- Existing stable installations continue to follow the stable update channel. The prerelease must be selected explicitly.

## TrueNAS SCALE

- These changes do not modify the TrueNAS catalog definition, ports, datasets, or managed application configuration. The new migration runs inside the existing database.
- The container runtime contract remains compatible with the official `truenas/apps` definition. Validation on a physical TrueNAS SCALE appliance remains outstanding.
- TrueNAS users should update only through the TrueNAS Apps interface after the official catalog adopts this image. Publishing this prerelease does not update that catalog.
- `MAX_IMPORT_JSON_BYTES` keeps its current value; the data page now warns when a backup would exceed it.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.3.4-alpha
```

Prerelease channel:

```text
ghcr.io/whiteassassins/ae-netscope:alpha
```

The `latest` tag remains on the stable release.

## Verification

- Regression coverage for every fix listed above, each confirmed to fail without its fix.
- API suite: `296 passed`. Web suite: `212 passed`, with enforced coverage thresholds satisfied.
- Ruff, ESLint, TypeScript, frontend production build, release metadata validation, and secret scan.

## Known Limitations

- Early-preview deployment precautions still apply.
- Active network discovery and scanning remain unavailable.
- Interfaces cannot be renamed or removed after creation; delete and recreate the device to change them.
- OAuth discovery and browser-based remote connector authorization are not implemented by the MCP server.
- Plain Docker automatic updates require explicit administrator configuration. TrueNAS uses its own Apps update workflow.
- The web dependency audit reports picomatch advisory GHSA-fc5q-39xc-vjpf, which has no fixed release yet.
