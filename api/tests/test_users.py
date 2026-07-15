import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.models.user import User
from app.schemas.users import ManagedUserUpdate
from app.services.users import LastAdminError, update_managed_user


@pytest.fixture()
async def users_client():
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


async def test_admin_manages_users_by_role(users_client) -> None:
    client, csrf_token = users_client

    created = await client.post(
        "/api/users",
        headers={"X-CSRF-Token": csrf_token},
        json={"email": "operator@example.com", "username": "operator", "role": "operator"},
    )
    assert created.status_code == 201
    assert created.json()["temporary_password"]
    assert created.json()["user"]["must_change_password"] is True

    user_id = created.json()["user"]["id"]

    updated = await client.patch(
        f"/api/users/{user_id}",
        headers={"X-CSRF-Token": csrf_token},
        json={"role": "viewer", "is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["role"] == "viewer"
    assert updated.json()["is_active"] is False

    reset = await client.post(
        f"/api/users/{user_id}/reset-password",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert reset.status_code == 200
    assert reset.json()["temporary_password"]
    assert reset.json()["user"]["must_change_password"] is True

    deleted = await client.delete(
        f"/api/users/{user_id}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deleted.status_code == 200
    assert deleted.json()["is_active"] is False

    users = await client.get("/api/users")
    assert users.status_code == 200
    assert len(users.json()) == 2


async def test_admin_can_revoke_user_sessions(users_client) -> None:
    client, csrf_token = users_client

    created = await client.post(
        "/api/users",
        headers={"X-CSRF-Token": csrf_token},
        json={"email": "operator@example.com", "username": "operator", "role": "operator"},
    )
    temporary_password = created.json()["temporary_password"]
    user_id = created.json()["user"]["id"]

    operator_client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    login = await operator_client.post(
        "/api/auth/login",
        json={"email": "operator@example.com", "password": temporary_password},
    )
    assert login.status_code == 200

    sessions = await client.get(f"/api/users/{user_id}/sessions")
    assert sessions.status_code == 200
    assert any(item["revoked_at"] is None for item in sessions.json())

    revoked = await client.delete(
        f"/api/users/{user_id}/sessions",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert revoked.status_code == 204

    blocked = await operator_client.get("/api/auth/me")
    assert blocked.status_code == 401
    await operator_client.aclose()


async def test_admin_cannot_remove_last_active_admin(users_client) -> None:
    client, csrf_token = users_client

    users = await client.get("/api/users")
    admin_id = next(item["id"] for item in users.json() if item["email"] == "admin@example.com")

    demote = await client.patch(
        f"/api/users/{admin_id}",
        headers={"X-CSRF-Token": csrf_token},
        json={"role": "viewer"},
    )
    assert demote.status_code == 409

    deactivate = await client.delete(
        f"/api/users/{admin_id}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert deactivate.status_code == 409


async def test_concurrent_admin_demotions_preserve_one_active_admin(tmp_path) -> None:
    database_path = tmp_path / "concurrent-admin-update.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path.as_posix()}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        first_admin = User(
            email="first-admin@example.com",
            username="first-admin",
            password_hash=hash_password("correct-password"),
            role="admin",
        )
        second_admin = User(
            email="second-admin@example.com",
            username="second-admin",
            password_hash=hash_password("correct-password"),
            role="admin",
        )
        session.add_all([first_admin, second_admin])
        await session.commit()
        admin_ids = (first_admin.id, second_admin.id)

    async def demote(user_id: int) -> bool:
        async with session_factory() as session:
            user = await session.get(User, user_id)
            assert user is not None
            try:
                await update_managed_user(session, user, ManagedUserUpdate(role="viewer"))
                await session.commit()
                return True
            except LastAdminError:
                await session.rollback()
                return False

    results = await asyncio.gather(*(demote(user_id) for user_id in admin_ids))

    async with session_factory() as session:
        active_admins = await session.scalar(
            select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True))
        )

    assert sorted(results) == [False, True]
    assert active_admins == 1
    await engine.dispose()
