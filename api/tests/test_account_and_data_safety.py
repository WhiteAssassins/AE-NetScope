import json
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from support import login

from app.api.routes import version as version_route
from app.core.config import settings
from app.db.base import Base
from app.models.audit import AuditEvent
from app.models.integration import IntegrationToken
from app.models.user import User
from app.schemas.security import PasskeyRegistrationVerifyRequest
from app.services import data_protection
from app.services.maintenance import purge_expired_records


@pytest.fixture()
async def empty_database():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield factory
    await engine.dispose()


async def test_rotation_without_fallback_key_keeps_values_recoverable(
    empty_database, monkeypatch
) -> None:
    old_key, new_key = "o" * 40, "n" * 40
    stored = data_protection.encrypt_sensitive_text("Rack A", key_material=old_key)
    async with empty_database() as session:
        await session.execute(
            text(
                "INSERT INTO vlans (id, vlan_id, name, description, created_at) "
                "VALUES (1, 10, 'Core', :description, '2026-01-01')"
            ),
            {"description": stored},
        )
        await session.commit()

    # The key is rotated and the previous key is forgotten on the first start.
    monkeypatch.setattr(settings, "data_encryption_key", new_key)
    monkeypatch.setattr(settings, "data_decryption_fallback_keys", "")
    async with empty_database() as session:
        await data_protection.migrate_sensitive_fields_to_primary_key(session)
        await session.commit()

    # Adding the previous key afterwards still recovers and migrates the value.
    monkeypatch.setattr(settings, "data_decryption_fallback_keys", old_key)
    async with empty_database() as session:
        assert await data_protection.migrate_sensitive_fields_to_primary_key(session) == 1
        await session.commit()
        value = (await session.execute(text("SELECT description FROM vlans"))).scalar_one()

    assert data_protection.decrypt_sensitive_text(value, key_materials=[new_key]) == "Rack A"


async def test_startup_migration_skips_encrypted_values_without_a_rotation(
    empty_database, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "data_decryption_fallback_keys", "")
    encrypted = data_protection.encrypt_sensitive_text("already protected")
    async with empty_database() as session:
        await session.execute(
            text(
                "INSERT INTO vlans (id, vlan_id, name, description, created_at) "
                "VALUES (1, 10, 'Core', :encrypted, '2026-01-01'), "
                "(2, 20, 'Lab', 'plain text', '2026-01-01')"
            ),
            {"encrypted": encrypted},
        )
        await session.commit()
    checked: list[str] = []
    original_check = data_protection.sensitive_text_uses_primary_key

    def tracking_check(value: str) -> bool:
        checked.append(value)
        return original_check(value)

    monkeypatch.setattr(data_protection, "sensitive_text_uses_primary_key", tracking_check)
    async with empty_database() as session:
        assert await data_protection.migrate_sensitive_fields_to_primary_key(session) == 1

    assert checked == ["plain text"]


async def test_credential_resets_revoke_integration_tokens(admin_api) -> None:
    client, headers, factory = admin_api
    created = await client.post(
        "/api/users",
        headers=headers,
        json={"email": "ops@example.com", "username": "ops", "role": "operator"},
    )
    user_id = created.json()["user"]["id"]
    now = datetime.now(UTC)
    async with factory() as session:
        admin = await session.scalar(select(User).where(User.email == "admin@example.com"))
        for owner, name in ((user_id, "reset"), (user_id, "deactivated"), (admin.id, "own")):
            session.add(
                IntegrationToken(
                    user_id=owner,
                    name=name,
                    token_hash=f"hash-{name}",
                    expires_at=now + timedelta(days=30),
                )
            )
        await session.commit()

    second = await client.post(
        "/api/users",
        headers=headers,
        json={"email": "net@example.com", "username": "net", "role": "operator"},
    )
    second_id = second.json()["user"]["id"]
    async with factory() as session:
        session.add(
            IntegrationToken(
                user_id=second_id,
                name="second",
                token_hash="hash-second",
                expires_at=now + timedelta(days=30),
            )
        )
        second_user = await session.get(User, second_id)
        second_user.totp_enabled = True
        second_user.totp_secret_encrypted = "encrypted"
        await session.commit()

    await client.post(f"/api/users/{second_id}/reset-mfa", headers=headers)
    async with factory() as session:
        second_token = await session.scalar(
            select(IntegrationToken).where(IntegrationToken.name == "second")
        )
        assert second_token.revoked_at is not None
        second_token.revoked_at = None
        await session.commit()
    await client.delete(f"/api/users/{second_id}", headers=headers)
    await client.post(f"/api/users/{user_id}/reset-password", headers=headers)
    await client.post(
        "/api/auth/password",
        headers=headers,
        json={"current_password": "correct-password", "new_password": "a-brand-new-password"},
    )

    async with factory() as session:
        tokens = (await session.scalars(select(IntegrationToken))).all()
    assert all(token.revoked_at is not None for token in tokens)


async def test_unsupported_browser_time_zones_are_rejected(security_client) -> None:
    csrf = (await login(security_client))["csrf_token"]
    for timezone, status in (("Factory", 422), ("localtime", 422), ("Europe/Madrid", 200)):
        response = await security_client.patch(
            "/api/auth/preferences/regional",
            headers={"X-CSRF-Token": csrf},
            json={"timezone": timezone, "date_format": "ymd", "hour_format": "24"},
        )
        assert response.status_code == status, timezone


async def test_passwords_cannot_be_padding_alone(security_client) -> None:
    csrf = (await login(security_client))["csrf_token"]
    blank = await security_client.post(
        "/api/auth/password",
        headers={"X-CSRF-Token": csrf},
        json={"current_password": "correct-password", "new_password": " " * 12},
    )
    padded = await security_client.post(
        "/api/auth/password",
        headers={"X-CSRF-Token": csrf},
        json={"current_password": "correct-password", "new_password": "   short   "},
    )

    assert (blank.status_code, padded.status_code) == (422, 422)


async def test_token_and_passkey_names_cannot_be_blank(integration_api) -> None:
    client, csrf, _ = integration_api
    token = await client.post(
        "/api/integrations/tokens",
        headers={"X-CSRF-Token": csrf},
        json={"name": "   ", "password": "integration-test-password"},
    )

    assert token.status_code == 422
    with pytest.raises(ValidationError):
        PasskeyRegistrationVerifyRequest(challenge_id="x" * 32, name="  ", credential={})


async def test_json_backup_downloads_as_a_file(inventory_client) -> None:
    client, _ = inventory_client
    response = await client.get("/api/inventory/export.json")

    assert response.status_code == 200
    assert response.headers["content-disposition"].startswith(
        'attachment; filename="ae-netscope-inventory-'
    )
    assert response.json()["format"] == "ae-netscope.inventory.v1"


def test_release_check_reads_a_full_page_of_releases(monkeypatch) -> None:
    requested: list[str] = []
    releases = [
        {
            "tag_name": f"v0.9.{index}-alpha",
            "html_url": f"https://example.com/{index}",
            "prerelease": True,
            "draft": False,
        }
        for index in range(60)
    ] + [
        {
            "tag_name": "v0.8.0",
            "html_url": "https://example.com/s",
            "prerelease": False,
            "draft": False,
        }
    ]

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    def fake_urlopen(request, timeout):
        requested.append(request.full_url)
        return FakeResponse()

    monkeypatch.setattr(version_route.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(version_route, "_read_json_response", lambda _response: releases)

    fetched = version_route.fetch_github_releases()

    assert "per_page=100" in requested[0]
    stable = version_route.latest_versioned_release(fetched, prerelease=False)
    assert stable is not None and stable.tag_name == "v0.8.0"


async def test_retention_removes_old_revoked_and_expired_tokens(
    empty_database, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "session_record_retention_days", 30)
    now = datetime.now(UTC)
    async with empty_database() as session:
        session.add(User(email="u@example.com", username="u", password_hash="x", role="viewer"))
        await session.flush()
        user = await session.scalar(select(User))
        for name, expires, revoked in (
            ("current", now + timedelta(days=10), None),
            ("old-expired", now - timedelta(days=40), None),
            ("old-revoked", now + timedelta(days=10), now - timedelta(days=40)),
            ("recently-revoked", now + timedelta(days=10), now - timedelta(days=1)),
        ):
            session.add(
                IntegrationToken(
                    user_id=user.id,
                    name=name,
                    token_hash=f"hash-{name}",
                    expires_at=expires,
                    revoked_at=revoked,
                )
            )
        await session.commit()
        await purge_expired_records(session)
        await session.commit()
        names = sorted((await session.scalars(select(IntegrationToken.name))).all())

    assert names == ["current", "recently-revoked"]


async def test_csv_exports_start_with_identifying_columns(inventory_client) -> None:
    client, csrf = inventory_client
    await client.post(
        "/api/inventory/devices",
        headers={"X-CSRF-Token": csrf},
        json={"name": "SRV", "device_type": "server"},
    )

    response = await client.get("/api/inventory/export/devices.csv")

    assert response.text.splitlines()[0].startswith("id,name,")


async def test_audit_events_can_be_filtered_by_group(admin_api) -> None:
    client, headers, factory = admin_api
    await client.patch(
        "/api/security/search-indexing", headers=headers, json={"allow_indexing": True}
    )

    events = (await client.get("/api/audit/events", params={"group": "settings"})).json()

    assert events and all(event["event_type"].startswith("settings.") for event in events)
    async with factory() as session:
        total = len((await session.scalars(select(AuditEvent))).all())
    assert total > len(events)
    assert json.loads(json.dumps(events))[0]["event_type"] == "settings.search_indexing_updated"
