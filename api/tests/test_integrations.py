from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.audit import AuditEvent
from app.models.integration import IntegrationToken
from app.models.user import User


async def issue(client, csrf, **kwargs):
    return await client.post(
        "/api/integrations/tokens",
        headers={"X-CSRF-Token": csrf},
        json={
            "name": "Inventory tools",
            "password": "integration-test-password",
            **kwargs,
        },
    )


async def test_token_lifecycle_and_audit(integration_api):
    client, csrf, factory = integration_api
    response = await issue(client, csrf, allow_write=True)
    assert response.status_code == 201
    data = response.json()
    assert response.headers["cache-control"].startswith("no-store")
    headers = {"Authorization": f"Bearer {data['token']}"}
    created = await client.post(
        "/api/inventory/devices", headers=headers, json={"name": "router", "device_type": "router"}
    )
    assert created.status_code == 201
    updated = await client.patch(
        f"/api/inventory/devices/{created.json()['id']}", headers=headers, json={"notes": "MDF"}
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "MDF"
    listed = await client.get("/api/integrations/tokens")
    assert "token" not in listed.json()[0] and "token_hash" not in listed.json()[0]
    async with factory() as session:
        record = await session.get(IntegrationToken, data["id"])
        assert record.token_hash != data["token"]
        events = (await session.scalars(select(AuditEvent))).all()
        assert any(event.event_type == "inventory.device_created" for event in events)
        assert all(event.actor_user_id == record.user_id for event in events)
    assert (
        await client.delete(
            f"/api/integrations/tokens/{data['id']}", headers={"X-CSRF-Token": csrf}
        )
    ).status_code == 204
    assert (await client.get("/api/inventory/devices", headers=headers)).status_code == 401


async def test_issuance_requires_csrf_password_and_write_role(integration_api):
    client, csrf, factory = integration_api
    assert (await issue(client, "bad")).status_code == 403
    assert (await issue(client, csrf, password="bad")).status_code == 403
    async with factory() as session:
        user = await session.scalar(select(User))
        user.role = "viewer"
        await session.commit()
    assert (await issue(client, csrf, allow_write=True)).status_code == 403
    assert (await issue(client, csrf, allow_write=False)).status_code == 201


@pytest.mark.parametrize(
    "path,method,payload",
    [
        ("/api/inventory/devices", "POST", {"name": "denied", "device_type": "server"}),
        ("/api/inventory/export.json", "GET", None),
        ("/api/inventory/import/preview", "POST", {}),
        ("/api/inventory/devices/1", "DELETE", None),
        ("/api/users", "GET", None),
        ("/api/integrations/tokens", "GET", None),
    ],
)
async def test_read_token_cannot_write_export_or_admin(integration_api, path, method, payload):
    client, csrf, _ = integration_api
    data = (await issue(client, csrf)).json()
    response = await client.request(
        method, path, json=payload, headers={"Authorization": f"Bearer {data['token']}"}
    )
    assert response.status_code == 403


async def test_write_token_cannot_delete_or_restore(integration_api):
    client, csrf, _ = integration_api
    data = (await issue(client, csrf, allow_write=True)).json()
    headers = {"Authorization": f"Bearer {data['token']}"}
    assert (await client.delete("/api/inventory/devices/1", headers=headers)).status_code == 403
    assert (
        await client.post("/api/inventory/import.json", headers=headers, json={})
    ).status_code == 403


@pytest.mark.parametrize(
    "change,status", [("expired", 401), ("inactive", 401), ("password", 403), ("role", 403)]
)
async def test_token_rechecks_expiry_and_account_state(integration_api, change, status):
    client, csrf, factory = integration_api
    data = (await issue(client, csrf, allow_write=True)).json()
    async with factory() as session:
        token = await session.get(IntegrationToken, data["id"])
        user = await session.get(User, token.user_id)
        if change == "expired":
            token.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        elif change == "inactive":
            user.is_active = False
        elif change == "password":
            user.must_change_password = True
        else:
            user.role = "viewer"
        await session.commit()
    response = await client.post(
        "/api/inventory/vlans",
        json={"vlan_id": 20, "name": "LAN"},
        headers={"Authorization": f"Bearer {data['token']}"},
    )
    assert response.status_code == status


async def test_invalid_bearer_does_not_fall_back_to_browser_session(integration_api):
    client, _, _ = integration_api
    response = await client.get(
        "/api/inventory/devices", headers={"Authorization": "Bearer invalid"}
    )
    assert response.status_code == 401


async def test_foreign_user_cannot_list_or_revoke_token(integration_api):
    client, csrf, factory = integration_api
    data = (await issue(client, csrf)).json()
    async with factory() as session:
        from app.core.security import hash_password

        session.add(
            User(
                email="other@example.com",
                username="other",
                role="operator",
                password_hash=hash_password("integration-test-password"),
            )
        )
        await session.commit()
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "other@example.com",
            "password": "integration-test-password",
        },
    )
    assert (await client.get("/api/integrations/tokens")).json() == []
    assert (
        await client.delete(
            f"/api/integrations/tokens/{data['id']}",
            headers={
                "X-CSRF-Token": response.json()["csrf_token"],
            },
        )
    ).status_code == 404


async def test_search_pages_distinct_records_and_escapes_wildcards(integration_api):
    client, csrf, _ = integration_api
    data = (await issue(client, csrf, allow_write=True)).json()
    headers = {"Authorization": f"Bearer {data['token']}"}
    for name in ("router-a", "router-b", "percent%device"):
        assert (
            await client.post(
                "/api/inventory/devices",
                headers=headers,
                json={"name": name, "device_type": "router"},
            )
        ).status_code == 201
    first = (
        await client.get(
            "/api/inventory/search",
            headers=headers,
            params={"resource": "devices", "query": "router", "limit": 1},
        )
    ).json()
    assert first["total"] == 3 and first["next_offset"] == 1
    second = (
        await client.get(
            "/api/inventory/search",
            headers=headers,
            params={
                "resource": "devices",
                "query": "router",
                "limit": 1,
                "offset": first["next_offset"],
            },
        )
    ).json()
    assert first["items"][0]["id"] != second["items"][0]["id"]
    literal = (
        await client.get(
            "/api/inventory/search", headers=headers, params={"resource": "devices", "query": "%"}
        )
    ).json()
    assert literal["total"] == 1
    assert literal["items"][0]["name"] == "percent%device"
    assert (
        await client.get(
            "/api/inventory/search", headers=headers, params={"resource": "devices", "limit": 101}
        )
    ).status_code == 422
