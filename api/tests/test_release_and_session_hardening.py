import asyncio
import time

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from support import publish_releases

from app.api.routes import version as version_route
from app.core import rate_limit as rate_limit_module
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_session
from app.main import app


@pytest.fixture()
async def setup_api(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_session():
        async with factory() as session:
            yield session

    monkeypatch.setattr(settings, "initial_setup_token", "correct-install-token")
    app.dependency_overrides[get_session] = override_session
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, factory
    app.dependency_overrides.clear()
    await engine.dispose()


SETUP = {"email": "owner@example.com", "username": "owner", "password": "first-secure-password"}


async def test_setup_token_with_accents_is_rejected_not_crashed(setup_api) -> None:
    client, _ = setup_api
    response = await client.post(
        "/api/auth/setup", json={**SETUP, "setup_token": "córrect-install-token"}
    )

    assert response.status_code == 403


async def test_setup_keeps_the_language_and_time_zone_of_the_setup_screen(setup_api) -> None:
    client, factory = setup_api
    response = await client.post(
        "/api/auth/setup",
        json={
            **SETUP,
            "setup_token": "correct-install-token",
            "language": "es",
            "timezone": "Europe/Madrid",
        },
    )

    assert response.status_code == 200
    assert response.json()["user"]["preferred_language"] == "es"
    assert response.json()["user"]["timezone"] == "Europe/Madrid"


async def test_unreadable_protected_data_explains_the_missing_key(
    inventory_client,
    monkeypatch,
) -> None:
    client, csrf = inventory_client
    await client.post(
        "/api/inventory/vlans",
        headers={"X-CSRF-Token": csrf},
        json={"vlan_id": 10, "name": "Core", "description": "Rack A"},
    )
    # The key that encrypted the description is no longer configured.
    monkeypatch.setattr(settings, "data_encryption_key", "z" * 40)
    monkeypatch.setattr(settings, "data_decryption_fallback_keys", "")

    response = await client.get("/api/inventory/vlans")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "protected_data_unavailable"


@pytest.mark.parametrize(
    ("tag", "status"),
    [("v9.9.9", 400), ("v0.1.0", 409), ("v0.2.0", None)],
)
async def test_automatic_updates_only_start_known_newer_releases(monkeypatch, tag, status) -> None:
    publish_releases(monkeypatch, "v0.1.0", "v0.2.0", installed="0.1.5")
    monkeypatch.setattr(version_route.settings, "deployment_platform", "docker")
    monkeypatch.setattr(version_route.settings, "auto_update_enabled", True)
    monkeypatch.setattr(version_route.settings, "auto_update_command", "update {tag}")

    if status is None:
        assert await version_route.verified_update_tag(tag) == tag
        return
    with pytest.raises(version_route.HTTPException) as excinfo:
        await version_route.start_update(version_route.UpdateRequest(tag_name=tag), None, None)
    assert excinfo.value.status_code == status


def test_foreign_keys_used_in_queries_are_indexed(tmp_path) -> None:
    from alembic import command
    from sqlalchemy import create_engine
    from test_migrations import migration_config

    database = tmp_path / "indexes.db"
    command.upgrade(migration_config(f"sqlite:///{database}"), "head")

    inspector = inspect(create_engine(f"sqlite:///{database}"))
    indexed = {
        (table, column)
        for table in ("ip_addresses", "services", "networks", "audit_events")
        for index in inspector.get_indexes(table)
        for column in index["column_names"]
    }

    assert {
        ("ip_addresses", "network_id"),
        ("ip_addresses", "interface_id"),
        ("services", "device_id"),
        ("networks", "vlan_id"),
        ("audit_events", "actor_user_id"),
    } <= indexed


async def test_interface_and_service_changes_update_the_device_last_change(
    inventory_client,
) -> None:
    client, csrf = inventory_client
    headers = {"X-CSRF-Token": csrf}
    device = (
        await client.post(
            "/api/inventory/devices", headers=headers, json={"name": "SRV", "device_type": "server"}
        )
    ).json()

    async def last_change() -> str:
        return (await client.get("/api/inventory/dashboard")).json()["recent_devices"][0][
            "last_change"
        ]

    changes = []
    for request in (
        lambda: client.post(
            f"/api/inventory/devices/{device['id']}/interfaces",
            headers=headers,
            json={"name": "eth1", "ip_address": "10.0.0.5"},
        ),
        lambda: client.post(
            "/api/inventory/services",
            headers=headers,
            json={"device_id": device["id"], "name": "ssh"},
        ),
    ):
        before = await last_change()
        await asyncio.sleep(0.01)
        assert (await request()).status_code == 201
        changes.append(await last_change() != before)

    assert changes == [True, True]


async def test_a_subnet_without_an_address_is_rejected(inventory_client) -> None:
    client, csrf = inventory_client
    headers = {"X-CSRF-Token": csrf}
    network = await client.post(
        "/api/inventory/networks", headers=headers, json={"cidr": "10.0.0.0/24", "name": "LAN"}
    )
    device = await client.post(
        "/api/inventory/devices", headers=headers, json={"name": "PC", "device_type": "workstation"}
    )

    response = await client.post(
        f"/api/inventory/devices/{device.json()['id']}/interfaces",
        headers=headers,
        json={"name": "eth1", "network_id": network.json()["id"]},
    )

    assert response.status_code == 422
    assert "IP address" in response.json()["detail"]


async def test_audit_search_finds_old_events_by_actor_and_type(
    inventory_client,
    monkeypatch,
) -> None:
    from app.services import audit as audit_module

    client, _ = inventory_client
    monkeypatch.setattr(audit_module, "AUDIT_SEARCH_SCAN_LIMIT", 2)
    events = (await client.get("/api/audit/events", params={"q": "admin@example.com"})).json()
    # The login event is outside the two newest events once more events exist.
    for _ in range(3):
        await client.get("/api/inventory/export.json")

    found = (await client.get("/api/audit/events", params={"q": "login_success"})).json()

    assert events
    assert [event["event_type"] for event in found] == ["auth.login_success"]


async def test_sign_out_ends_the_session_without_a_csrf_token(inventory_client) -> None:
    client, _ = inventory_client

    response = await client.post("/api/auth/logout")

    assert response.status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_retry_after_reports_the_rest_of_the_window(monkeypatch) -> None:
    class CountingRedis:
        async def incr(self, _key):
            return 99

        async def expire(self, _key, _seconds):
            return None

        async def aclose(self):
            return None

    monkeypatch.setattr(rate_limit_module, "get_redis_client", lambda: CountingRedis())
    monkeypatch.setattr(rate_limit_module.time, "time", lambda: 1_000_045.0)
    dependency = rate_limit_module.rate_limit("test", limit=1, window_seconds=60)

    request = type("Request", (), {"client": type("Client", (), {"host": "10.0.0.1"})()})()
    with pytest.raises(rate_limit_module.HTTPException) as excinfo:
        await dependency(request)

    # 1_000_045 is 25 seconds into a 60 second window that ends at 1_000_080.
    assert excinfo.value.headers["Retry-After"] == "35"
    assert time.time() > 0
