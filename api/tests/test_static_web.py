from pathlib import Path

from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import create_app
from app.services import search_indexing


async def test_static_web_mount_serves_assets_and_spa_fallback(tmp_path: Path, monkeypatch) -> None:
    dist_dir = tmp_path / "dist"
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True)
    (dist_dir / "index.html").write_text("<!doctype html><div id='root'></div>", encoding="utf-8")
    (assets_dir / "app.js").write_text("console.log('ae-netscope')", encoding="utf-8")

    monkeypatch.setattr(settings, "app_web_dist_dir", str(dist_dir))

    app = create_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        asset_response = await client.get("/assets/app.js")
        spa_response = await client.get("/devices")
        api_response = await client.get("/api/health/live")

    assert asset_response.status_code == 200
    assert "ae-netscope" in asset_response.text
    assert spa_response.status_code == 200
    assert "root" in spa_response.text
    assert api_response.status_code == 200
    assert api_response.json()["status"] == "ok"


async def test_static_web_updates_robots_meta_when_indexing_is_allowed(
    tmp_path: Path, monkeypatch
) -> None:
    dist_dir = tmp_path / "dist"
    (dist_dir / "assets").mkdir(parents=True)
    (dist_dir / "index.html").write_text(
        '<meta name="robots" content="noindex, nofollow, noarchive"><div id="root"></div>',
        encoding="utf-8",
    )

    async def indexing_allowed() -> bool:
        return True

    monkeypatch.setattr(settings, "app_web_dist_dir", str(dist_dir))
    monkeypatch.setattr(
        search_indexing, "is_search_engine_indexing_allowed", indexing_allowed
    )
    test_app = create_app()

    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://test"
    ) as client:
        response = await client.get("/devices")

    assert response.status_code == 200
    assert 'content="index, follow"' in response.text
    assert "x-robots-tag" not in response.headers
