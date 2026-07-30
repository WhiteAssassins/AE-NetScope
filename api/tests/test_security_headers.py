from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app
from app.services import search_indexing


async def test_api_responses_include_security_headers() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health/live")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cross-origin-opener-policy"] == "same-origin"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


async def test_sensitive_api_responses_are_never_cacheable(monkeypatch) -> None:
    monkeypatch.setattr(settings, "security_headers_enabled", False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/auth/me")

    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["vary"] == "Cookie"


async def test_search_engines_are_blocked_by_default(monkeypatch) -> None:
    async def indexing_blocked() -> bool:
        return False

    monkeypatch.setattr(
        search_indexing, "is_search_engine_indexing_allowed", indexing_blocked
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health/live")
        robots = await client.get("/robots.txt")

    assert response.headers["x-robots-tag"] == "noindex, nofollow, noarchive"
    assert robots.text == "User-agent: *\nDisallow: /\n"


async def test_search_engine_headers_and_robots_allow_indexing_when_enabled(
    monkeypatch,
) -> None:
    async def indexing_allowed() -> bool:
        return True

    monkeypatch.setattr(
        search_indexing, "is_search_engine_indexing_allowed", indexing_allowed
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health/live")
        robots = await client.get("/robots.txt")

    assert "x-robots-tag" not in response.headers
    assert robots.text == "User-agent: *\nAllow: /\n"
