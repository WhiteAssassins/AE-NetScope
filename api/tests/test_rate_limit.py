from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.session import get_session
from app.main import app


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    async def expire(self, key: str, seconds: int) -> None:
        return None

    async def aclose(self) -> None:
        return None


async def test_login_rate_limit_uses_redis(monkeypatch) -> None:
    fake_redis = FakeRedis()

    def fake_client() -> FakeRedis:
        return fake_redis

    monkeypatch.setattr("app.core.rate_limit.get_redis_client", fake_client)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for _ in range(5):
            response = await client.post(
                "/api/auth/login",
                json={"email": "unknown@example.com", "password": "wrong-password"},
            )
            assert response.status_code == 401

        limited = await client.post(
            "/api/auth/login",
            json={"email": "unknown@example.com", "password": "wrong-password"},
        )
        assert limited.status_code == 429

    app.dependency_overrides.clear()
    await engine.dispose()
