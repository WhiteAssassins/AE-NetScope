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
            "device_type": "@router",
            "notes": "+formula-like-note",
        },
    )
    assert created.status_code == 201

    response = await client.get("/api/inventory/export/devices.csv")

    assert response.status_code == 200
    assert "'=HYPERLINK" in response.text
    assert "'@router" in response.text
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
