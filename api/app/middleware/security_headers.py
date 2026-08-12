from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.services import search_indexing


async def security_headers_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    if _is_cross_site_api_mutation(request):
        response: Response = JSONResponse(
            {"detail": "Cross-site request rejected."},
            status_code=403,
        )
    else:
        response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store, max-age=0")
        response.headers.setdefault("Pragma", "no-cache")
        _append_vary(response, "Cookie")

    if not await search_indexing.is_search_engine_indexing_allowed():
        response.headers.setdefault("X-Robots-Tag", "noindex, nofollow, noarchive")

    if not settings.security_headers_enabled:
        return response

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Origin-Agent-Cluster", "?1")
    response.headers.setdefault(
        "Permissions-Policy",
        (
            "camera=(), microphone=(), geolocation=(), "
            "publickey-credentials-create=(self), publickey-credentials-get=(self)"
        ),
    )
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    response.headers.setdefault(
        "Content-Security-Policy",
        (
            "default-src 'self'; base-uri 'self'; connect-src 'self'; "
            "font-src 'self'; form-action 'self'; frame-ancestors 'none'; "
            "img-src 'self' data:; object-src 'none'; script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; worker-src 'self'"
        ),
    )

    if settings.effective_hsts_enabled:
        response.headers.setdefault(
            "Strict-Transport-Security",
            f"max-age={settings.security_hsts_max_age}; includeSubDomains",
        )

    return response


def _is_cross_site_api_mutation(request: Request) -> bool:
    if not request.url.path.startswith("/api/") or request.method not in {
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
    }:
        return False
    if request.headers.get("sec-fetch-site", "").lower() == "cross-site":
        return True

    origin = request.headers.get("origin")
    if not origin:
        return False
    request_origin = f"{request.url.scheme}://{request.url.netloc}"
    return origin.rstrip("/") not in {
        request_origin.rstrip("/"),
        *(item.rstrip("/") for item in settings.cors_origins),
    }


def _append_vary(response: Response, value: str) -> None:
    existing = [item.strip() for item in response.headers.get("Vary", "").split(",")]
    values = [item for item in existing if item]
    if value.lower() not in {item.lower() for item in values}:
        values.append(value)
    response.headers["Vary"] = ", ".join(values)
