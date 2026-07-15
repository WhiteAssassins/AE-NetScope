from datetime import UTC, datetime
from time import perf_counter

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.api.deps import CurrentUser
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

    if health_status["status"] != "ready":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "not_ready"},
        )

    return {"status": "ready"}


@router.get("/health/status")
async def detailed_status(_: CurrentUser) -> dict[str, object]:
    return await collect_health_status()


async def collect_health_status() -> dict[str, object]:
    health_started_at = perf_counter()
    checks: dict[str, dict[str, object]] = {
        "api": {
            "status": "ok",
            "required": True,
            "message": "API process is responding.",
            "message_code": "health.checkMessages.apiOk",
            "latency_ms": 0.0,
        },
        "database": {
            "status": "error",
            "required": True,
            "message": "Database connection has not been checked yet.",
            "message_code": "health.checkMessages.databasePending",
            "latency_ms": None,
        },
        "redis": {
            "status": "error",
            "required": True,
            "message": "Redis connection has not been checked yet.",
            "message_code": "health.checkMessages.redisPending",
            "latency_ms": None,
        },
    }

    database_started_at = perf_counter()
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
            checks["database"]["status"] = "ok"
            checks["database"]["message"] = "Database responded to SELECT 1."
            checks["database"]["message_code"] = "health.checkMessages.databaseOk"
    except Exception as exc:
        checks["database"]["message"] = f"Database check failed: {exc.__class__.__name__}."
        checks["database"]["message_code"] = "health.checkMessages.databaseError"
    finally:
        checks["database"]["latency_ms"] = round(
            (perf_counter() - database_started_at) * 1000,
            2,
        )

    redis_started_at = perf_counter()
    try:
        redis_ok = await redis_ping()
        checks["redis"]["status"] = "ok" if redis_ok else "error"
        checks["redis"]["message"] = "Redis ping succeeded." if redis_ok else "Redis ping failed."
        checks["redis"]["message_code"] = (
            "health.checkMessages.redisOk"
            if redis_ok
            else "health.checkMessages.redisError"
        )
    except Exception as exc:
        checks["redis"]["message"] = f"Redis check failed: {exc.__class__.__name__}."
        checks["redis"]["message_code"] = "health.checkMessages.redisError"
    finally:
        checks["redis"]["latency_ms"] = round(
            (perf_counter() - redis_started_at) * 1000,
            2,
        )

    current_version = project_version()
    is_ready = required_checks_are_healthy(checks)
    return {
        "status": "ready" if is_ready else "degraded",
        "service": settings.app_name,
        "environment": settings.app_env,
        "version": current_version,
        "release_channel": release_channel(current_version),
        "checked_at": datetime.now(UTC).isoformat(),
        "duration_ms": round((perf_counter() - health_started_at) * 1000, 2),
        "checks": checks,
    }


def required_checks_are_healthy(checks: dict[str, dict[str, object]]) -> bool:
    return all(
        item["status"] == "ok"
        for item in checks.values()
        if bool(item.get("required", True))
    )
