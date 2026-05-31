# Contributing

Thanks for considering a contribution to AE NetScope.

AE NetScope is a self-hosted LAN inventory tool. Contributions should keep the project safe for public use, easy to deploy, and careful with sensitive sysadmin data.

## Ground rules

- Follow `CODE_OF_CONDUCT.md`.
- Follow `SECURITY.md` for security-sensitive reports.
- Do not commit secrets, credentials, real LAN data, customer data, private hostnames, MAC inventories, screenshots of real infrastructure, or `.env` files.
- Keep examples fictional and safe.
- Prefer small, focused pull requests.
- Keep public documentation free of private operational details.

## Development setup

From the repository root:

```bat
start-dev.cmd
```

Open:

```text
http://127.0.0.1:5173
```

The local admin credentials are generated into:

```text
api/.local-admin.txt
```

That file is local only and must never be committed.

## Checks before opening a pull request

Run:

```bat
api\.venv\Scripts\python.exe -m pytest api
api\.venv\Scripts\python.exe -m ruff check api
npm run build
npm run lint
```

If a check fails and you cannot fix it, mention it in the pull request.

## Backend guidelines

- Enforce permissions in the API, not only in the web UI.
- Keep write endpoints protected by CSRF checks.
- Validate user input with schemas.
- Record important inventory and admin actions in the audit log.
- Do not add custom cryptography.
- Keep production configuration driven by environment variables.

## Frontend guidelines

- Keep the interface consistent with the existing dashboard style.
- Build real workflows, not placeholder screens.
- Avoid exposing secrets or real infrastructure examples in UI text, seed data, or screenshots.
- Use existing components and patterns before adding new abstractions.

## Database and migrations

- Any schema change must include an Alembic migration.
- Migrations should be deterministic and safe to run in production.
- Do not put real data in migrations or seed files.

## Commit and pull request expectations

- Use clear commit messages.
- Explain why the change is needed.
- Include tests for backend behavior when practical.
- Include screenshots only when they are fully sanitized.
- Link related issues.
- Keep unrelated formatting and refactors out of feature PRs.

## Reporting vulnerabilities

Do not open public issues for vulnerabilities or sensitive findings.

Use the process in `SECURITY.md`.
