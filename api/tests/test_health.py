from httpx import ASGITransport, AsyncClient

from app.main import app


async def test_health_endpoint() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_live_health_endpoint() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_version_endpoint() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/version")

    assert response.status_code == 200
    assert response.json()["app_name"] == "AE NetScope"
    assert response.json()["version"] == "0.1.1-alpha"
    assert response.json()["release_channel"] == "alpha"
    assert response.json()["releases_url"] == "https://github.com/WhiteAssassins/AE-NetScope/releases"
    assert response.json()["release_notes_url"].endswith("/tag/v0.1.1-alpha")


async def test_detailed_health_status_endpoint() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "AE NetScope"
    assert payload["version"] == "0.1.1-alpha"
    assert payload["release_channel"] == "alpha"
    assert payload["status"] in {"ready", "degraded"}
    assert payload["checks"]["api"]["status"] == "ok"
    assert "database" in payload["checks"]
    assert "redis" in payload["checks"]
