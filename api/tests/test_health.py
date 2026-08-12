import asyncio
import time

import pytest
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
    assert response.json() == {"status": "ok"}


async def test_version_endpoint() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/version")

    assert response.status_code == 200
    assert response.json()["app_name"] == "AE NetScope"
    assert response.json()["version"] == "0.2.0-alpha"
    assert response.json()["release_channel"] == "alpha"
    assert (
        response.json()["releases_url"] == "https://github.com/WhiteAssassins/AE-NetScope/releases"
    )
    assert response.json()["release_notes_url"].endswith("/tag/v0.2.0-alpha")


async def test_update_status_selects_prerelease_for_alpha(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()
    monkeypatch.setattr(
        version_route,
        "fetch_github_releases",
        lambda: [
            version_route.ReleaseDetails(
                tag_name="v0.1.4",
                html_url="https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.4",
                prerelease=False,
                draft=False,
            ),
            version_route.ReleaseDetails(
                tag_name="v0.2.1-alpha",
                html_url="https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.2.1-alpha",
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
    assert payload["latest_prerelease"]["tag_name"] == "v0.2.1-alpha"
    assert payload["selected_release"]["tag_name"] == "v0.2.1-alpha"
    assert payload["update_available"] is True


async def test_update_status_selects_highest_semantic_versions(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()
    monkeypatch.setattr(
        version_route,
        "fetch_github_releases",
        lambda: [
            version_route.ReleaseDetails(
                tag_name="v0.1.7-alpha",
                html_url="https://example.com/v0.1.7-alpha",
                prerelease=True,
                draft=False,
            ),
            version_route.ReleaseDetails(
                tag_name="v0.1.7",
                html_url="https://example.com/v0.1.7",
                prerelease=False,
                draft=False,
            ),
            version_route.ReleaseDetails(
                tag_name="v0.1.10-alpha",
                html_url="https://example.com/v0.1.10-alpha",
                prerelease=True,
                draft=False,
            ),
            version_route.ReleaseDetails(
                tag_name="v0.1.9",
                html_url="https://example.com/v0.1.9",
                prerelease=False,
                draft=False,
            ),
        ],
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/version/updates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["latest_release"]["tag_name"] == "v0.1.9"
    assert payload["latest_prerelease"]["tag_name"] == "v0.1.10-alpha"
    assert payload["selected_release"]["tag_name"] == "v0.1.10-alpha"
    version_route.clear_release_cache()


async def test_update_status_uses_cached_github_releases(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()
    calls = 0

    def fake_releases():
        nonlocal calls
        calls += 1
        return [
            version_route.ReleaseDetails(
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


async def test_concurrent_release_checks_share_one_github_request(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()
    calls = 0

    def slow_releases():
        nonlocal calls
        calls += 1
        time.sleep(0.05)
        return []

    monkeypatch.setattr(version_route, "fetch_github_releases", slow_releases)
    results = await asyncio.gather(
        *(version_route.fetch_github_releases_cached() for _ in range(8))
    )

    assert results == [[]] * 8
    assert calls == 1
    version_route.clear_release_cache()


async def test_failed_release_check_is_briefly_negative_cached(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()
    calls = 0

    def broken_releases():
        nonlocal calls
        calls += 1
        raise OSError("network unavailable")

    monkeypatch.setattr(version_route, "fetch_github_releases", broken_releases)
    with pytest.raises(OSError):
        await version_route.fetch_github_releases_cached()
    with pytest.raises(RuntimeError):
        await version_route.fetch_github_releases_cached()

    assert calls == 1
    version_route.clear_release_cache()


def test_github_response_size_is_bounded() -> None:
    from app.api.routes import version as version_route

    class OversizedResponse:
        def read(self, size: int) -> bytes:
            return b"x" * size

    with pytest.raises(ValueError, match="size limit"):
        version_route._read_json_response(OversizedResponse())


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


async def test_release_history_filters_drafts_and_channels(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()
    monkeypatch.setattr(
        version_route,
        "fetch_github_releases",
        lambda: [
            version_route.ReleaseDetails(
                tag_name="v0.1.8-alpha",
                html_url="https://example.com/v0.1.8-alpha",
                prerelease=True,
                draft=False,
                body="Alpha changes",
            ),
            version_route.ReleaseDetails(
                tag_name="v0.1.8",
                html_url="https://example.com/v0.1.8",
                prerelease=False,
                draft=False,
                body="Stable changes",
            ),
            version_route.ReleaseDetails(
                tag_name="v0.1.9-alpha",
                html_url="https://example.com/draft",
                prerelease=True,
                draft=True,
                body="Draft changes",
            ),
        ],
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        all_releases = await client.get("/api/version/releases?channel=all&limit=10")
        stable_releases = await client.get("/api/version/releases?channel=stable&limit=10")
        prereleases = await client.get("/api/version/releases?channel=prerelease&limit=10")

    assert [item["tag_name"] for item in all_releases.json()] == ["v0.1.8-alpha", "v0.1.8"]
    assert [item["tag_name"] for item in stable_releases.json()] == ["v0.1.8"]
    assert [item["tag_name"] for item in prereleases.json()] == ["v0.1.8-alpha"]
    assert prereleases.json()[0]["body"] == "Alpha changes"
    version_route.clear_release_cache()


async def test_release_history_validates_limit_and_handles_github_failure(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_release_cache()

    def broken_releases():
        raise OSError("network unavailable")

    monkeypatch.setattr(version_route, "fetch_github_releases", broken_releases)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        invalid_limit = await client.get("/api/version/releases?limit=11")
        unavailable = await client.get("/api/version/releases")

    assert invalid_limit.status_code == 422
    assert unavailable.status_code == 503
    assert unavailable.json()["detail"] == "GitHub release notes are temporarily unavailable."
    version_route.clear_release_cache()


async def test_repository_info_uses_cached_github_metadata(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_repository_cache()
    calls = 0

    def fake_repository():
        nonlocal calls
        calls += 1
        return version_route.RepositoryInfo(
            html_url="https://github.com/WhiteAssassins/AE-NetScope",
            stargazers_count=42,
            forks_count=7,
            open_issues_count=3,
        )

    monkeypatch.setattr(version_route, "fetch_repository_info", fake_repository)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.get("/api/version/repository")
        second = await client.get("/api/version/repository")

    assert first.status_code == 200
    assert second.json()["stargazers_count"] == 42
    assert calls == 1
    version_route.clear_repository_cache()


async def test_repository_info_handles_github_failure(monkeypatch) -> None:
    from app.api.routes import version as version_route

    version_route.clear_repository_cache()

    def broken_repository():
        raise OSError("network unavailable")

    monkeypatch.setattr(version_route, "fetch_repository_info", broken_repository)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/version/repository")

    assert response.status_code == 503
    assert response.json()["detail"] == "GitHub repository information is temporarily unavailable."


def test_release_version_helpers() -> None:
    from app.api.routes import version as version_route

    assert version_route.is_release_newer("v0.1.9-alpha", "0.1.8-alpha") is True
    assert version_route.is_release_newer("v0.1.8-alpha", "0.1.9-alpha") is False
    assert version_route.is_release_newer("v0.1.8", "0.1.8-alpha") is True
    assert version_route.is_release_newer("v0.1.8-alpha.10", "0.1.8-alpha.9") is True
    assert version_route.is_release_newer("v0.1.8-alpha.9", "0.1.8-alpha.10") is False
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
        await version_route.start_update(
            version_route.UpdateRequest(tag_name="v0.1.8-alpha;rm"), None, None
        )
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

    class FakeSession:
        def __init__(self):
            self.added = []

        def add(self, item):
            self.added.append(item)

        async def commit(self):
            return None

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

    fake_session = FakeSession()
    current_user = type("CurrentUser", (), {"id": 7})()
    response = await version_route.start_update(
        version_route.UpdateRequest(tag_name="v0.1.8-alpha"),
        fake_session,
        current_user,
    )

    assert response.started is True
    assert calls == [
        {
            "args": ["docker", "compose", "up", "-d", "ae-netscope:v0.1.8-alpha"],
            "shell": False,
            "cwd": "/app",
        }
    ]
    assert fake_session.added[0].target_tag == "v0.1.8-alpha"
    assert fake_session.added[0].status == "started"


async def test_update_monitor_records_process_result(monkeypatch) -> None:
    from app.api.routes import version as version_route

    history = type("History", (), {"status": "started", "message": None})()

    class FakeProcess:
        def wait(self):
            return 0

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, _model, _history_id):
            return history

        async def commit(self):
            return None

    monkeypatch.setattr(version_route, "SessionLocal", FakeSession)

    await version_route.monitor_update_process(FakeProcess(), 7)

    assert history.status == "succeeded"
    assert history.message == "The update command completed successfully."


async def test_detailed_health_status_endpoint() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health/status")

    assert response.status_code == 401

    payload = await health_route.collect_health_status()
    assert payload["service"] == "AE NetScope"
    assert payload["version"] == "0.2.0-alpha"
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


async def test_readiness_failure_does_not_expose_dependency_details(monkeypatch) -> None:
    async def degraded_status():
        return {
            "status": "degraded",
            "checks": {"database": {"message": "sensitive internal failure"}},
        }

    monkeypatch.setattr(health_route, "collect_health_status", degraded_status)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": {"status": "not_ready"}}
    assert "sensitive internal failure" not in response.text


async def test_public_health_summary_reports_failure_without_internal_details(monkeypatch) -> None:
    async def degraded_status():
        return {
            "status": "degraded",
            "service": "AE NetScope",
            "environment": "production",
            "version": "0.1.8-alpha",
            "release_channel": "alpha",
            "checked_at": "2026-07-21T00:00:00+00:00",
            "duration_ms": 4.0,
            "checks": {
                "database": {
                    "status": "error",
                    "required": True,
                    "message": "Database check failed: OperationalError.",
                    "message_code": "health.checkMessages.databaseError",
                    "latency_ms": 3.0,
                }
            },
        }

    monkeypatch.setattr(health_route, "collect_health_status", degraded_status)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health/summary")

    assert response.status_code == 200
    assert response.json()["checks"]["database"]["status"] == "error"
    assert "OperationalError" not in response.text
