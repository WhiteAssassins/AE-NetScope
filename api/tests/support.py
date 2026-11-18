"""Helpers shared by the API tests.

pytest puts this directory on the import path, so tests import it as ``support``
whether they run from the repository root or from ``api``.
"""

from httpx import AsyncClient
from starlette.requests import Request


async def login(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/auth/login",
        json={"email": "security@example.com", "password": "correct-password"},
    )
    assert response.status_code == 200
    return response.json()


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


def publish_releases(monkeypatch, *tags: str, installed: str = "0.1.0-alpha") -> None:
    """Make update targets known releases newer than the installed version."""
    from app.api.routes import version as version_route

    async def releases():
        return [
            version_route.ReleaseDetails(
                tag_name=tag,
                html_url=f"https://example.com/{tag}",
                prerelease="-" in tag,
                draft=False,
            )
            for tag in tags
        ]

    monkeypatch.setattr(version_route, "fetch_github_releases_cached", releases)
    monkeypatch.setattr(version_route, "project_version", lambda: installed)
