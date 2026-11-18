from redis.asyncio import Redis

from app.core.config import settings

# An unreachable Redis must fail fast: rate limits fail open and health checks report
# an error instead of holding the request until the operating system gives up.
REDIS_SOCKET_TIMEOUT_SECONDS = 2.0


def get_redis_client() -> Redis:
    return Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
        socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
    )


async def redis_ping() -> bool:
    client = get_redis_client()
    try:
        return bool(await client.ping())
    finally:
        await client.aclose()
