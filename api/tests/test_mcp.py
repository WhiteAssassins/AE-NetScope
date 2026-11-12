import asyncio
import os
import socket
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import uvicorn
from sqlalchemy import select

from app.models.integration import IntegrationToken
from app.models.user import User

pytest.importorskip("mcp")
from mcp import ClientSession, StdioServerParameters  # noqa: E402
from mcp.client.stdio import stdio_client  # noqa: E402
from mcp.client.streamable_http import streamable_http_client  # noqa: E402
from mcp.shared.memory import create_connected_server_and_client_session  # noqa: E402

from app.main import app  # noqa: E402
from app.mcp.server import AuthenticateHTTP, InventoryClient, create_server  # noqa: E402


async def token_for(client, csrf, write=True):
    result = await client.post(
        "/api/integrations/tokens",
        headers={"X-CSRF-Token": csrf},
        json={
            "name": "Protocol test",
            "password": "integration-test-password",
            "allow_write": write,
        },
    )
    assert result.status_code == 201
    return result.json()["token"]


@asynccontextmanager
async def serve(application, lifespan="on"):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(application, log_level="error", lifespan=lifespan))
    task = asyncio.create_task(server.serve(sockets=[listener]))
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if task.done():
                    await task
                await asyncio.sleep(0.01)
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, 10)
        listener.close()


async def test_protocol_tools_create_related_inventory_and_validate(integration_api):
    client, csrf, _ = integration_api
    token = await token_for(client, csrf)
    server = create_server(InventoryClient("http://test", token, httpx.ASGITransport(app=app)))
    async with create_connected_server_and_client_session(server) as session:
        tools = (await session.list_tools()).tools
        assert len(tools) == 15
        assert all(tool.annotations is not None for tool in tools)
        vlan = await session.call_tool("create_vlan", {"payload": {"vlan_id": 20, "name": "LAN"}})
        assert not vlan.isError
        network = await session.call_tool(
            "create_network",
            {
                "payload": {
                    "name": "LAN",
                    "cidr": "10.0.20.0/24",
                    "vlan_id": vlan.structuredContent["id"],
                }
            },
        )
        assert not network.isError
        device = await session.call_tool(
            "create_device",
            {
                "payload": {
                    "name": "switch",
                    "device_type": "switch",
                    "interface": {
                        "name": "eth0",
                        "ip_address": "10.0.20.2",
                        "network_id": network.structuredContent["id"],
                    },
                }
            },
        )
        assert not device.isError
        device_id = device.structuredContent["id"]
        service = await session.call_tool(
            "create_service",
            {
                "payload": {
                    "device_id": device_id,
                    "name": "HTTPS",
                    "port": 443,
                }
            },
        )
        assert not service.isError
        ip = await session.call_tool(
            "create_ip_address",
            {
                "payload": {
                    "address": "10.0.20.10",
                    "network_id": network.structuredContent["id"],
                }
            },
        )
        assert not ip.isError
        interface = await session.call_tool(
            "add_device_interface",
            {
                "device_id": device_id,
                "payload": {
                    "name": "eth1",
                    "mac_address": "02:00:00:00:00:01",
                    "ip_address": "10.0.20.3",
                    "network_id": network.structuredContent["id"],
                },
            },
        )
        assert not interface.isError
        for tool, record_id, payload in [
            ("update_device", device_id, {"notes": "Updated notes"}),
            ("update_vlan", vlan.structuredContent["id"], {"name": "Updated LAN"}),
            ("update_network", network.structuredContent["id"], {"gateway": "10.0.20.1"}),
            ("update_service", service.structuredContent["id"], {"port": 8443}),
            ("update_ip_address", ip.structuredContent["id"], {"assignment_type": "reserved"}),
        ]:
            updated = await session.call_tool(tool, {"record_id": record_id, "payload": payload})
            assert not updated.isError
            for key, value in payload.items():
                assert updated.structuredContent[key] == value
        secondary = await session.call_tool(
            "search_inventory",
            {
                "resource": "devices",
                "query": "10.0.20.3",
            },
        )
        assert secondary.structuredContent["total"] == 1
        search = await session.call_tool(
            "search_inventory", {"resource": "devices", "query": "switch"}
        )
        assert search.structuredContent["total"] == 1
        detail = await session.call_tool("get_device", {"device_id": device_id})
        assert len(detail.structuredContent["interfaces"]) == 2
        invalid = await session.call_tool(
            "create_service",
            {
                "payload": {
                    "device_id": device_id,
                    "name": "bad",
                    "port": 70000,
                }
            },
        )
        assert invalid.isError
        duplicate = await session.call_tool(
            "create_vlan", {"payload": {"vlan_id": 20, "name": "dup"}}
        )
        assert duplicate.isError
        denied = await session.call_tool("search_inventory", {"resource": "users"})
        assert denied.isError
        bad_limit = await session.call_tool(
            "search_inventory", {"resource": "devices", "limit": 101}
        )
        assert bad_limit.isError


async def test_stdio_transport(integration_api):
    client, csrf, _ = integration_api
    token = await token_for(client, csrf)
    async with serve(app, lifespan="off") as base_url:
        params = StdioServerParameters(
            command=sys.executable,
            args=["-m", "app.mcp.server"],
            env={
                **os.environ,
                "NETSCOPE_API_URL": base_url,
                "NETSCOPE_API_TOKEN": token,
            },
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                assert len((await session.list_tools()).tools) == 15
                result = await session.call_tool(
                    "create_device",
                    {
                        "payload": {
                            "name": "stdio-device",
                            "device_type": "server",
                        }
                    },
                )
                assert not result.isError
    assert any(
        row["name"] == "stdio-device" for row in (await client.get("/api/inventory/devices")).json()
    )


async def test_http_transport_authentication_and_per_request_identity(integration_api):
    client, csrf, _ = integration_api
    write_token = await token_for(client, csrf)
    read_token = await token_for(client, csrf, False)
    backend = InventoryClient("http://test", write_token, httpx.ASGITransport(app=app))
    server = create_server(backend)
    application = AuthenticateHTTP(server.streamable_http_app(), backend)
    async with serve(application) as base_url:
        async with httpx.AsyncClient() as http:
            for headers in ({}, {"Authorization": "Bearer invalid"}):
                response = await http.post(f"{base_url}/mcp", headers=headers, json={})
                assert response.status_code == 401
        async with streamable_http_client(
            f"{base_url}/mcp",
            http_client=httpx.AsyncClient(
                headers={"Authorization": f"Bearer {write_token}"},
            ),
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    "create_vlan", {"payload": {"vlan_id": 30, "name": "HTTP"}}
                )
                assert not result.isError
        async with streamable_http_client(
            f"{base_url}/mcp",
            http_client=httpx.AsyncClient(
                headers={"Authorization": f"Bearer {read_token}"},
            ),
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    "create_vlan", {"payload": {"vlan_id": 40, "name": "denied"}}
                )
                assert result.isError
                search = await session.call_tool("search_inventory", {"resource": "vlans"})
                assert search.structuredContent["total"] == 1


async def test_builtin_server_is_toggled_from_settings(integration_api):
    from sqlalchemy import update

    from app.models.user import User
    from app.services import embedded_mcp

    client, csrf, factory = integration_api
    token = await token_for(client, csrf)
    embedded_mcp.cache_embedded_mcp_enabled(False)
    try:
        async with embedded_mcp.run_embedded_mcp(app):
            status = await client.get("/api/integrations/mcp-server")
            assert status.json() == {"enabled": False, "available": True, "path": "/mcp"}
            disabled = await client.post(
                "/mcp", headers={"Authorization": f"Bearer {token}"}, json={}
            )
            assert disabled.status_code == 404

            denied = await client.patch(
                "/api/integrations/mcp-server",
                headers={"X-CSRF-Token": csrf},
                json={"enabled": True},
            )
            assert denied.status_code == 403

            async with factory() as session:
                await session.execute(update(User).values(role="admin"))
                await session.commit()
            enabled = await client.patch(
                "/api/integrations/mcp-server",
                headers={"X-CSRF-Token": csrf},
                json={"enabled": True},
            )
            assert enabled.status_code == 200
            assert enabled.json()["enabled"] is True
            audit = await client.get("/api/audit/events")
            assert "settings.mcp_server_updated" in audit.text

            async with serve(app, lifespan="off") as base_url:
                async with httpx.AsyncClient() as http:
                    response = await http.post(f"{base_url}/mcp", json={})
                    assert response.status_code == 401
                async with streamable_http_client(
                    f"{base_url}/mcp",
                    http_client=httpx.AsyncClient(
                        headers={"Authorization": f"Bearer {token}"},
                    ),
                ) as (read, write, _):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        result = await session.call_tool(
                            "create_vlan", {"payload": {"vlan_id": 50, "name": "Built-in"}}
                        )
                        assert not result.isError

            await client.patch(
                "/api/integrations/mcp-server",
                headers={"X-CSRF-Token": csrf},
                json={"enabled": False},
            )
            again = await client.post("/mcp", headers={"Authorization": f"Bearer {token}"}, json={})
            assert again.status_code == 404
    finally:
        embedded_mcp.cache_embedded_mcp_enabled(False)


async def test_builtin_server_cannot_be_enabled_without_sdk(integration_api, monkeypatch):
    from sqlalchemy import update

    from app.models.user import User
    from app.services import embedded_mcp

    client, csrf, factory = integration_api
    async with factory() as session:
        await session.execute(update(User).values(role="admin"))
        await session.commit()
    monkeypatch.setattr(embedded_mcp, "sdk_available", lambda: False)
    async with embedded_mcp.run_embedded_mcp(app):
        status = await client.get("/api/integrations/mcp-server")
        assert status.json()["available"] is False
        response = await client.patch(
            "/api/integrations/mcp-server",
            headers={"X-CSRF-Token": csrf},
            json={"enabled": True},
        )
        assert response.status_code == 409


async def test_http_transport_rejects_revoked_token_on_subsequent_request(integration_api):
    client, csrf, factory = integration_api
    token = await token_for(client, csrf, write=True)
    backend = InventoryClient("http://test", transport=httpx.ASGITransport(app=app))
    application = AuthenticateHTTP(create_server(backend).streamable_http_app(), backend)

    async with serve(application) as base_url:
        async with httpx.AsyncClient() as http:
            headers = {"Authorization": f"Bearer {token}"}
            # A harmless unauthenticated MCP request is expected to be rejected only
            # by the MCP protocol after the outer bearer-token check succeeds.
            first = await http.post(f"{base_url}/mcp", headers=headers, json={})
            assert first.status_code != 401

            async with factory() as session:
                record = await session.scalar(select(IntegrationToken))
                assert record is not None
                record.revoked_at = datetime.now(UTC)
                await session.commit()

            rejected = await http.post(f"{base_url}/mcp", headers=headers, json={})
            assert rejected.status_code == 401


async def test_http_transport_rejects_expired_token(integration_api):
    client, csrf, factory = integration_api
    token = await token_for(client, csrf, write=True)
    backend = InventoryClient("http://test", transport=httpx.ASGITransport(app=app))
    application = AuthenticateHTTP(create_server(backend).streamable_http_app(), backend)

    async with factory() as session:
        record = await session.scalar(select(IntegrationToken))
        assert record is not None
        record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await session.commit()

    async with serve(application) as base_url:
        async with httpx.AsyncClient() as http:
            response = await http.post(
                f"{base_url}/mcp",
                headers={"Authorization": f"Bearer {token}"},
                json={},
            )
            assert response.status_code == 401


async def test_http_transport_rejects_deactivated_account(integration_api):
    client, csrf, factory = integration_api
    token = await token_for(client, csrf, write=True)
    backend = InventoryClient("http://test", transport=httpx.ASGITransport(app=app))
    application = AuthenticateHTTP(create_server(backend).streamable_http_app(), backend)

    async with factory() as session:
        record = await session.scalar(select(IntegrationToken))
        assert record is not None
        user = await session.get(User, record.user_id)
        assert user is not None
        user.is_active = False
        await session.commit()

    async with serve(application) as base_url:
        async with httpx.AsyncClient() as http:
            response = await http.post(
                f"{base_url}/mcp",
                headers={"Authorization": f"Bearer {token}"},
                json={},
            )
            assert response.status_code == 401
