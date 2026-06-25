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
