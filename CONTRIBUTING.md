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
- Contributions are accepted under the project license in `LICENSE`.

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

## Contribution license

By submitting a pull request, patch, issue comment with code, design asset, documentation change, or other contribution, you grant the AE NetScope owner a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, copy, modify, publish, distribute, sublicense, and commercialize your contribution as part of AE NetScope.

You confirm that you have the right to submit the contribution and that it does not include secrets, private infrastructure data, third-party code without permission, or content that violates another license.

Submitting a contribution does not give you the right to sell, resell, sublicense, repackage, host as a commercial service, publish to marketplaces, or present AE NetScope as your own product.

## Reporting vulnerabilities

Do not open public issues for vulnerabilities or sensitive findings.

Use the process in `SECURITY.md`.
