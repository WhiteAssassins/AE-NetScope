import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.models.user import User


@pytest.fixture()
async def inventory_client():
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


async def test_inventory_core_crud_and_dashboard(inventory_client) -> None:
    client, csrf_token = inventory_client

    vlan = await client.post(
        "/api/inventory/vlans",
        headers={"X-CSRF-Token": csrf_token},
        json={"vlan_id": 10, "name": "Core"},
    )
    assert vlan.status_code == 201

    network = await client.post(
        "/api/inventory/networks",
        headers={"X-CSRF-Token": csrf_token},
        json={"cidr": "10.0.0.0/24", "name": "Core", "gateway": "10.0.0.1"},
    )
    assert network.status_code == 201
    assert network.json()["usable_hosts"] == 254
    assert network.json()["utilization_percent"] == 0

    invalid_network = await client.post(
        "/api/inventory/networks",
        headers={"X-CSRF-Token": csrf_token},
        json={"cidr": "10.0.1.0/24", "name": "Bad Gateway", "gateway": "10.0.2.1"},
    )
    assert invalid_network.status_code == 422

    updated_network = await client.patch(
        f"/api/inventory/networks/{network.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
        json={"location": "MDF", "vlan_id": vlan.json()["id"]},
    )
    assert updated_network.status_code == 200
    assert updated_network.json()["location"] == "MDF"
    assert updated_network.json()["vlan"]["vlan_id"] == 10

    vlans = await client.get("/api/inventory/vlans")
    assert vlans.status_code == 200
    assert vlans.json()[0]["network_count"] == 1

    updated_vlan = await client.patch(
        f"/api/inventory/vlans/{vlan.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
        json={"name": "Core LAN", "description": "Core switching segment"},
    )
    assert updated_vlan.status_code == 200
    assert updated_vlan.json()["name"] == "Core LAN"

    duplicate_vlan = await client.post(
        "/api/inventory/vlans",
        headers={"X-CSRF-Token": csrf_token},
        json={"vlan_id": 10, "name": "Duplicate"},
    )
    assert duplicate_vlan.status_code == 409

    device = await client.post(
        "/api/inventory/devices",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "name": "SW-Core-01",
            "device_type": "Switch",
            "serial_number": "SN-SW-001",
            "asset_tag": "AE-SW-001",
            "firmware_version": "17.9.5",
            "cpu": "Network ASIC",
            "memory": "4 GB",
            "storage": "16 GB flash",
            "warranty_expires": "2028-12-31",
            "owner": "Network Team",
            "rack_position": "Rack A / U12",
            "interface": {
                "name": "eth0",
                "mac_address": "00:11:22:33:44:55",
                "ip_address": "10.0.0.2",
                "network_id": network.json()["id"],
            },
        },
    )
    assert device.status_code == 201
    assert device.json()["primary_ip"] == "10.0.0.2"
    assert device.json()["serial_number"] == "SN-SW-001"
    assert device.json()["rack_position"] == "Rack A / U12"

    dashboard = await client.get("/api/inventory/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["stats"]["devices"] == 1
    assert dashboard.json()["stats"]["ip_addresses"] == 1

    export_json = await client.get("/api/inventory/export.json")
    assert export_json.status_code == 200
    assert export_json.json()["format"] == "ae-netscope.inventory.v1"
    assert len(export_json.json()["devices"]) == 1

    export_csv = await client.get("/api/inventory/export/devices.csv")
    assert export_csv.status_code == 200
    assert "text/csv" in export_csv.headers["content-type"]
    assert "SW-Core-01" in export_csv.text

    detail = await client.get(f"/api/inventory/devices/{device.json()['id']}")
    assert detail.status_code == 200
    assert detail.json()["name"] == "SW-Core-01"
    assert detail.json()["interfaces"][0]["ip_addresses"][0]["address"] == "10.0.0.2"

    updated = await client.patch(
        f"/api/inventory/devices/{device.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
        json={"location": "Rack A1", "model": "AE-48P", "owner": "Infra Team"},
    )
    assert updated.status_code == 200
    assert updated.json()["location"] == "Rack A1"
    assert updated.json()["model"] == "AE-48P"
    assert updated.json()["owner"] == "Infra Team"

    interface = await client.post(
        f"/api/inventory/devices/{device.json()['id']}/interfaces",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "name": "eth1",
            "mac_address": "00:11:22:33:44:56",
            "ip_address": "10.0.0.3",
            "network_id": network.json()["id"],
        },
    )
    assert interface.status_code == 201
    assert interface.json()["name"] == "eth1"
    assert interface.json()["ip_addresses"][0]["address"] == "10.0.0.3"

    ip_list = await client.get("/api/inventory/ip-addresses")
    assert ip_list.status_code == 200
    assert ip_list.json()[0]["mac_address"] == "00:11:22:33:44:55"
    assert ip_list.json()[0]["state"] == "active"

    interfaces = await client.get("/api/inventory/interfaces")
    assert interfaces.status_code == 200
    assert interfaces.json()[0]["device_name"] == "SW-Core-01"

    reserved_ip = await client.post(
        "/api/inventory/ip-addresses",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "address": "10.0.0.10",
            "assignment_type": "reserved",
            "network_id": network.json()["id"],
        },
    )
    assert reserved_ip.status_code == 201
    assert reserved_ip.json()["state"] == "reserved"

    updated_ip = await client.patch(
        f"/api/inventory/ip-addresses/{reserved_ip.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "assignment_type": "static",
            "interface_id": interface.json()["id"],
        },
    )
    assert updated_ip.status_code == 200
    assert updated_ip.json()["state"] == "active"
    assert updated_ip.json()["device_name"] == "SW-Core-01"

    duplicate_ip = await client.post(
        "/api/inventory/ip-addresses",
        headers={"X-CSRF-Token": csrf_token},
        json={"address": "10.0.0.10"},
    )
    assert duplicate_ip.status_code == 409

    outside_ip = await client.post(
        "/api/inventory/ip-addresses",
        headers={"X-CSRF-Token": csrf_token},
        json={"address": "10.0.8.10", "network_id": network.json()["id"]},
    )
    assert outside_ip.status_code == 422

    service = await client.post(
        "/api/inventory/services",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "device_id": device.json()["id"],
            "name": "SSH",
            "port": 22,
            "protocol": "tcp",
            "status": "active",
        },
    )
    assert service.status_code == 201
    assert service.json()["device_name"] == "SW-Core-01"
    assert service.json()["primary_ip"] == "10.0.0.2"

    services = await client.get("/api/inventory/services")
    assert services.status_code == 200
    assert services.json()[0]["name"] == "SSH"

    updated_service = await client.patch(
        f"/api/inventory/services/{service.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
        json={"status": "warning", "port": 2222},
    )
    assert updated_service.status_code == 200
    assert updated_service.json()["status"] == "warning"
    assert updated_service.json()["port"] == 2222

    deleted_service = await client.delete(
        f"/api/inventory/services/{service.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deleted_service.status_code == 204

    deleted_ip = await client.delete(
        f"/api/inventory/ip-addresses/{reserved_ip.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deleted_ip.status_code == 204

    deactivated = await client.post(
        f"/api/inventory/devices/{device.json()['id']}/deactivate",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["status"] == "inactive"

    deleted_device = await client.delete(
        f"/api/inventory/devices/{device.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deleted_device.status_code == 204

    ip_list_after_device_delete = await client.get("/api/inventory/ip-addresses")
    assert ip_list_after_device_delete.status_code == 200
    assert all(item["interface_id"] is None for item in ip_list_after_device_delete.json())

    deleted_network = await client.delete(
        f"/api/inventory/networks/{network.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deleted_network.status_code == 204

    ip_list_after_network_delete = await client.get("/api/inventory/ip-addresses")
    assert ip_list_after_network_delete.status_code == 200
    assert all(item["network_id"] is None for item in ip_list_after_network_delete.json())

    deleted_vlan = await client.delete(
        f"/api/inventory/vlans/{vlan.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deleted_vlan.status_code == 204


async def test_viewer_can_read_inventory_but_cannot_write() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        session.add(
            User(
                email="viewer@example.com",
                username="viewer",
                password_hash=hash_password("correct-password"),
                role="viewer",
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
            json={"email": "viewer@example.com", "password": "correct-password"},
        )
        assert login.status_code == 200
        assert login.json()["user"]["permissions"] == ["inventory:read"]

        dashboard = await client.get("/api/inventory/dashboard")
        assert dashboard.status_code == 200

        forbidden_create = await client.post(
            "/api/inventory/vlans",
            headers={"X-CSRF-Token": login.json()["csrf_token"]},
            json={"vlan_id": 10, "name": "Core"},
        )
        assert forbidden_create.status_code == 403

    app.dependency_overrides.clear()
    await engine.dispose()


async def test_admin_can_restore_inventory_backup(inventory_client) -> None:
    client, csrf_token = inventory_client

    vlan = await client.post(
        "/api/inventory/vlans",
        headers={"X-CSRF-Token": csrf_token},
        json={"vlan_id": 30, "name": "Servers"},
    )
    network = await client.post(
        "/api/inventory/networks",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "cidr": "10.30.0.0/24",
            "name": "Server LAN",
            "gateway": "10.30.0.1",
            "vlan_id": vlan.json()["id"],
        },
    )
    device = await client.post(
        "/api/inventory/devices",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "name": "SRV-APP-01",
            "device_type": "Servidor",
            "vendor": "AE",
            "model": "Node",
            "serial_number": "SRV-SERIAL-01",
            "asset_tag": "AE-SRV-01",
            "cpu": "8 cores",
            "memory": "32 GB",
            "storage": "2 TB NVMe",
            "owner": "Systems",
            "interface": {
                "name": "eth0",
                "mac_address": "00:aa:bb:cc:dd:01",
                "ip_address": "10.30.0.20",
                "network_id": network.json()["id"],
            },
        },
    )
    service = await client.post(
        "/api/inventory/services",
        headers={"X-CSRF-Token": csrf_token},
        json={"device_id": device.json()["id"], "name": "HTTPS", "port": 443},
    )
    assert service.status_code == 201

    backup_response = await client.get("/api/inventory/export.json")
    assert backup_response.status_code == 200
    backup = backup_response.json()

    preview_response = await client.post(
        "/api/inventory/import/preview",
        headers={"X-CSRF-Token": csrf_token},
        json=backup,
    )
    assert preview_response.status_code == 200
    assert preview_response.json()["valid"] is True
    assert preview_response.json()["counts"]["devices"] == 1
    assert preview_response.json()["current_counts"]["devices"] == 1

    await client.delete(
        f"/api/inventory/devices/{device.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert (await client.get("/api/inventory/devices")).json() == []

    import_response = await client.post(
        "/api/inventory/import.json",
        headers={"X-CSRF-Token": csrf_token},
        json=backup,
    )
    assert import_response.status_code == 200
    assert import_response.json()["counts"]["devices"] == 1
    assert import_response.json()["counts"]["services"] == 1
    assert import_response.json()["previous_backup"]["format"] == "ae-netscope.inventory.v1"
    assert import_response.json()["previous_backup"]["devices"] == []
    assert import_response.json()["previous_backup_filename"].startswith(
        "ae-netscope-before-restore-"
    )

    restored_devices = await client.get("/api/inventory/devices")
    assert restored_devices.json()[0]["name"] == "SRV-APP-01"
    assert restored_devices.json()[0]["primary_ip"] == "10.30.0.20"
    assert restored_devices.json()[0]["serial_number"] == "SRV-SERIAL-01"
    assert restored_devices.json()[0]["memory"] == "32 GB"

    restored_services = await client.get("/api/inventory/services")
    assert restored_services.json()[0]["name"] == "HTTPS"


async def test_import_preview_reports_invalid_references(inventory_client) -> None:
    client, csrf_token = inventory_client

    response = await client.post(
        "/api/inventory/import/preview",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "format": "ae-netscope.inventory.v1",
            "devices": [{"id": 1, "name": "SRV-01", "device_type": "Servidor"}],
            "interfaces": [{"id": 1, "device_id": 999, "name": "eth0"}],
            "ip_addresses": [{"id": 1, "address": "10.0.0.10", "interface_id": 999}],
            "services": [{"id": 1, "device_id": 999, "name": "SSH"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert "Interface 1 references a missing device." in response.json()["errors"]
    assert "IP 1 references a missing interface." in response.json()["errors"]
    assert "Service 1 references a missing device." in response.json()["errors"]
