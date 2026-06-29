# AE NetScope v0.1.5-alpha

AE NetScope v0.1.5-alpha is an early public preview focused on navigation polish, account profile workflow, data export/restore consolidation, and user-management usability.

## Important

This is an **Early public preview, not production ready**.

Use this release only for controlled testing, homelab review, and non-sensitive trial environments. APIs, database schema, permission boundaries, deployment guidance, and UI behavior may change before v1.0.

AE NetScope is open source software licensed under the MIT License.

## Highlights

- Added a dedicated Profile view for account email changes, password-change access, role visibility, and permission review.
- Unified backups, JSON restore, and CSV exports into the Datos workflow.
- Removed the duplicate Respaldos frontend view.
- Improved dashboard deep links for recent devices and audit entries.
- Expanded global search with keyboard navigation, section shortcuts, hardware, notes, audit, and users.
- Simplified Settings to local UI preferences and Early Public Preview visibility.
- Kept version/release checks focused in Actualizaciones.
- Reworked user-management row actions into a compact actions menu.
- Improved footer links so Documentation opens the public README and Support opens the support page.

## Docker And TrueNAS Notes

- Container image target: `ghcr.io/whiteassassins/ae-netscope:v0.1.5-alpha`.
- Pre-release channel tag: `ghcr.io/whiteassassins/ae-netscope:alpha`.
- TrueNAS package target: `truenas/ix-dev/community/ae-netscope`.

## Known Limitations

- This alpha is still not production ready.
- Network scanning/discovery is not enabled.
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
