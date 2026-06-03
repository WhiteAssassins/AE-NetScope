# AE NetScope public release checklist

## Project identity

- Project name is consistent: AE NetScope.
- Repository description is short, clear, and accurate.
- License file is present.
- README explains what the project is and how to run it.
- README clearly states that the project is an early public preview and not production ready.
- The app displays an early preview warning.
- Screenshots or demo data do not expose real networks, hostnames, IPs, MACs, users, or locations.

## Security

- No `.env` file is committed.
- No `api/.local-admin.txt` file is committed.
- No local SQLite database under `api/var` is committed.
- `.env.example` contains only safe placeholder values.
- `.env.example` does not include real database passwords, Redis credentials, session secrets, internal hosts, or private domains.
- No private keys, tokens, passwords, cookies, API keys, certificates, or real credentials are committed.
- No personal LAN data, scan output, server names, serial numbers, or internal URLs are committed.
- No hardcoded production secrets exist in source code, tests, Docker files, or documentation.
- Authentication defaults are safe before any public release that includes backend access.
- First admin must be forced to change the generated password.
- Authenticated write endpoints must require CSRF protection.
- Role and permission checks must be enforced by the API.
- `npm run secrets:scan` passes.
- `npm run deps:audit` passes.

## Source hygiene

- Generated dependency folders are ignored: `node_modules`, `dist`, `build`, `coverage`.
- Local/generated files are not tracked: `.venv`, `venv`, `api/var`, `api/.local-*`, caches, logs, coverage output, and build output.
- `npm run tracked:check` passes.
- Lockfiles are committed for reproducible installs.
- The default branch builds from a clean checkout.
- Placeholder template text, unused sample assets, and framework boilerplate are removed.
- Public sample data is fictional and clearly safe to publish.

## Development experience

- The full local development stack starts from the repository root with one command.
- The app has a documented local URL.
- Build and lint commands pass.
- `test.cmd` passes from the repository root.
- The root start command runs without requiring private files.
- Environment variables have safe defaults or documented placeholders.

## Production readiness

- PostgreSQL is the production database target.
- Redis is the production cache and background job target.
- Database migrations are required before the first backend release.
- Background jobs are separated from request handling before scan/import features are enabled.
- Public deployments use a reverse proxy with HTTPS.
- Production logs do not expose credentials, tokens, private LAN scan data, or request secrets.
- Health checks exist for the web app, API, database, and Redis before the first hosted release.
- The app exposes the installed version and release channel for sysadmins.
- The app exposes a system status page for API, database, and Redis checks.

## First version scope

- Dashboard shell is present.
- Session-based login is present.
- Mandatory initial password change is present.
- Dashboard reads inventory data from the API.
- Navigation structure is present.
- Inventory summary cards are present.
- Recent devices table is present.
- Network summary panel is present.
- Subnet map panel is present.
- Active services panel is present.
- Change history panel is present.

## Before pushing public

- Run `git status --short` and review every tracked file.
- Run the build command from a clean install.
- Run `start-dev.cmd` from the repository root.
- Search for sensitive strings before publishing.
- Confirm the repository visibility and license choice.
- Create release notes with clear alpha status: "Early public preview, not production ready".
- Create the first public tag: `v0.1.0-alpha`.
