from redis.asyncio import Redis

from app.core.config import settings


def get_redis_client() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def redis_ping() -> bool:
    client = get_redis_client()
    try:
        return bool(await client.ping())
    finally:
        await client.aclose()
