from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.core.config import settings
from app.core.redis import redis_ping
from app.core.version import project_version, release_channel
from app.db.session import SessionLocal

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return await live()


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
        "version": project_version(),
    }


@router.get("/health/ready")
async def ready() -> dict[str, object]:
    health_status = await collect_health_status()
    checks = health_status["checks"]

    if not all(item["status"] == "ok" for item in checks.values()):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=health_status,
        )

    return health_status


@router.get("/health/status")
async def detailed_status() -> dict[str, object]:
    return await collect_health_status()


async def collect_health_status() -> dict[str, object]:
    checks: dict[str, dict[str, object]] = {
        "api": {
            "status": "ok",
            "required": True,
            "message": "API process is responding.",
        },
        "database": {
            "status": "error",
            "required": True,
            "message": "Database connection has not been checked yet.",
        },
        "redis": {
            "status": "error",
            "required": True,
            "message": "Redis connection has not been checked yet.",
        },
    }

    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
            checks["database"]["status"] = "ok"
            checks["database"]["message"] = "Database responded to SELECT 1."
    except Exception as exc:
        checks["database"]["message"] = f"Database check failed: {exc.__class__.__name__}."

    try:
        redis_ok = await redis_ping()
        checks["redis"]["status"] = "ok" if redis_ok else "error"
        checks["redis"]["message"] = "Redis ping succeeded." if redis_ok else "Redis ping failed."
    except Exception as exc:
        checks["redis"]["message"] = f"Redis check failed: {exc.__class__.__name__}."

    current_version = project_version()
    is_ready = all(item["status"] == "ok" for item in checks.values())
    return {
        "status": "ready" if is_ready else "degraded",
        "service": settings.app_name,
        "environment": settings.app_env,
        "version": current_version,
        "release_channel": release_channel(current_version),
        "checked_at": datetime.now(UTC).isoformat(),
        "checks": checks,
    }
