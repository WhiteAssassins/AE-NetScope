# Inventory MCP integration

The optional MCP gateway exposes 15 inventory tools over stdio or Streamable HTTP.
It calls the regular inventory API, preserving its validation, role permissions,
relationship checks and audit events. The gateway needs no database credentials.

## Prepare the application

Install the API and gateway dependencies from the repository root:

```bash
python3 -m venv api/.venv
api/.venv/bin/python -m pip install -e 'api[mcp]'
```

Apply the database migrations using the same environment as the application:

```bash
cd api
.venv/bin/python -m alembic upgrade head
```

Start the application normally and sign in. In **Settings > MCP integrations**,
create a named token. Select **Read and write** to allow inventory creation and
editing. Your current password is required. Save the token when displayed;
it cannot be retrieved later. Tokens expire after 1–365 days, defaulting to 30.

A viewer can create only read tokens. Operators and administrators can create
write tokens. Tokens remain limited by their owner's current permissions, and
stop working when expired, revoked, or when the account is deactivated or
requires a password change. Revoke a token in the same Settings section.
Changing the password alone does not revoke integration tokens.

## TrueNAS SCALE catalog installations

The authoritative application definition is in
[the official TrueNAS Apps repository](https://github.com/truenas/apps/tree/master/ix-dev/community/ae-netscope).
The `truenas/` directory in this project contains an older staging package and is
not the configuration used by catalog installations.

For a catalog installation, keep using the application managed by TrueNAS. Run
the MCP gateway on the client computer or a separate machine, and point
`NETSCOPE_API_URL` at the app's existing web address and configured port. The
gateway's HTTP listener, if used, runs on that separate machine.

Do not install Python dependencies on the TrueNAS host or inside its managed app,
replace its Compose definition, or add a gateway process to its application
container. This integration does not require a new port, dataset, database user,
secret or question in the official catalog. Token records use the application's
existing PostgreSQL database. The normal API image does not install or import
the optional gateway SDK.

These features become available on TrueNAS only after an application image
containing them is released and adopted by the official catalog. An existing
published image does not gain them from local source changes. Apply that update
through TrueNAS Apps; the container entrypoint handles migrations automatically,
including the additive token-table migration. The manual installation and
migration commands above are for source deployments, not for the TrueNAS host.

Keep the existing database dataset and encryption keys. Integration tokens do
not enable or change the application's automatic updater.

## Local transport

Configure the client to run the absolute path to `api/.venv/bin/python` with
arguments `-m app.mcp.server`. Provide these environment variables to the process:

- `NETSCOPE_API_URL`: application root URL, such as `http://127.0.0.1:8080`.
  Do not append `/api`.
- `NETSCOPE_API_TOKEN`: the integration token created in Settings.

The API can be local, on a private LAN, or behind a VPN. Use HTTPS when sending
tokens over an untrusted network. Logs use stderr; stdout is reserved for MCP.

For Codex, add a server entry to your local configuration:

```toml
[mcp_servers.ae_netscope]
command = "/absolute/path/to/api/.venv/bin/python"
args = ["-m", "app.mcp.server"]
env = { NETSCOPE_API_URL = "http://127.0.0.1:8080" }
env_vars = ["NETSCOPE_API_TOKEN"]
```

For Claude Code, a local `.mcp.json` entry can use environment expansion:

```json
{
  "mcpServers": {
    "ae_netscope": {
      "type": "stdio",
      "command": "/absolute/path/to/api/.venv/bin/python",
      "args": ["-m", "app.mcp.server"],
      "env": {
        "NETSCOPE_API_URL": "http://127.0.0.1:8080",
        "NETSCOPE_API_TOKEN": "${NETSCOPE_API_TOKEN}"
      }
    }
  }
}
```

Claude Desktop uses the same command, arguments and environment fields in its
local MCP configuration. Supply the token using its local configuration or a
launcher that injects it; do not assume it expands `${NETSCOPE_API_TOKEN}`.
Keep configurations containing secrets outside the repository.

## HTTP transport

Run the gateway independently of the API:

```bash
export NETSCOPE_API_URL=http://127.0.0.1:8080
api/.venv/bin/ae-netscope-mcp --transport http --port 8765
```

The endpoint is `http://127.0.0.1:8765/mcp`. Every HTTP request must carry
`Authorization: Bearer <integration-token>`. Each caller's token is forwarded to
the API; HTTP mode never falls back to a process-wide token. Revocation and
permissions are checked on each request and again by the inventory API.

For Codex:

```toml
[mcp_servers.ae_netscope]
url = "http://127.0.0.1:8765/mcp"
bearer_token_env_var = "NETSCOPE_API_TOKEN"
```

For Claude Code, use an HTTP entry with a URL and an Authorization header:

```json
{
  "mcpServers": {
    "ae_netscope": {
      "type": "http",
      "url": "http://127.0.0.1:8765/mcp",
      "headers": { "Authorization": "Bearer ${NETSCOPE_API_TOKEN}" }
    }
  }
}
```

To bind outside loopback, specify the allowed Host values explicitly:

```bash
api/.venv/bin/ae-netscope-mcp --transport http --host 0.0.0.0 \
  --allowed-host 'netscope.example.com' --allowed-host 'netscope.example.com:*'
```

Terminate HTTPS at your reverse proxy and preserve the allowed Host. The gateway
checks Host and Origin against this allowlist. Keep it reachable only by the
intended clients. OAuth discovery and browser authorization are not implemented;
Claude web's remote connector flow is outside this release's tested support.

## Tools and behavior

| Tool | Operation |
| --- | --- |
| `search_inventory` | Search devices, interfaces, IP addresses, networks, VLANs or services. |
| `get_device` | Read device details, hardware, notes, interfaces and IP assignments. |
| `get_dashboard_summary` | Read totals and subnet utilization. |
| `get_inventory_quality` | Read passive inventory consistency findings. |
| `create_device`, `update_device` | Create or edit device records. |
| `add_device_interface` | Add an interface, optionally assigning a MAC and IP. |
| `create_ip_address`, `update_ip_address` | Register or assign IP addresses. |
| `create_network`, `update_network` | Create or edit subnets. |
| `create_vlan`, `update_vlan` | Create or edit VLANs. |
| `create_service`, `update_service` | Create or edit device services. |

Write tools accept a `payload` object using the API's inventory schemas. Updates
also accept `record_id`. Omitted update fields remain unchanged. Use internal
record IDs for relationships: `vlan_id` on a network is the VLAN record's `id`,
while `vlan_id` on a VLAN payload is its VLAN number.

Search filters and pages in SQL, returns at most 100 records per page (25 by
default), and includes `total` and `next_offset`. Ordering is by record ID.
Names, types, status, IP/MAC addresses, CIDRs, VLAN numbers and service ports are
searchable as applicable to each category. Encrypted notes and hardware fields
are retrieved through device details rather than searched. Search strings are
literal substrings; SQL wildcard characters are escaped. Text longer than 2048
characters is truncated in search results. Device detail returns full text.

Tokens cannot delete records, export or restore backups, manage users, change
settings or mint other tokens. Stored notes are data, not tool instructions.
Write events use the token owner's identity in the existing audit log.

## Verification

```bash
api/.venv/bin/python -m pip install -e 'api[dev,mcp]'
api/.venv/bin/python -m pytest api/tests
api/.venv/bin/python -m ruff check api
npm --prefix web test
npm --prefix web run lint
npm --prefix web run build
```

Protocol tests initialize sessions, discover tools and exercise inventory writes
through actual stdio and Streamable HTTP transports. They also check that a
read-only HTTP caller cannot inherit another caller's write access.
