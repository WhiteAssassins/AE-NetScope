import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import HTMLResponse, PlainTextResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.version import project_version
from app.db.session import SessionLocal
from app.middleware.maintenance_mode import maintenance_mode_middleware
from app.middleware.request_limits import RequestSizeLimitMiddleware
from app.middleware.security_headers import security_headers_middleware
from app.services import search_indexing
from app.services.data_protection import migrate_sensitive_fields_to_primary_key
from app.services.maintenance import purge_expired_records, reconcile_interrupted_updates
from app.services.mfa import migrate_totp_secrets_to_primary_key

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    security_errors = settings.runtime_security_errors()
    if security_errors:
        raise RuntimeError("Unsafe runtime configuration: " + " ".join(security_errors))
    if settings.app_env == "production" and not settings.effective_session_cookie_secure:
        logger.warning(
            "SESSION_COOKIE_SECURE is disabled in production. This is supported for "
            "HTTP-only managed deployments, but HTTPS should be enabled whenever available."
        )
    if not settings.backup_encryption_key:
        logger.warning(
            "BACKUP_ENCRYPTION_KEY is not set; backups use a domain-separated key derived "
            "from MFA_ENCRYPTION_KEY or SESSION_SECRET."
        )
    if not settings.data_encryption_key:
        logger.warning(
            "DATA_ENCRYPTION_KEY is not set; sensitive inventory fields use a "
            "domain-separated key derived from MFA_ENCRYPTION_KEY or SESSION_SECRET."
        )
    async with SessionLocal() as session:
        await migrate_totp_secrets_to_primary_key(session)
        await migrate_sensitive_fields_to_primary_key(session)
        await session.commit()
    try:
        async with SessionLocal() as session:
            await purge_expired_records(session)
            await reconcile_interrupted_updates(session)
            await session.commit()
    except Exception as exc:
        logger.warning("Database retention cleanup failed: %s", exc.__class__.__name__)
    yield


def create_app() -> FastAPI:
    expose_api_docs = settings.app_env in {"local", "test"}
    app = FastAPI(
        title=settings.app_name,
        version=project_version(),
        docs_url="/docs" if expose_api_docs else None,
        openapi_url="/openapi.json" if expose_api_docs else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "X-CSRF-Token"],
        expose_headers=["Retry-After"],
        max_age=600,
    )
    app.add_middleware(RequestSizeLimitMiddleware)
    app.middleware("http")(maintenance_mode_middleware)
    app.middleware("http")(security_headers_middleware)

    app.include_router(api_router, prefix="/api")

    @app.get("/robots.txt", include_in_schema=False)
    async def robots_txt() -> PlainTextResponse:
        allowed = await search_indexing.is_search_engine_indexing_allowed()
        directive = "Allow: /" if allowed else "Disallow: /"
        return PlainTextResponse(
            f"User-agent: *\n{directive}\n",
            headers={"Cache-Control": "public, max-age=30"},
        )

    mount_static_web(app)
    return app


def mount_static_web(app: FastAPI) -> None:
    if not settings.app_web_dist_dir:
        return

    static_dir = settings.app_web_dist_dir
    index_file = f"{static_dir.rstrip('/')}/index.html"

    app.mount("/assets", StaticFiles(directory=f"{static_dir.rstrip('/')}/assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa_fallback(path: str) -> HTMLResponse:
        html = Path(index_file).read_text(encoding="utf-8")
        if await search_indexing.is_search_engine_indexing_allowed():
            html = html.replace(
                'content="noindex, nofollow, noarchive"',
                'content="index, follow"',
                1,
            )
        return HTMLResponse(html)


app = create_app()
