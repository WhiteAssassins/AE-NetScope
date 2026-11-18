import time

import pytest
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.version import UNTAGGED_UPDATE_MESSAGE_PREFIX, project_version
from app.db.base import Base
from app.models.audit import AuditEvent
from app.models.security import UpdateHistory
from app.models.user import User
from app.services.maintenance import reconcile_interrupted_updates
from app.services.mfa import _totp_code


async def event_count(factory, event_type: str) -> int:
    async with factory() as session:
        statement = select(AuditEvent).where(AuditEvent.event_type == event_type)
        return len((await session.scalars(statement)).all())


async def create_viewer(client, headers) -> int:
    created = await client.post(
        "/api/users",
        headers=headers,
        json={"email": "viewer@example.com", "username": "viewer", "role": "viewer"},
    )
    return created.json()["user"]["id"]


async def test_maintenance_can_be_disabled_without_a_message(admin_api) -> None:
    client, headers, _ = admin_api
    await client.patch(
        "/api/security/maintenance",
        headers=headers,
        json={"enabled": True, "message": "Disk replacement."},
    )

    disabled = await client.patch(
        "/api/security/maintenance", headers=headers, json={"enabled": False, "message": "  "}
    )

    assert disabled.status_code == 200
    assert disabled.json() == {"enabled": False, "message": "Disk replacement."}


async def test_totp_endpoints_respect_the_current_state(admin_api) -> None:
    client, headers, _ = admin_api
    setup = await client.post(
        "/api/auth/totp/setup", headers=headers, json={"current_password": "correct-password"}
    )
    secret = setup.json()["secret"]
    code = _totp_code(secret, int(time.time()) // 30)

    never_enabled = await client.request(
        "DELETE",
        "/api/auth/totp",
        headers=headers,
        json={"current_password": "correct-password", "code": code},
    )
    assert never_enabled.status_code == 409

    assert (
        await client.post("/api/auth/totp/confirm", headers=headers, json={"code": code})
    ).status_code == 200
    next_code = _totp_code(secret, int(time.time()) // 30 + 1)
    again = await client.post("/api/auth/totp/confirm", headers=headers, json={"code": next_code})
    assert again.status_code == 409


async def test_repeated_deactivations_are_audited_once(admin_api) -> None:
    client, headers, factory = admin_api
    user_id = await create_viewer(client, headers)
    device = await client.post(
        "/api/inventory/devices", headers=headers, json={"name": "SW-01", "device_type": "switch"}
    )

    for _ in range(2):
        assert (await client.delete(f"/api/users/{user_id}", headers=headers)).status_code == 200
        deactivated = await client.post(
            f"/api/inventory/devices/{device.json()['id']}/deactivate", headers=headers
        )
        assert deactivated.status_code == 200

    assert await event_count(factory, "users.deactivated") == 1
    assert await event_count(factory, "inventory.device_deactivated") == 1


async def test_unchanged_user_update_is_not_audited(admin_api) -> None:
    client, headers, factory = admin_api
    user_id = await create_viewer(client, headers)

    for payload in ({}, {"role": "viewer", "username": "viewer"}, {"clear_lock": True}):
        response = await client.patch(f"/api/users/{user_id}", headers=headers, json=payload)
        assert response.status_code == 200

    assert await event_count(factory, "users.updated") == 0
    changed = await client.patch(
        f"/api/users/{user_id}", headers=headers, json={"role": "operator"}
    )
    assert changed.status_code == 200
    assert await event_count(factory, "users.updated") == 1


async def test_mfa_reset_requires_an_mfa_method(admin_api) -> None:
    client, headers, factory = admin_api
    user_id = await create_viewer(client, headers)

    without_mfa = await client.post(f"/api/users/{user_id}/reset-mfa", headers=headers)
    assert without_mfa.status_code == 409

    async with factory() as session:
        user = await session.get(User, user_id)
        user.totp_enabled = True
        user.totp_secret_encrypted = "encrypted"
        await session.commit()
    with_mfa = await client.post(f"/api/users/{user_id}/reset-mfa", headers=headers)

    assert with_mfa.status_code == 204
    assert await event_count(factory, "users.mfa_reset") == 1


async def test_password_prompts_upgrade_outdated_hashes(admin_api) -> None:
    client, headers, factory = admin_api
    outdated = Argon2Hasher(time_cost=1, memory_cost=8192, parallelism=1).hash("correct-password")
    async with factory() as session:
        admin = await session.scalar(select(User).where(User.email == "admin@example.com"))
        admin.password_hash = outdated
        await session.commit()

    response = await client.post(
        "/api/auth/totp/setup", headers=headers, json={"current_password": "correct-password"}
    )

    assert response.status_code == 200
    async with factory() as session:
        admin = await session.scalar(select(User).where(User.email == "admin@example.com"))
        assert admin.password_hash != outdated


async def test_failed_token_password_is_audited(integration_api) -> None:
    client, csrf, factory = integration_api
    response = await client.post(
        "/api/integrations/tokens",
        headers={"X-CSRF-Token": csrf},
        json={"name": "Inventory tools", "password": "wrong-password"},
    )

    assert response.status_code == 403
    assert await event_count(factory, "integration.token_create_failed") == 1


@pytest.mark.parametrize(("started_on", "status"), [("0.0.1", "succeeded"), (None, "unknown")])
async def test_untagged_update_is_reconciled_from_its_starting_version(started_on, status) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as session:
        session.add(
            UpdateHistory(
                target_tag="configured-target",
                status="started",
                message=f"{UNTAGGED_UPDATE_MESSAGE_PREFIX}{started_on or project_version()}.",
            )
        )
        await session.commit()
        await reconcile_interrupted_updates(session)
        await session.commit()
        history = (await session.scalars(select(UpdateHistory))).one()
    await engine.dispose()

    assert history.status == status
