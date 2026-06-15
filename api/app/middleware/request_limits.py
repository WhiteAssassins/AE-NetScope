from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

IMPORT_PATHS = {"/api/inventory/import.json", "/api/inventory/import/preview"}


async def request_size_limit_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    if request.url.path not in IMPORT_PATHS:
        return await call_next(request)

    content_length = request.headers.get("content-length")
    if content_length is None:
        return await call_next(request)

    try:
        size = int(content_length)
    except ValueError:
        return JSONResponse(
            {"detail": "Invalid Content-Length header."},
            status_code=400,
        )

    if size > settings.max_import_json_bytes:
        return JSONResponse(
            {"detail": "Inventory import JSON is too large."},
            status_code=413,
        )

    return await call_next(request)
