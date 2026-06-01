from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.core.config import settings
from app.core.redis import redis_ping
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
    }


@router.get("/health/ready")
async def ready() -> dict[str, object]:
    checks: dict[str, bool] = {"database": False, "redis": False}

    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
            checks["database"] = True
    except Exception:
        checks["database"] = False

    try:
        checks["redis"] = await redis_ping()
    except Exception:
        checks["redis"] = False

    if not all(checks.values()):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "degraded",
                "service": settings.app_name,
                "environment": settings.app_env,
                "checks": checks,
            },
        )

    return {
        "status": "ready",
        "service": settings.app_name,
        "environment": settings.app_env,
        "checks": checks,
    }
