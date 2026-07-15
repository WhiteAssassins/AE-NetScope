from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app


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
