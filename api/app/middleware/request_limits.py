from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

IMPORT_PATHS = {"/api/inventory/import.json", "/api/inventory/import/preview"}


class RequestBodyTooLarge(Exception):
    pass


class RequestSizeLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path", ""))
        method = str(scope.get("method", "GET")).upper()
        if path in IMPORT_PATHS:
            size_limit = settings.max_import_json_bytes
            error_detail = "Inventory import JSON is too large."
        elif path.startswith("/api/") and method in {"POST", "PUT", "PATCH"}:
            size_limit = settings.max_request_body_bytes
            error_detail = "Request body is too large."
        else:
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                declared_size = int(content_length)
            except ValueError:
                await self._send_error(scope, receive, send, 400, "Invalid Content-Length header.")
                return
            if declared_size < 0:
                await self._send_error(scope, receive, send, 400, "Invalid Content-Length header.")
                return
            if declared_size > size_limit:
                await self._send_error(scope, receive, send, 413, error_detail)
                return

        received_size = 0

        async def limited_receive() -> Message:
            nonlocal received_size
            message = await receive()
            if message["type"] == "http.request":
                received_size += len(message.get("body", b""))
                if received_size > size_limit:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await self._send_error(scope, receive, send, 413, error_detail)

    async def _send_error(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        status_code: int,
        detail: str,
    ) -> None:
        response = JSONResponse({"detail": detail}, status_code=status_code)
        await response(scope, receive, send)
