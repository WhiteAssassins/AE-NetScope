# AE NetScope v0.1.8-alpha

AE NetScope v0.1.8-alpha is an early public preview focused on stronger account administration, passive inventory-quality analysis, operational visibility, release information, and privacy controls for self-hosted installations.

## Important

This is an **Early public preview, not production ready**.

Use this release only for controlled testing, homelab review, and non-sensitive trial environments. APIs, database schema, permissions, deployment guidance, translations, and UI behavior may change before v1.0.

AE NetScope is free and open source software released under the MIT License.

## Highlights

- Added passive inventory-quality checks with a documentation score, categorized findings, relationship summaries, and direct navigation to affected records.
- Added a dedicated About page covering the project, creator, AE White Devs, MIT license, repository, support, and installed version.
- Added repository statistics, system status, version visibility, update state, and improved notifications to the top bar.
- Added regional preferences for time zone, date layout, and 12/24-hour display.
- Added session management, TOTP, WebAuthn/passkeys, maintenance mode, and update-attempt history.
- Improved user administration with identity and role editing, activation controls, MFA/passkey visibility, session counts, and individual session revocation.
- Improved Updates with release history and on-demand GitHub changelog viewing.
- Added an administrative crawler policy that blocks search-engine indexing by default through `robots.txt`, `X-Robots-Tag`, and HTML metadata.
- Expanded English and Spanish coverage across inventory, administration, support, updates, quality, and account workflows.
- Added extensive API and web regression coverage for the new workflows.
- Updated `brace-expansion`, `postcss`, and `nanoid` to patched releases after dependency security advisories.

## Search Engine Privacy

- New installations block search-engine indexing by default.
- Administrators can manage the policy from **Settings > Administration > Search engine visibility**.
- The backend publishes a dynamic `/robots.txt` policy and `X-Robots-Tag` response header.
- The built web application keeps its robots metadata synchronized with the saved policy.
- If the database or policy lookup fails, AE NetScope fails closed and continues blocking indexing.

## Upgrade Safety

- Migration `0006_user_security_and_settings` adds regional preferences, account-security fields, passkey tables, maintenance settings, and update history without deleting existing data.
- Migration `0007_language_length` expands language identifiers from 16 to 64 characters.
- Migration `0008_search_indexing` adds one non-null boolean policy with the safe default `false`.
- Existing users, inventory, sessions, audit history, PostgreSQL data, Redis data, and backup volumes are preserved.
- Docker Compose users should update with `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- TrueNAS users should update through the TrueNAS Apps interface.

## Docker And TrueNAS

- Container image target: `ghcr.io/whiteassassins/ae-netscope:v0.1.8-alpha`.
- Pre-release channel tag: `ghcr.io/whiteassassins/ae-netscope:alpha`.
- The staged TrueNAS package targets AE NetScope `0.1.8-alpha` with package revision `1.0.2`.
- TrueNAS-managed installations continue to use the TrueNAS update workflow rather than in-app automatic updates.

## Known Limitations

- This alpha is still not production ready.
- Network scanning and active discovery are not enabled.
- In-app automatic updates remain disabled unless explicitly configured for plain Docker deployments.
- PostgreSQL migration dumps are permission-restricted but not encrypted by AE NetScope; use encrypted host storage.
- Search-engine directives are advisory and do not replace authentication or private-network access controls.
- Use only with non-sensitive demo, homelab, or test data.

## Verification

Release validation completed before publishing:

- API tests: `96 passed`.
- Web tests: `102 passed`.
- API and web lint passed.
- Frontend production build passed.
- npm and Python dependency audits report no known vulnerabilities.
- Alembic upgrade and schema drift checks passed.
- Release metadata validation passed.
- Dynamic `robots.txt`, `X-Robots-Tag`, and HTML metadata behavior passed automated tests.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.1.8-alpha
```
