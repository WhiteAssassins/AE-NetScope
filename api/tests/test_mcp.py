import asyncio
import os
import socket
import sys
from contextlib import asynccontextmanager

import httpx
import pytest
import uvicorn

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
