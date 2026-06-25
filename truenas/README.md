# AE NetScope TrueNAS App Staging

This directory contains the first TrueNAS Apps packaging draft for AE NetScope.

The official TrueNAS catalog does not read app definitions from this repository. To submit AE NetScope, copy `ix-dev/community/ae-netscope` into a fork of `truenas/apps`, validate it there with the TrueNAS app tooling, and open a pull request against the official catalog.

## Current Target

- AE NetScope image: `ghcr.io/whiteassassins/ae-netscope:v0.1.4-alpha`
- App version: `0.1.4-alpha`
- TrueNAS train target: `community`
- Runtime dependencies: PostgreSQL 18 and Redis 8
- Default web port: `30080`

## Important Notes

- This package is not ready for upstream submission until it is validated inside a fork of `truenas/apps`.
- Redis is configured as an internal service with password authentication.
- Secrets are exposed as private TrueNAS questions and must not be hardcoded.
- The app uses the published GHCR image, not a local build.

## Upstream Checklist

1. Fork `https://github.com/truenas/apps`.
2. Copy `truenas/ix-dev/community/ae-netscope` from this repository into `ix-dev/community/ae-netscope` in the fork.
3. Run the TrueNAS Apps validation workflow/tooling from the fork.
4. Install the app in a TrueNAS test system.
5. Confirm first boot, migrations, health checks, login, restart, upgrade and uninstall.
6. Add screenshots and icon media using the official TrueNAS media process.
7. Open a PR against the official TrueNAS Apps repository.

## Pending Before PR

- Add a real AE NetScope icon URL to `app.yaml` and `item.yaml`.
- Add TrueNAS catalog screenshots.
- Validate the template from inside a fork of `truenas/apps`.
