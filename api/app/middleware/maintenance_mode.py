import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.security import SystemSetting
from app.services.auth import get_user_by_session_token

logger = logging.getLogger(__name__)

PUBLIC_API_PATHS = {
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/setup",
    "/api/health",
    "/api/health/live",
    "/api/health/ready",
    "/api/health/summary",
    "/api/security/maintenance",
    "/api/security/search-indexing",
    "/api/security/passkeys/capability",
    "/api/security/passkeys/authenticate/options",
    "/api/security/passkeys/authenticate/verify",
}


async def maintenance_mode_middleware(request: Request, call_next):
    if not request.url.path.startswith("/api") or request.url.path in PUBLIC_API_PATHS:
        return await call_next(request)

    # Only the maintenance lookup belongs in the try block. Wrapping call_next
    # would also swallow downstream application errors and re-enter the app.
    maintenance_message: str | None = None
    try:
        async with SessionLocal() as session:
            state = await session.get(SystemSetting, 1)
            if state is not None and state.maintenance_enabled:
                token = request.cookies.get(settings.session_cookie_name)
                user = await get_user_by_session_token(session, token)
                if user is None or user.role != "admin":
                    maintenance_message = state.maintenance_message
    except Exception as exc:
        logger.warning("Maintenance mode check failed: %s", exc.__class__.__name__)
        maintenance_message = None

    if maintenance_message is None:
        return await call_next(request)

    return JSONResponse(
        status_code=503,
        content={
            "detail": {
                "code": "maintenance_mode",
                "message": maintenance_message,
            }
        },
        headers={"Retry-After": "300"},
    )
