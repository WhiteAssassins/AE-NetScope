import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.models.inventory import IpAddress, NetworkInterface
from app.models.user import User
from app.services.inventory import ip_address_state, network_usable_hosts


def test_network_usable_hosts_for_ipv4_and_ipv6() -> None:
    assert network_usable_hosts("10.0.0.0/24") == 254
    assert network_usable_hosts("10.0.0.0/30") == 2
    assert network_usable_hosts("10.0.0.0/31") == 2
    assert network_usable_hosts("2001:db8::/126") == 4


def test_ip_address_state() -> None:
    interface = NetworkInterface(device_id=1, name="eth0", mac_address="00:11:22:33:44:55")

    assert ip_address_state(IpAddress(address="10.0.0.10", assignment_type="reserved"), None) == (
        "reserved"
    )
    assert ip_address_state(IpAddress(address="10.0.0.11", assignment_type="static"), None) == (
        "unassigned"
    )
    assert ip_address_state(
        IpAddress(address="10.0.0.12", assignment_type="static"),
        interface,
    ) == "active"


@pytest.fixture()
async def empty_inventory_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        session.add(
            User(
                email="admin@example.com",
                username="admin",
                password_hash=hash_password("correct-password"),
                role="admin",
                must_change_password=False,
            )
        )
        await session.commit()

    async def override_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "correct-password"},
        )
        yield client, login.json()["csrf_token"]

    app.dependency_overrides.clear()
    await engine.dispose()


async def test_empty_csv_export_still_has_valid_csv_response(empty_inventory_client) -> None:
    client, _ = empty_inventory_client

    response = await client.get("/api/inventory/export/devices.csv")

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert response.text == "\r\n"


async def test_csv_export_neutralizes_spreadsheet_formulas(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client

    created = await client.post(
        "/api/inventory/devices",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "name": "=HYPERLINK(\"http://example.test\")",
            "device_type": "router",
            "vendor": "@vendor",
            "notes": "+formula-like-note",
        },
    )
    assert created.status_code == 201

    response = await client.get("/api/inventory/export/devices.csv")

    assert response.status_code == 200
    assert "'=HYPERLINK" in response.text
    assert "'@vendor" in response.text
    assert "'+formula-like-note" in response.text


async def test_import_rejects_wrong_backup_shape(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client

    response = await client.post(
        "/api/inventory/import.json",
        headers={"X-CSRF-Token": csrf_token},
        json={"format": "ae-netscope.inventory.v1", "devices": "not-a-list"},
    )

    assert response.status_code == 422
    assert "devices must be a list" in response.json()["detail"]["errors"]


async def test_import_preview_rejects_oversized_payload(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client

    response = await client.post(
        "/api/inventory/import/preview",
        headers={
            "X-CSRF-Token": csrf_token,
            "Content-Length": "2000001",
        },
        json={"format": "ae-netscope.inventory.v1"},
    )

    assert response.status_code == 413


async def test_device_types_are_stored_as_language_neutral_keys(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}

    created = await client.post(
        "/api/inventory/devices",
        headers=headers,
        json={"name": "hv-01", "device_type": "Virtual Machine"},
    )
    assert created.status_code == 201
    assert created.json()["device_type"] == "virtualization"

    updated = await client.patch(
        f"/api/inventory/devices/{created.json()['id']}",
        headers=headers,
        json={"device_type": "Servidor"},
    )
    assert updated.status_code == 200
    assert updated.json()["device_type"] == "server"

    rejected = await client.post(
        "/api/inventory/devices",
        headers=headers,
        json={"name": "mystery", "device_type": "Toaster"},
    )
    assert rejected.status_code == 422


async def test_interface_ips_must_belong_to_an_existing_selected_network(
    empty_inventory_client,
) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    network = (
        await client.post(
            "/api/inventory/networks",
            headers=headers,
            json={"cidr": "10.20.0.0/24", "name": "Lab"},
        )
    ).json()

    outside = await client.post(
        "/api/inventory/devices",
        headers=headers,
        json={
            "name": "srv-outside",
            "device_type": "server",
            "interface": {"ip_address": "192.168.50.5", "network_id": network["id"]},
        },
    )
    assert outside.status_code == 422

    missing = await client.post(
        "/api/inventory/devices",
        headers=headers,
        json={
            "name": "srv-missing",
            "device_type": "server",
            "interface": {"ip_address": "10.20.0.5", "network_id": 9999},
        },
    )
    assert missing.status_code == 404

    device = await client.post(
        "/api/inventory/devices",
        headers=headers,
        json={
            "name": "srv-ok",
            "device_type": "server",
            "interface": {"ip_address": "10.20.0.5", "network_id": network["id"]},
        },
    )
    assert device.status_code == 201
    added = await client.post(
        f"/api/inventory/devices/{device.json()['id']}/interfaces",
        headers=headers,
        json={"name": "eth1", "ip_address": "172.16.0.9", "network_id": network["id"]},
    )
    assert added.status_code == 422
    assert len((await client.get("/api/inventory/ip-addresses")).json()) == 1


async def test_updates_reject_null_for_required_fields(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    vlan = (
        await client.post(
            "/api/inventory/vlans", headers=headers, json={"vlan_id": 30, "name": "Lab"}
        )
    ).json()
    network = (
        await client.post(
            "/api/inventory/networks",
            headers=headers,
            json={"cidr": "10.30.0.0/24", "name": "Lab"},
        )
    ).json()
    device = (
        await client.post(
            "/api/inventory/devices",
            headers=headers,
            json={"name": "srv-null", "device_type": "server"},
        )
    ).json()
    service = (
        await client.post(
            "/api/inventory/services",
            headers=headers,
            json={"device_id": device["id"], "name": "SSH", "port": 22},
        )
    ).json()

    for path, body in (
        (f"/api/inventory/vlans/{vlan['id']}", {"vlan_id": None}),
        (f"/api/inventory/networks/{network['id']}", {"cidr": None}),
        (f"/api/inventory/devices/{device['id']}", {"name": None}),
        (f"/api/inventory/devices/{device['id']}", {"device_type": None}),
        (f"/api/inventory/services/{service['id']}", {"name": None}),
    ):
        response = await client.patch(path, headers=headers, json=body)
        assert response.status_code == 422, (path, body, response.text)

    cleared = await client.patch(
        f"/api/inventory/services/{service['id']}", headers=headers, json={"port": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["port"] is None


async def test_restore_normalizes_interface_mac_addresses(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    response = await client.post(
        "/api/inventory/import.json",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "format": "ae-netscope.inventory.v1",
            "vlans": [],
            "networks": [],
            "devices": [{"id": 1, "name": "srv-01", "device_type": "server"}],
            "interfaces": [
                {"id": 1, "device_id": 1, "name": "eth0", "mac_address": "AA:BB:CC:DD:EE:FF"}
            ],
            "ip_addresses": [],
            "services": [],
        },
    )
    assert response.status_code == 200

    interfaces = (await client.get("/api/inventory/interfaces")).json()
    assert [item["mac_address"] for item in interfaces] == ["aa:bb:cc:dd:ee:ff"]


async def test_service_reports_its_device_primary_ip(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    device = (
        await client.post(
            "/api/inventory/devices",
            headers=headers,
            json={
                "name": "srv-multi",
                "device_type": "server",
                "interface": {"name": "eth0", "ip_address": "10.40.0.5"},
            },
        )
    ).json()
    await client.post(
        f"/api/inventory/devices/{device['id']}/interfaces",
        headers=headers,
        json={"name": "eth1", "ip_address": "10.40.0.9"},
    )
    service = await client.post(
        "/api/inventory/services",
        headers=headers,
        json={"device_id": device["id"], "name": "SSH", "port": 22},
    )

    device_ip = (await client.get("/api/inventory/devices")).json()[0]["primary_ip"]
    assert device_ip == "10.40.0.5"
    assert service.json()["primary_ip"] == device_ip
    assert (await client.get("/api/inventory/services")).json()[0]["primary_ip"] == device_ip


async def test_blank_device_notes_are_not_counted(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    created = await client.post(
        "/api/inventory/devices",
        headers={"X-CSRF-Token": csrf_token},
        json={"name": "srv-notes", "device_type": "server", "notes": "   "},
    )
    assert created.json()["notes"] is None
    assert (await client.get("/api/inventory/dashboard")).json()["stats"]["notes"] == 0


async def test_patch_null_detaches_network_and_clears_gateway(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    network = (
        await client.post(
            "/api/inventory/networks",
            headers=headers,
            json={"cidr": "10.50.0.0/24", "name": "Lab", "gateway": "10.50.0.1"},
        )
    ).json()
    ip = (
        await client.post(
            "/api/inventory/ip-addresses",
            headers=headers,
            json={"address": "10.50.0.5", "network_id": network["id"]},
        )
    ).json()

    moved = await client.patch(
        f"/api/inventory/ip-addresses/{ip['id']}",
        headers=headers,
        json={"address": "192.168.7.5", "network_id": None},
    )
    assert moved.status_code == 200
    assert moved.json()["network_id"] is None

    renumbered = await client.patch(
        f"/api/inventory/networks/{network['id']}",
        headers=headers,
        json={"cidr": "10.51.0.0/24", "gateway": None},
    )
    assert renumbered.status_code == 200
    assert renumbered.json()["gateway"] is None


async def test_addresses_and_networks_are_listed_in_numeric_order(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    for address in ("10.0.0.100", "10.0.0.11", "10.0.0.2"):
        await client.post("/api/inventory/ip-addresses", headers=headers, json={"address": address})
    for cidr in ("10.10.0.0/24", "10.9.0.0/24", "10.100.0.0/24"):
        await client.post(
            "/api/inventory/networks", headers=headers, json={"cidr": cidr, "name": cidr}
        )

    ip_rows = (await client.get("/api/inventory/ip-addresses")).json()
    addresses = [item["address"] for item in ip_rows]
    cidrs = [item["cidr"] for item in (await client.get("/api/inventory/networks")).json()]
    assert addresses == ["10.0.0.2", "10.0.0.11", "10.0.0.100"]
    assert cidrs == ["10.9.0.0/24", "10.10.0.0/24", "10.100.0.0/24"]


async def test_network_and_broadcast_addresses_cannot_be_assigned(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    broadcast_gateway = await client.post(
        "/api/inventory/networks",
        headers=headers,
        json={"cidr": "10.60.0.0/24", "name": "Lab", "gateway": "10.60.0.255"},
    )
    assert broadcast_gateway.status_code == 422

    network = (
        await client.post(
            "/api/inventory/networks",
            headers=headers,
            json={"cidr": "10.60.0.0/24", "name": "Lab", "gateway": "10.60.0.1"},
        )
    ).json()
    for address in ("10.60.0.0", "10.60.0.255"):
        response = await client.post(
            "/api/inventory/ip-addresses",
            headers=headers,
            json={"address": address, "network_id": network["id"]},
        )
        assert response.status_code == 422, address
    device = await client.post(
        "/api/inventory/devices",
        headers=headers,
        json={
            "name": "srv-bcast",
            "device_type": "server",
            "interface": {"ip_address": "10.60.0.255", "network_id": network["id"]},
        },
    )
    assert device.status_code == 422
    gateway_update = await client.patch(
        f"/api/inventory/networks/{network['id']}",
        headers=headers,
        json={"gateway": "10.60.0.0"},
    )
    assert gateway_update.status_code == 422

    point_to_point = (
        await client.post(
            "/api/inventory/networks",
            headers=headers,
            json={"cidr": "10.61.0.0/31", "name": "Link"},
        )
    ).json()
    link_ip = await client.post(
        "/api/inventory/ip-addresses",
        headers=headers,
        json={"address": "10.61.0.0", "network_id": point_to_point["id"]},
    )
    assert link_ip.status_code == 201


async def test_csv_export_flattens_nested_records(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    vlan = (
        await client.post(
            "/api/inventory/vlans", headers=headers, json={"vlan_id": 10, "name": "Core"}
        )
    ).json()
    await client.post(
        "/api/inventory/networks",
        headers=headers,
        json={"cidr": "10.70.0.0/24", "name": "Core", "vlan_id": vlan["id"]},
    )

    lines = (await client.get("/api/inventory/export/networks.csv")).text.splitlines()
    header = lines[0].split(",")
    assert "vlan.vlan_id" in header
    assert "vlan" not in header
    assert "{" not in lines[1]


async def test_exported_inventory_can_be_restored(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    created = []
    for name in ("srv-01", "SRV-01"):
        response = await client.post(
            "/api/inventory/devices",
            headers=headers,
            json={"name": name, "device_type": "server"},
        )
        created.append(response.json())
    for _ in range(2):
        await client.post(
            "/api/inventory/services",
            headers=headers,
            json={"device_id": created[0]["id"], "name": "SSH", "port": 22},
        )

    backup = (await client.get("/api/inventory/export.json")).json()
    preview = (
        await client.post("/api/inventory/import/preview", headers=headers, json=backup)
    ).json()
    assert preview["valid"] is True, preview["errors"]
    assert preview["warnings"]

    restored = await client.post("/api/inventory/import.json", headers=headers, json=backup)
    assert restored.status_code == 200
    assert restored.json()["counts"]["services"] == 2


async def test_assignment_types_are_normalized_and_validated(empty_inventory_client) -> None:
    client, csrf_token = empty_inventory_client
    headers = {"X-CSRF-Token": csrf_token}
    reserved = await client.post(
        "/api/inventory/ip-addresses",
        headers=headers,
        json={"address": "10.80.0.9", "assignment_type": " Reserved "},
    )
    assert reserved.status_code == 201
    assert reserved.json()["assignment_type"] == "reserved"
    assert reserved.json()["state"] == "reserved"

    unknown = await client.post(
        "/api/inventory/ip-addresses",
        headers=headers,
        json={"address": "10.80.0.10", "assignment_type": "manual"},
    )
    assert unknown.status_code == 422


async def test_dashboard_reports_last_change_as_iso_datetime(empty_inventory_client) -> None:
    from datetime import datetime

    client, csrf_token = empty_inventory_client
    await client.post(
        "/api/inventory/devices",
        headers={"X-CSRF-Token": csrf_token},
        json={"name": "srv-time", "device_type": "server"},
    )
    recent = (await client.get("/api/inventory/dashboard")).json()["recent_devices"][0]
    assert datetime.fromisoformat(recent["last_change"]).tzinfo is not None
