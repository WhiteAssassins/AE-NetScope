from httpx import ASGITransport, AsyncClient

from app.api.routes import health as health_route
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
    assert response.json()["version"] == "0.1.7-alpha"
    assert response.json()["release_channel"] == "alpha"
    assert response.json()["releases_url"] == "https://github.com/WhiteAssassins/AE-NetScope/releases"
    assert response.json()["release_notes_url"].endswith("/tag/v0.1.7-alpha")


async def test_update_status_selects_prerelease_for_alpha(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()
    monkeypatch.setattr(
        version_route,
        "fetch_github_releases",
        lambda: [
            version_route.ReleaseInfo(
                tag_name="v0.1.4",
                html_url="https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.4",
                prerelease=False,
                draft=False,
            ),
            version_route.ReleaseInfo(
                tag_name="v0.1.8-alpha",
                html_url="https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.8-alpha",
                prerelease=True,
                draft=False,
            ),
        ],
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/version/updates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["latest_release"]["tag_name"] == "v0.1.4"
    assert payload["latest_prerelease"]["tag_name"] == "v0.1.8-alpha"
    assert payload["selected_release"]["tag_name"] == "v0.1.8-alpha"
    assert payload["update_available"] is True


async def test_update_status_uses_cached_github_releases(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()
    calls = 0

    def fake_releases():
        nonlocal calls
        calls += 1
        return [
            version_route.ReleaseInfo(
                tag_name="v0.1.8-alpha",
                html_url="https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.8-alpha",
                prerelease=True,
                draft=False,
            )
        ]

    monkeypatch.setattr(version_route, "fetch_github_releases", fake_releases)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.get("/api/version/updates")
        second = await client.get("/api/version/updates")

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == 1
    version_route.clear_release_cache()


async def test_update_status_handles_github_failure(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()

    def broken_releases():
        raise OSError("network unavailable")

    monkeypatch.setattr(version_route, "fetch_github_releases", broken_releases)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/version/updates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["latest_release"] is None
    assert payload["latest_prerelease"] is None
    assert payload["selected_release"] is None
    assert payload["update_available"] is False
    assert "GitHub releases could not be checked" in payload["update_capability"]["reason"]


def test_release_version_helpers() -> None:
    from app.api.routes import version as version_route

    assert version_route.is_release_newer("v0.1.8-alpha", "0.1.7-alpha") is True
    assert version_route.is_release_newer("v0.1.7-alpha", "0.1.8-alpha") is False
    assert version_route.is_release_newer("v0.1.7", "0.1.7-alpha") is True
    assert version_route.is_valid_release_tag("v0.1.8-alpha") is True
    assert version_route.is_valid_release_tag("v0.1.8-alpha;rm -rf /") is False


def test_optional_health_check_does_not_degrade_readiness() -> None:
    checks = {
        "database": {"status": "ok", "required": True},
        "optional_service": {"status": "error", "required": False},
    }

    assert health_route.required_checks_are_healthy(checks) is True


def test_required_health_check_degrades_readiness() -> None:
    checks = {
        "database": {"status": "error", "required": True},
        "optional_service": {"status": "ok", "required": False},
    }

    assert health_route.required_checks_are_healthy(checks) is False


async def test_start_update_rejects_invalid_tag(monkeypatch) -> None:
    from app.api.routes import version as version_route

    monkeypatch.setattr(version_route.settings, "deployment_platform", "docker")
    monkeypatch.setattr(version_route.settings, "auto_update_enabled", True)
    monkeypatch.setattr(version_route.settings, "auto_update_command", "docker compose pull")

    try:
        await version_route.start_update(version_route.UpdateRequest(tag_name="v0.1.8-alpha;rm"))
    except version_route.HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail == "Invalid release tag."
    else:
        raise AssertionError("Invalid update tag was accepted.")


async def test_start_update_executes_without_shell(monkeypatch) -> None:
    from app.api.routes import version as version_route

    calls: list[dict[str, object]] = []

    class FakeProcess:
        pass

    def fake_popen(args, *, shell, cwd):
        calls.append({"args": args, "shell": shell, "cwd": cwd})
        return FakeProcess()

    monkeypatch.setattr(version_route.settings, "deployment_platform", "docker")
    monkeypatch.setattr(version_route.settings, "auto_update_enabled", True)
    monkeypatch.setattr(
        version_route.settings,
        "auto_update_command",
        "docker compose up -d ae-netscope:{tag}",
    )
    monkeypatch.setattr(version_route.subprocess, "Popen", fake_popen)

    response = await version_route.start_update(
        version_route.UpdateRequest(tag_name="v0.1.8-alpha")
    )

    assert response.started is True
    assert calls == [
        {
            "args": ["docker", "compose", "up", "-d", "ae-netscope:v0.1.8-alpha"],
            "shell": False,
            "cwd": "/app",
        }
    ]


async def test_detailed_health_status_endpoint() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "AE NetScope"
    assert payload["version"] == "0.1.7-alpha"
    assert payload["release_channel"] == "alpha"
    assert payload["status"] in {"ready", "degraded"}
    assert payload["checks"]["api"]["status"] == "ok"
    assert payload["checks"]["api"]["message_code"] == "health.checkMessages.apiOk"
    assert payload["checks"]["api"]["latency_ms"] == 0.0
    assert "database" in payload["checks"]
    assert "redis" in payload["checks"]
    assert isinstance(payload["checks"]["database"]["latency_ms"], float)
    assert isinstance(payload["checks"]["redis"]["latency_ms"], float)
    assert isinstance(payload["duration_ms"], float)
