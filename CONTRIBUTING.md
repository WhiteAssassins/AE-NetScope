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
- AE NetScope is free and open source software. Use and contributions are governed by the MIT License in `LICENSE`.

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
npm --prefix web run test:i18n
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

## Translations

English in `web/src/i18n/locales/en.json` is the canonical language and runtime fallback.

Add or change interface keys in `en.json` first, then update every bundled locale in the same pull request.

To add a language:

1. Copy `en.json` to `web/src/i18n/locales/<language-code>.json`.
2. Keep every key and interpolation variable from the English file.
3. Translate values only; do not translate keys, product names, or placeholders such as `{{name}}`.
4. Save the file as UTF-8 without a byte-order mark.
5. Run `npm --prefix web run test:i18n`.

Language files are discovered automatically. The translation tests reject missing or extra keys, empty values, incompatible placeholders, malformed UTF-8, common mojibake, control characters, and suspicious invisible characters.

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

By submitting a pull request, patch, issue comment with code, design asset, documentation change, or other contribution, you agree that your contribution will be provided under the MIT License used by this project.

You confirm that you have the right to submit the contribution and that it does not include secrets, private infrastructure data, third-party code without permission, or content that violates another license.

## Reporting vulnerabilities

Do not open public issues for vulnerabilities or sensitive findings.

Use the process in `SECURITY.md`.
