import asyncio
from time import monotonic

from app.db.session import SessionLocal
from app.models.security import SystemSetting

_CACHE_SECONDS = 30.0
_cache_lock = asyncio.Lock()
_cached_allowed = False
_cache_expires_at = 0.0


def cache_search_engine_indexing_allowed(allowed: bool) -> None:
    global _cached_allowed, _cache_expires_at
    _cached_allowed = allowed
    _cache_expires_at = monotonic() + _CACHE_SECONDS


async def is_search_engine_indexing_allowed() -> bool:
    if monotonic() < _cache_expires_at:
        return _cached_allowed

    async with _cache_lock:
        if monotonic() < _cache_expires_at:
            return _cached_allowed
        try:
            async with SessionLocal() as session:
                state = await session.get(SystemSetting, 1)
                allowed = bool(state and state.search_engine_indexing_allowed)
        except Exception:
            allowed = False
        cache_search_engine_indexing_allowed(allowed)
        return allowed
