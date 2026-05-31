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
