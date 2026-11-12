# AE NetScope v0.3.2-alpha

AE NetScope v0.3.2-alpha is a prerelease for the 0.3 line. Administrators can now enable a built-in MCP server from the web interface, and device types are stored as language-neutral keys. Dependencies are updated to their current releases.

## Important

This is an **early public preview, not production ready**. Version 0.3.0 remains the latest stable release. Install this prerelease explicitly if you want to test it before the next stable release.

Use controlled testing and homelab environments. Keep configured secrets stable and make a host-level backup before upgrading an installation containing important data.

AE NetScope is free and open source software released under the MIT License.

## New

- **Built-in MCP server.** Administrators can enable or disable it on the **MCP** page. When enabled, the inventory MCP tools are served at `/mcp` on the application's existing address and port, with no separate gateway or extra port. It is disabled by default, accepts only integration tokens, and records each change in the audit history. The standalone gateway remains available for stdio clients and other hosts.
- **MCP page** for managing integration tokens and finding client setup guidance.

## Changes

- **Language-neutral device types.** Device types are stored as keys such as `server`, `workstation` and `access_point`, and are translated in the interface. The API, imports, backups and MCP tools accept the previous Spanish labels and common English names and normalize them. Unknown types are rejected with the list of accepted values.

## Fixes

- Devices created through the API or MCP tools with English type names no longer show an untranslated badge or the wrong type in the edit form.
- Searches in the device, hardware, note and service lists, the inventory API and the MCP `search_inventory` tool also match device type labels such as "Access Point" or "Servidor".

## Security and Dependencies

- Updated the web runtime and tooling dependencies, including React, i18next 27, react-i18next 18, Vite and Vitest 5. TypeScript stays on 6.0 until typescript-eslint supports TypeScript 7.
- Raised the minimum versions of the API dependencies to their current releases.
- Pinned the transitive development dependencies `minimatch` and `source-map-js` to patched releases.
- Updated the GitHub Actions used in CI and container publishing to their current major versions.

## Upgrade Safety

- This release adds two database migrations, applied automatically by the container entrypoint:
  - `0013_device_type_keys` converts existing device types to keys. Custom types it does not recognize become `other`.
  - `0014_embedded_mcp_server` adds the built-in MCP server setting, disabled by default.
- No new environment variable is required.
- Keep `SESSION_SECRET` and any configured encryption keys unchanged. If rotating keys, follow the documented fallback-key procedure.
- Docker Compose users can select `ghcr.io/whiteassassins/ae-netscope:v0.3.2-alpha` (or use the updated `compose.yaml`), then run `docker compose pull` followed by `docker compose up -d`.
- Do not run `docker compose down -v` during an update because it deletes persistent volumes.
- Existing stable installations continue to follow the stable update channel. The prerelease must be selected explicitly.

## TrueNAS SCALE

- These changes do not modify the TrueNAS catalog definition, ports, datasets, or managed application configuration. The new migrations run inside the existing database.
- The built-in MCP server uses the app's existing web port, so no catalog change is needed to use it once the catalog adopts an image that includes it.
- TrueNAS users should update only through the TrueNAS Apps interface after the official catalog adopts this image. Publishing this prerelease does not update that catalog.

## Container

```text
ghcr.io/whiteassassins/ae-netscope:v0.3.2-alpha
```

Prerelease channel:

```text
ghcr.io/whiteassassins/ae-netscope:alpha
```

The `latest` tag remains on the stable release.

## Verification

- Regression coverage for the device type migration and normalization, the built-in MCP server toggle and endpoint, and device type label search.
- API suite: `179 passed`. Web suite: `135 passed`, with enforced coverage thresholds satisfied.
- Ruff, ESLint, TypeScript, frontend production build, release metadata validation, dependency audits and secret scan.

## Known Limitations

- Early-preview deployment precautions still apply.
- Active network discovery and scanning remain unavailable.
- Plain Docker automatic updates require explicit administrator configuration. TrueNAS uses its own Apps update workflow.
