import httpx
import pytest
from sqlalchemy import select

from app.core import redis as redis_module
from app.main import app
from app.models.audit import AuditEvent


async def post(client, csrf, path, payload):
    return await client.post(f"/api/inventory/{path}", headers={"X-CSRF-Token": csrf}, json=payload)


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("devices", {"name": "   ", "device_type": "server"}),
        ("networks", {"cidr": "10.9.0.0/24", "name": "  "}),
        ("vlans", {"vlan_id": 10, "name": "\t"}),
    ],
)
async def test_blank_names_are_rejected(inventory_client, path, payload) -> None:
    client, csrf = inventory_client
    assert (await post(client, csrf, path, payload)).status_code == 422


async def test_names_are_trimmed_so_padded_duplicates_conflict(inventory_client) -> None:
    client, csrf = inventory_client
    created = await post(client, csrf, "devices", {"name": " SW-01 ", "device_type": "switch"})
    assert created.json()["name"] == "SW-01"

    duplicate = await post(client, csrf, "devices", {"name": "SW-01  ", "device_type": "switch"})
    assert duplicate.status_code == 409
    blank_service = await post(
        client, csrf, "services", {"device_id": created.json()["id"], "name": "  "}
    )
    assert blank_service.status_code == 422


@pytest.mark.parametrize(
    ("status", "expected"),
    [("Activo", "active"), (" Inactive ", "inactive"), ("RESERVED", "reserved"), ("broken", None)],
)
async def test_device_status_is_normalized(inventory_client, status, expected) -> None:
    client, csrf = inventory_client
    response = await post(
        client, csrf, "devices", {"name": "NAS", "device_type": "nas", "status": status}
    )
    if expected is None:
        assert response.status_code == 422
    else:
        assert response.json()["status"] == expected


@pytest.mark.parametrize(
    ("warranty", "expected"),
    [("2028-12-31", "2028-12-31"), ("  ", None), ("31/12/2028", 422), ("2028-02-30", 422)],
)
async def test_warranty_must_be_an_iso_date(inventory_client, warranty, expected) -> None:
    client, csrf = inventory_client
    response = await post(
        client,
        csrf,
        "devices",
        {"name": "SRV", "device_type": "server", "warranty_expires": warranty},
    )
    if expected == 422:
        assert response.status_code == 422
    else:
        assert response.status_code == 201
        detail = await client.get(f"/api/inventory/devices/{response.json()['id']}")
        assert detail.json()["warranty_expires"] == expected


async def test_service_protocol_is_required_and_lowercase(inventory_client) -> None:
    client, csrf = inventory_client
    device = await post(client, csrf, "devices", {"name": "WEB", "device_type": "server"})
    device_id = device.json()["id"]

    empty = await post(
        client, csrf, "services", {"device_id": device_id, "name": "web", "protocol": ""}
    )
    upper = await post(
        client, csrf, "services", {"device_id": device_id, "name": "web", "protocol": " TCP "}
    )

    assert empty.status_code == 422
    assert upper.json()["protocol"] == "tcp"


@pytest.mark.parametrize(
    "mac", ["AA-BB-CC-DD-EE-01", "aabb.ccdd.ee01", "AABBCCDDEE01", " aa:bb:cc:dd:ee:01 "]
)
async def test_common_mac_notations_are_normalized(inventory_client, mac) -> None:
    client, csrf = inventory_client
    device = await post(client, csrf, "devices", {"name": "AP", "device_type": "access_point"})
    response = await client.post(
        f"/api/inventory/devices/{device.json()['id']}/interfaces",
        headers={"X-CSRF-Token": csrf},
        json={"name": "wlan0", "mac_address": mac},
    )

    assert response.status_code == 201
    assert response.json()["mac_address"] == "aa:bb:cc:dd:ee:01"


@pytest.mark.parametrize("mac", ["aa:bb-cc:dd:ee:01", "aabb.ccdd", "zz:bb:cc:dd:ee:01"])
async def test_malformed_mac_addresses_are_rejected(inventory_client, mac) -> None:
    client, csrf = inventory_client
    device = await post(client, csrf, "devices", {"name": "AP", "device_type": "access_point"})
    response = await client.post(
        f"/api/inventory/devices/{device.json()['id']}/interfaces",
        headers={"X-CSRF-Token": csrf},
        json={"name": "wlan0", "mac_address": mac},
    )

    assert response.status_code == 422


async def test_addresses_of_deactivated_devices_are_inactive(inventory_client) -> None:
    client, csrf = inventory_client
    device = await post(
        client,
        csrf,
        "devices",
        {"name": "PC", "device_type": "workstation", "interface": {"ip_address": "10.0.0.5"}},
    )
    await client.post(
        f"/api/inventory/devices/{device.json()['id']}/deactivate", headers={"X-CSRF-Token": csrf}
    )

    addresses = (await client.get("/api/inventory/ip-addresses")).json()

    assert [item["state"] for item in addresses] == ["inactive"]


async def test_backups_with_legacy_values_still_restore(inventory_client) -> None:
    client, csrf = inventory_client
    device = await post(client, csrf, "devices", {"name": "OLD", "device_type": "server"})
    await post(client, csrf, "services", {"device_id": device.json()["id"], "name": "ssh"})
    backup = (await client.get("/api/inventory/export.json")).json()
    backup["devices"][0].update(
        {"status": "Operativo", "warranty_expires": "Dec 2028", "notes": "Rack A"}
    )
    backup["services"][0]["protocol"] = ""

    preview = await client.post(
        "/api/inventory/import/preview", headers={"X-CSRF-Token": csrf}, json=backup
    )
    restored = await client.post(
        "/api/inventory/import.json", headers={"X-CSRF-Token": csrf}, json=backup
    )

    assert preview.json()["valid"] is True
    assert restored.status_code == 200
    devices = (await client.get("/api/inventory/devices")).json()
    detail = (await client.get(f"/api/inventory/devices/{devices[0]['id']}")).json()
    assert detail["status"] == "unknown"
    assert detail["warranty_expires"] is None
    assert detail["notes"] == "Rack A\n\nWarranty: Dec 2028"
    assert (await client.get("/api/inventory/services")).json()[0]["protocol"] == "other"


async def test_inventory_audit_events_record_the_client_address(integration_api) -> None:
    client, csrf, factory = integration_api
    await post(client, csrf, "devices", {"name": "FW", "device_type": "firewall"})

    async with factory() as session:
        event = await session.scalar(
            select(AuditEvent).where(AuditEvent.event_type == "inventory.device_created")
        )

    assert event.ip_address == "127.0.0.1"


async def test_mcp_errors_explain_what_to_fix(integration_api) -> None:
    pytest.importorskip("mcp")
    from app.mcp.server import InventoryAPIError, InventoryClient

    client, csrf, _ = integration_api
    token = (
        await client.post(
            "/api/integrations/tokens",
            headers={"X-CSRF-Token": csrf},
            json={"name": "MCP", "password": "integration-test-password", "allow_write": True},
        )
    ).json()["token"]
    network = await post(client, csrf, "networks", {"cidr": "10.20.0.0/24", "name": "LAN"})
    backend = InventoryClient("http://test", token, httpx.ASGITransport(app=app))

    with pytest.raises(InventoryAPIError) as outside:
        await backend.request(
            "POST",
            "ip-addresses",
            token=token,
            payload={"address": "10.30.0.5", "network_id": network.json()["id"]},
        )
    with pytest.raises(InventoryAPIError) as invalid:
        await backend.request(
            "POST", "devices", token=token, payload={"name": "AP", "device_type": "rocket"}
        )

    assert "does not belong to the selected network" in str(outside.value)
    assert "device_type" in str(invalid.value)


def test_redis_client_fails_fast() -> None:
    client = redis_module.get_redis_client()
    options = client.connection_pool.connection_kwargs

    assert options["socket_connect_timeout"] == redis_module.REDIS_SOCKET_TIMEOUT_SECONDS
    assert options["socket_timeout"] == redis_module.REDIS_SOCKET_TIMEOUT_SECONDS
