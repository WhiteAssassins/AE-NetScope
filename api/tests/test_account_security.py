import time

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.models.user import User
from app.services.mfa import (
    _totp_code,
    decrypt_totp_secret,
    encrypt_totp_secret,
    totp_secret_uses_primary_key,
    verify_totp,
)


@pytest.fixture()
async def security_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with session_factory() as session:
        session.add(
            User(
                email="security@example.com",
                username="security-admin",
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
        yield client
    app.dependency_overrides.clear()
    await engine.dispose()


async def login(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/auth/login",
        json={"email": "security@example.com", "password": "correct-password"},
    )
    assert response.status_code == 200
    return response.json()


async def test_regional_preferences_and_session_revocation(security_client: AsyncClient) -> None:
    await login(security_client)
    second_login = await login(security_client)
    csrf = second_login["csrf_token"]

    preference_response = await security_client.patch(
        "/api/auth/preferences/regional",
        headers={"X-CSRF-Token": csrf},
        json={"timezone": "America/New_York", "date_format": "mdy", "hour_format": "12"},
    )
    assert preference_response.status_code == 200
    assert preference_response.json()["user"]["timezone"] == "America/New_York"

    sessions = await security_client.get("/api/auth/sessions")
    assert sessions.status_code == 200
    assert len(sessions.json()) == 2
    assert sum(item["is_current"] for item in sessions.json()) == 1

    close_response = await security_client.delete(
        "/api/auth/sessions/others", headers={"X-CSRF-Token": csrf}
    )
    assert close_response.status_code == 204
    remaining = await security_client.get("/api/auth/sessions")
    assert len(remaining.json()) == 1
    assert remaining.json()[0]["is_current"] is True


async def test_account_preferences_are_saved_atomically(security_client: AsyncClient) -> None:
    auth = await login(security_client)
    response = await security_client.patch(
        "/api/auth/preferences",
        headers={"X-CSRF-Token": auth["csrf_token"]},
        json={
            "language": "es",
            "timezone": "America/New_York",
            "date_format": "mdy",
            "hour_format": "12",
        },
    )

    assert response.status_code == 200
    user = response.json()["user"]
    assert user["preferred_language"] == "es"
    assert user["timezone"] == "America/New_York"
    assert user["date_format"] == "mdy"
    assert user["hour_format"] == "12"


async def test_totp_setup_confirmation_and_login_challenge(security_client: AsyncClient) -> None:
    auth = await login(security_client)
    csrf = auth["csrf_token"]
    setup = await security_client.post(
        "/api/auth/totp/setup",
        headers={"X-CSRF-Token": csrf},
        json={"current_password": "correct-password"},
    )
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    code = _totp_code(secret, int(time.time()) // 30)
    assert verify_totp(secret, code)

    confirmation = await security_client.post(
        "/api/auth/totp/confirm",
        headers={"X-CSRF-Token": csrf},
        json={"code": code},
    )
    assert confirmation.status_code == 200
    assert confirmation.json()["user"]["totp_enabled"] is True

    without_code = await security_client.post(
        "/api/auth/login",
        json={"email": "security@example.com", "password": "correct-password"},
    )
    assert without_code.status_code == 428
    assert without_code.json()["detail"]["code"] == "totp_required"

    with_code = await security_client.post(
        "/api/auth/login",
        json={
            "email": "security@example.com",
            "password": "correct-password",
            "totp_code": _totp_code(secret, int(time.time()) // 30),
        },
    )
    assert with_code.status_code == 200


async def test_maintenance_and_passkey_capability(
    security_client: AsyncClient, monkeypatch
) -> None:
    auth = await login(security_client)
    csrf = auth["csrf_token"]
    response = await security_client.patch(
        "/api/security/maintenance",
        headers={"X-CSRF-Token": csrf},
        json={"enabled": True, "message": "Applying database maintenance."},
    )
    assert response.status_code == 200
    assert response.json() == {
        "enabled": True,
        "message": "Applying database maintenance.",
    }

    monkeypatch.setattr(settings, "webauthn_rp_id", None)
    monkeypatch.setattr(settings, "webauthn_origin", None)
    capability = await security_client.get("/api/security/passkeys/capability")
    assert capability.status_code == 200
    assert capability.json()["enabled"] is False


async def test_admin_can_control_public_search_indexing_policy(
    security_client: AsyncClient,
) -> None:
    initial = await security_client.get("/api/security/search-indexing")
    assert initial.status_code == 200
    assert initial.json() == {"allow_indexing": False}

    auth = await login(security_client)
    updated = await security_client.patch(
        "/api/security/search-indexing",
        headers={"X-CSRF-Token": auth["csrf_token"]},
        json={"allow_indexing": True},
    )
    assert updated.status_code == 200
    assert updated.json() == {"allow_indexing": True}

    persisted = await security_client.get("/api/security/search-indexing")
    assert persisted.json() == {"allow_indexing": True}


async def test_passkey_registration_options_are_bound_to_configured_rp(
    security_client: AsyncClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "webauthn_rp_id", "test")
    monkeypatch.setattr(settings, "webauthn_origin", "http://test")
    auth = await login(security_client)
    response = await security_client.post(
        "/api/security/passkeys/register/options",
        headers={"X-CSRF-Token": auth["csrf_token"]},
        json={"current_password": "correct-password"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["challenge_id"]) >= 32
    assert payload["options"]["rp"]["id"] == "test"
    assert payload["options"]["user"]["name"] == "security@example.com"


async def test_passkey_options_do_not_reveal_unknown_accounts(
    security_client: AsyncClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "webauthn_rp_id", "test")
    monkeypatch.setattr(settings, "webauthn_origin", "http://test")

    response = await security_client.post(
        "/api/security/passkeys/authenticate/options",
        json={"email": "missing@example.com"},
    )

    assert response.status_code == 200
    assert len(response.json()["options"]["allowCredentials"]) == 8


def test_totp_encryption_accepts_legacy_session_secret_during_key_rotation(monkeypatch) -> None:
    monkeypatch.setattr(settings, "session_secret", "legacy-session-secret")
    monkeypatch.setattr(settings, "mfa_encryption_key", None)
    legacy_secret = encrypt_totp_secret("JBSWY3DPEHPK3PXP")

    monkeypatch.setattr(settings, "mfa_encryption_key", "independent-mfa-secret")

    assert decrypt_totp_secret(legacy_secret) == "JBSWY3DPEHPK3PXP"
    assert totp_secret_uses_primary_key(legacy_secret) is False
