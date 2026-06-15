from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.version import project_version
from app.middleware.request_limits import request_size_limit_middleware
from app.middleware.security_headers import security_headers_middleware


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=project_version(),
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(security_headers_middleware)
    app.middleware("http")(request_size_limit_middleware)

    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
