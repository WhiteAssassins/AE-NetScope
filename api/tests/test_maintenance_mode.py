from types import SimpleNamespace

import pytest
from starlette.responses import Response
from support import FakeSession, request

from app.middleware import maintenance_mode


async def test_maintenance_blocks_non_admin_and_allows_admin(monkeypatch) -> None:
    state = SimpleNamespace(maintenance_enabled=True, maintenance_message="Maintenance")
    monkeypatch.setattr(maintenance_mode, "SessionLocal", lambda: FakeSession(state))

    async def regular_user(*_args):
        return None

    monkeypatch.setattr(maintenance_mode, "get_user_by_session_token", regular_user)

    async def next_response(_request):
        return Response("ok")

    blocked = await maintenance_mode.maintenance_mode_middleware(request(), next_response)
    assert blocked.status_code == 503
    assert blocked.headers["retry-after"] == "300"

    async def admin_user(*_args):
        return SimpleNamespace(role="admin")

    monkeypatch.setattr(maintenance_mode, "get_user_by_session_token", admin_user)
    allowed = await maintenance_mode.maintenance_mode_middleware(request(), next_response)
    assert allowed.status_code == 200


async def test_maintenance_only_allows_explicit_public_auth_routes(monkeypatch) -> None:
    state = SimpleNamespace(maintenance_enabled=True, maintenance_message="Maintenance")
    monkeypatch.setattr(maintenance_mode, "SessionLocal", lambda: FakeSession(state))

    async def regular_user(*_args):
        return None

    async def next_response(_request):
        return Response("ok")

    monkeypatch.setattr(maintenance_mode, "get_user_by_session_token", regular_user)

    login = await maintenance_mode.maintenance_mode_middleware(
        request("/api/auth/login"), next_response
    )
    preferences = await maintenance_mode.maintenance_mode_middleware(
        request("/api/auth/preferences/regional"), next_response
    )
    totp = await maintenance_mode.maintenance_mode_middleware(
        request("/api/auth/totp/setup"), next_response
    )

    assert login.status_code == 200
    assert preferences.status_code == 503
    assert totp.status_code == 503


async def test_maintenance_does_not_swallow_downstream_errors(monkeypatch) -> None:
    state = SimpleNamespace(maintenance_enabled=False, maintenance_message="Maintenance")
    monkeypatch.setattr(maintenance_mode, "SessionLocal", lambda: FakeSession(state))

    calls = 0

    async def failing_next(_request):
        nonlocal calls
        calls += 1
        raise RuntimeError("downstream failure")

    with pytest.raises(RuntimeError, match="downstream failure"):
        await maintenance_mode.maintenance_mode_middleware(request(), failing_next)

    assert calls == 1


async def test_maintenance_lookup_failure_lets_the_request_through(monkeypatch) -> None:
    def broken_session():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(maintenance_mode, "SessionLocal", broken_session)

    async def next_response(_request):
        return Response("ok")

    allowed = await maintenance_mode.maintenance_mode_middleware(request(), next_response)
    assert allowed.status_code == 200
