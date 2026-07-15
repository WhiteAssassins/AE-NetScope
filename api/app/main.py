import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.version import project_version
from app.db.session import SessionLocal
from app.middleware.request_limits import RequestSizeLimitMiddleware
from app.middleware.security_headers import security_headers_middleware
from app.services.maintenance import purge_expired_records

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        async with SessionLocal() as session:
            await purge_expired_records(session)
            await session.commit()
    except Exception as exc:
        logger.warning("Database retention cleanup failed: %s", exc.__class__.__name__)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=project_version(),
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestSizeLimitMiddleware)
    app.middleware("http")(security_headers_middleware)

    app.include_router(api_router, prefix="/api")
    mount_static_web(app)
    return app


def mount_static_web(app: FastAPI) -> None:
    if not settings.app_web_dist_dir:
        return

    static_dir = settings.app_web_dist_dir
    index_file = f"{static_dir.rstrip('/')}/index.html"

    app.mount("/assets", StaticFiles(directory=f"{static_dir.rstrip('/')}/assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa_fallback(path: str) -> FileResponse:
        return FileResponse(index_file)


app = create_app()
