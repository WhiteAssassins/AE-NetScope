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

    device = await client.post(
        "/api/inventory/devices",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "name": "SW-Core-01",
            "device_type": "Switch",
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

    dashboard = await client.get("/api/inventory/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["stats"]["devices"] == 1
    assert dashboard.json()["stats"]["ip_addresses"] == 1
