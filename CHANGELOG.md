# Changelog

All notable changes to AE NetScope will be documented in this file.

## v0.1.2-alpha - 2026-06-15

### Added

- Source-available proprietary license alignment across public project documentation.
- Import preview for JSON inventory backups before replacing current data.
- Stronger backup validation for duplicate records and broken VLAN, network, interface, device, IP, and service references.
- Automatic pre-restore backup returned by the API and downloaded from the web UI.
- Production hardening with security headers, production-secure cookies, HSTS controls, and import size limits.
- Dedicated update page with installed version, latest GitHub release, status, release link, and upgrade checklist.
- Alembic migration tests for single-head history and clean upgrade to `head`.
- README production guidance for backup/restore policy and SQLite local to PostgreSQL production migration.

### Status

- Early public preview.
- Potentially usable for controlled testing with non-sensitive data.
- Not production ready.
- Intended for homelab, review, and limited trial environments.

## v0.1.1-alpha - 2026-06-03

### Added

- Internal version source, API version endpoint, installed-version display, and GitHub release update check.
- System status view with API, database, Redis, environment, release channel, and last-check details.
- Account email change flow with current-password confirmation and audit logging.

### Status

- Early public preview.
- Not production ready.
- Intended for testing, feedback, and controlled non-sensitive environments only.

## v0.1.0-alpha - 2026-06-03

### Added

- Initial public alpha of AE NetScope.
- FastAPI backend with session authentication, CSRF protection, roles, permissions, audit events, health checks, Redis-backed rate limiting, and setup flow for the first admin.
- React/Vite frontend with dashboard, login, user management, roles and permissions, settings, support, backups, technical notes, and inventory views.
- LAN inventory management for devices, IPs/MACs, subnets, VLANs, services, and hardware metadata.
- JSON/CSV export and JSON restore for inventory backups.
- Test coverage for API and frontend, CI workflow, coverage reports, dependency audits, secret scanning, and tracked-artifact checks.
- Public project documents: README, license, contributing guide, code of conduct, security policy, support policy, issue templates, and pull request template.

### Status

- Early public preview.
- Not production ready.
- Intended for testing, feedback, and controlled non-sensitive environments only.
