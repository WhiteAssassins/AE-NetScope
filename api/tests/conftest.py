import pytest
from redis.exceptions import RedisError

from app.core.config import settings
from app.main import app


class OfflineRedis:
    async def incr(self, key: str) -> int:
        raise RedisError("Redis disabled for isolated tests.")

    async def expire(self, key: str, seconds: int) -> None:
        return None

    async def aclose(self) -> None:
        return None


@pytest.fixture(autouse=True)
def isolate_external_services(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "redis_rate_limit_fail_open", True)
    monkeypatch.setattr("app.core.rate_limit.get_redis_client", lambda: OfflineRedis())
    yield
    app.dependency_overrides.clear()


@pytest.fixture
async def integration_api():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.security import hash_password
    from app.db.base import Base
    from app.db.session import get_session
    from app.models.user import User

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as session:
        session.add(
            User(
                email="integration@example.com",
                username="integration",
                password_hash=hash_password("integration-test-password"),
                role="operator",
            )
        )
        await session.commit()

    async def override_session():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={
                "email": "integration@example.com",
                "password": "integration-test-password",
            },
        )
        csrf = login.json()["csrf_token"]
        yield client, csrf, factory
    app.dependency_overrides.clear()
    await engine.dispose()
