from types import SimpleNamespace

from starlette.requests import Request
from starlette.responses import Response

from app.middleware import maintenance_mode


class FakeSession:
    def __init__(self, state):
        self.state = state

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, _model, _key):
        return self.state


def request(path: str = "/api/inventory/devices") -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "headers": [],
            "query_string": b"",
            "server": ("test", 80),
            "client": ("127.0.0.1", 1234),
            "scheme": "http",
        }
    )


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
