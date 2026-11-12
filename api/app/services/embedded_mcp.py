"""Built-in MCP endpoint served by the application at /mcp.

The endpoint is disabled until an administrator enables it from the web interface. It
reuses the optional gateway, which calls the inventory API in-process, so validation,
token scopes, permissions and audit events stay identical to the standalone gateway.
"""

import asyncio
import importlib.util
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import monotonic

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.db.session import SessionLocal
from app.models.security import SystemSetting

MCP_PATH = "/mcp"
_CACHE_SECONDS = 30.0
_cache_lock = asyncio.Lock()
_cached_enabled = False
_cache_expires_at = 0.0
_handler: ASGIApp | None = None


def sdk_available() -> bool:
    return importlib.util.find_spec("mcp") is not None


def cache_embedded_mcp_enabled(enabled: bool) -> None:
    global _cached_enabled, _cache_expires_at
    _cached_enabled = enabled
    _cache_expires_at = monotonic() + _CACHE_SECONDS


async def is_embedded_mcp_enabled() -> bool:
    if monotonic() < _cache_expires_at:
        return _cached_enabled

    async with _cache_lock:
        if monotonic() < _cache_expires_at:
            return _cached_enabled
        try:
            async with SessionLocal() as session:
                state = await session.get(SystemSetting, 1)
                enabled = bool(state and state.mcp_server_enabled)
        except Exception:
            enabled = False
        cache_embedded_mcp_enabled(enabled)
        return enabled


def is_running() -> bool:
    return _handler is not None


@asynccontextmanager
async def run_embedded_mcp(api_app: ASGIApp) -> AsyncIterator[None]:
    """Prepare the MCP handler for the application's lifetime when the SDK is installed."""
    global _handler
    if not sdk_available():
        yield
        return

    import httpx

    from app.mcp.server import AuthenticateHTTP, InventoryClient, create_server

    client = InventoryClient(
        "http://ae-netscope.internal",
        transport=httpx.ASGITransport(app=api_app),
    )
    server = create_server(client, embedded=True)
    handler = AuthenticateHTTP(server.streamable_http_app(), client)
    async with server.session_manager.run():
        _handler = handler
        try:
            yield
        finally:
            _handler = None


class EmbeddedMcpMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        path = scope.get("path", "")
        if scope["type"] != "http" or (path != MCP_PATH and not path.startswith(MCP_PATH + "/")):
            return await self.app(scope, receive, send)
        if not await is_embedded_mcp_enabled():
            response = JSONResponse({"detail": "Not Found"}, 404)
            return await response(scope, receive, send)
        handler = _handler
        if handler is None:
            response = JSONResponse({"detail": "MCP server is unavailable."}, 503)
            return await response(scope, receive, send)
        await handler(scope, receive, send)
