import time
from collections.abc import Callable

from fastapi import HTTPException, Request, status
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.redis import get_redis_client


def rate_limit(scope: str, *, limit: int | None = None, window_seconds: int = 60) -> Callable:
    async def dependency(request: Request) -> None:
        max_requests = limit or settings.auth_rate_limit_per_minute
        client_ip = request.client.host if request.client else "unknown"
        bucket = int(time.time() // window_seconds)
        key = f"ae_netscope:rate:{scope}:{client_ip}:{bucket}"

        redis = get_redis_client()
        try:
            current = await redis.incr(key)
            if current == 1:
                await redis.expire(key, window_seconds + 5)
        except RedisError:
            if settings.redis_rate_limit_fail_open:
                return
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Rate limit service unavailable.",
            ) from None
        finally:
            await redis.aclose()

        if current > max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Try again later.",
                headers={"Retry-After": str(window_seconds)},
            )

    return dependency
