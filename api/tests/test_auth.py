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
async def auth_client():
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
                must_change_password=True,
            )
        )
        await session.commit()

    async def override_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()
    await engine.dispose()


async def test_login_me_and_logout(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )

    assert login_response.status_code == 200
    assert login_response.json()["user"]["email"] == "admin@example.com"
    assert login_response.json()["user"]["preferred_language"] == "en"
    assert login_response.json()["user"]["permissions"] == [
        "audit:read",
        "devices:create",
        "devices:delete",
        "devices:update",
        "inventory:read",
        "ip_addresses:create",
        "ip_addresses:delete",
        "ip_addresses:update",
        "networks:create",
        "networks:delete",
        "networks:update",
        "services:create",
        "services:delete",
        "services:update",
        "settings:manage",
        "users:manage",
        "vlans:create",
        "vlans:delete",
        "vlans:update",
    ]
    csrf_token = login_response.json()["csrf_token"]
    assert "ae_netscope_session" in login_response.cookies

    me_response = await auth_client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["user"]["username"] == "admin"

    logout_response = await auth_client.post(
        "/api/auth/logout",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert logout_response.status_code == 204

    me_after_logout = await auth_client.get("/api/auth/me")
    assert me_after_logout.status_code == 401


async def test_login_rejects_wrong_password(auth_client: AsyncClient) -> None:
    response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401


async def test_single_wrong_password_does_not_lock_account(auth_client: AsyncClient) -> None:
    wrong_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "wrong-password"},
    )
    assert wrong_response.status_code == 401

    correct_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    assert correct_response.status_code == 200


async def test_change_password_requires_csrf(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )

    assert login_response.status_code == 200

    response = await auth_client.post(
        "/api/auth/password",
        json={"current_password": "correct-password", "new_password": "new-secure-password"},
    )

    assert response.status_code == 403


async def test_change_password_clears_required_flag(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    csrf_token = login_response.json()["csrf_token"]

    response = await auth_client.post(
        "/api/auth/password",
        headers={"X-CSRF-Token": csrf_token},
        json={"current_password": "correct-password", "new_password": "new-secure-password"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["must_change_password"] is False


async def test_temporary_password_user_cannot_use_privileged_apis(
    auth_client: AsyncClient,
) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )

    assert login_response.status_code == 200

    response = await auth_client.get("/api/users")

    assert response.status_code == 403
    assert response.json()["detail"] == "Password change required."


async def test_change_password_revokes_other_sessions(auth_client: AsyncClient) -> None:
    first_login = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    csrf_token = first_login.json()["csrf_token"]

    second_client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    second_login = await second_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    assert second_login.status_code == 200
    assert (await second_client.get("/api/auth/me")).status_code == 200

    response = await auth_client.post(
        "/api/auth/password",
        headers={"X-CSRF-Token": csrf_token},
        json={"current_password": "correct-password", "new_password": "new-secure-password"},
    )

    assert response.status_code == 200
    assert (await auth_client.get("/api/auth/me")).status_code == 200
    assert (await second_client.get("/api/auth/me")).status_code == 401
    await second_client.aclose()


async def test_change_email_requires_csrf(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    assert login_response.status_code == 200

    response = await auth_client.post(
        "/api/auth/email",
        json={"current_password": "correct-password", "new_email": "admin@aewhitedevs.com"},
    )

    assert response.status_code == 403


async def test_user_can_change_own_email(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    csrf_token = login_response.json()["csrf_token"]

    response = await auth_client.post(
        "/api/auth/email",
        headers={"X-CSRF-Token": csrf_token},
        json={"current_password": "correct-password", "new_email": "admin@aewhitedevs.com"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "admin@aewhitedevs.com"

    login_with_new_email = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@aewhitedevs.com", "password": "correct-password"},
    )
    assert login_with_new_email.status_code == 200


async def test_change_email_rejects_wrong_password(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    csrf_token = login_response.json()["csrf_token"]

    response = await auth_client.post(
        "/api/auth/email",
        headers={"X-CSRF-Token": csrf_token},
        json={"current_password": "wrong-password", "new_email": "admin@aewhitedevs.com"},
    )

    assert response.status_code == 400


async def test_change_email_rejects_duplicate_email(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    csrf_token = login_response.json()["csrf_token"]
    password_response = await auth_client.post(
        "/api/auth/password",
        headers={"X-CSRF-Token": csrf_token},
        json={"current_password": "correct-password", "new_password": "new-secure-password"},
    )
    assert password_response.status_code == 200

    created_user = await auth_client.post(
        "/api/users",
        headers={"X-CSRF-Token": csrf_token},
        json={"email": "operator@example.com", "username": "operator", "role": "operator"},
    )
    assert created_user.status_code == 201

    response = await auth_client.post(
        "/api/auth/email",
        headers={"X-CSRF-Token": csrf_token},
        json={"current_password": "new-secure-password", "new_email": "operator@example.com"},
    )

    assert response.status_code == 409


async def test_user_can_persist_preferred_language(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    csrf_token = login_response.json()["csrf_token"]

    response = await auth_client.patch(
        "/api/auth/preferences/language",
        headers={"X-CSRF-Token": csrf_token},
        json={"language": "es"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["preferred_language"] == "es"
    me_response = await auth_client.get("/api/auth/me")
    assert me_response.json()["user"]["preferred_language"] == "es"

    extended_locale = "en-abcdef12-abcdef12"
    extended_response = await auth_client.patch(
        "/api/auth/preferences/language",
        headers={"X-CSRF-Token": csrf_token},
        json={"language": extended_locale},
    )
    assert extended_response.status_code == 200
    assert extended_response.json()["user"]["preferred_language"] == extended_locale


async def test_language_preference_requires_csrf_and_valid_locale(auth_client: AsyncClient) -> None:
    login_response = await auth_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    csrf_token = login_response.json()["csrf_token"]

    missing_csrf = await auth_client.patch(
        "/api/auth/preferences/language",
        json={"language": "es"},
    )
    invalid_locale = await auth_client.patch(
        "/api/auth/preferences/language",
        headers={"X-CSRF-Token": csrf_token},
        json={"language": "not a locale"},
    )

    assert missing_csrf.status_code == 403
    assert invalid_locale.status_code == 422


async def test_initial_setup_creates_first_admin_only_once() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        status_response = await client.get("/api/auth/setup")
        assert status_response.status_code == 200
        assert status_response.json()["setup_required"] is True

        setup_response = await client.post(
            "/api/auth/setup",
            json={
                "email": "owner@example.com",
                "username": "owner",
                "password": "first-secure-password",
            },
        )
        assert setup_response.status_code == 200
        assert setup_response.json()["user"]["role"] == "admin"
        assert setup_response.json()["user"]["must_change_password"] is False
        assert "ae_netscope_session" in setup_response.cookies

        repeated_setup = await client.post(
            "/api/auth/setup",
            json={
                "email": "other@example.com",
                "username": "other",
                "password": "second-secure-password",
            },
        )
        assert repeated_setup.status_code == 409

        final_status = await client.get("/api/auth/setup")
        assert final_status.json()["setup_required"] is False

    app.dependency_overrides.clear()
    await engine.dispose()
