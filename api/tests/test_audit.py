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
async def audit_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        session.add_all(
            [
                User(
                    email="admin@example.com",
                    username="admin",
                    password_hash=hash_password("correct-password"),
                    role="admin",
                    must_change_password=False,
                ),
                User(
                    email="viewer@example.com",
                    username="viewer",
                    password_hash=hash_password("correct-password"),
                    role="viewer",
                    must_change_password=False,
                ),
            ]
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


async def test_admin_reads_audit_events(audit_client: AsyncClient) -> None:
    login = await audit_client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-password"},
    )
    assert login.status_code == 200

    events = await audit_client.get("/api/audit/events")
    assert events.status_code == 200
    assert events.json()[0]["event_type"] == "auth.login_success"
    assert events.json()[0]["actor_email"] == "admin@example.com"


async def test_viewer_cannot_read_audit_events(audit_client: AsyncClient) -> None:
    login = await audit_client.post(
        "/api/auth/login",
        json={"email": "viewer@example.com", "password": "correct-password"},
    )
    assert login.status_code == 200

    events = await audit_client.get("/api/audit/events")
    assert events.status_code == 403
