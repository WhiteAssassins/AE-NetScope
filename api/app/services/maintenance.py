import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.version import (
    CONFIGURED_UPDATE_TARGET,
    UNTAGGED_UPDATE_MESSAGE_PREFIX,
    project_version,
)
from app.db.session import SessionLocal
from app.models.audit import AuditEvent
from app.models.security import UpdateHistory, WebAuthnChallenge
from app.models.session import UserSession

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL_SECONDS = 6 * 60 * 60


async def purge_expired_records(session: AsyncSession) -> tuple[int, int]:
    now = datetime.now(UTC)
    session_cutoff = now - timedelta(days=max(settings.session_record_retention_days, 0))
    session_result = await session.execute(
        delete(UserSession).where(
            or_(
                UserSession.expires_at < session_cutoff,
                UserSession.revoked_at < session_cutoff,
            )
        )
    )

    audit_count = 0
    await session.execute(delete(WebAuthnChallenge).where(WebAuthnChallenge.expires_at < now))
    if settings.audit_retention_days > 0:
        audit_cutoff = now - timedelta(days=settings.audit_retention_days)
        audit_result = await session.execute(
            delete(AuditEvent).where(AuditEvent.created_at < audit_cutoff)
        )
        audit_count = int(audit_result.rowcount or 0)
        await session.execute(
            delete(UpdateHistory).where(UpdateHistory.created_at < audit_cutoff)
        )

    return int(session_result.rowcount or 0), audit_count


async def reconcile_interrupted_updates(session: AsyncSession) -> int:
    rows = list(
        (
            await session.scalars(
                select(UpdateHistory).where(UpdateHistory.status == "started")
            )
        ).all()
    )
    current_version = project_version()
    for item in rows:
        target = item.target_tag.strip().removeprefix("v").removeprefix("V")
        if target == CONFIGURED_UPDATE_TARGET:
            # Untagged commands record the version they started on.
            message = item.message or ""
            started_on = message.removeprefix(UNTAGGED_UPDATE_MESSAGE_PREFIX).removesuffix(".")
            if message.startswith(UNTAGGED_UPDATE_MESSAGE_PREFIX) and started_on != current_version:
                item.status = "succeeded"
                item.message = f"The application restarted on version {current_version}."
            else:
                item.status = "unknown"
                item.message = "The application restarted before the update result was recorded."
            continue
        if target == current_version:
            item.status = "succeeded"
            item.message = "The application restarted on the requested version."
        else:
            item.status = "unknown"
            item.message = "The application restarted before the update result was recorded."
    return len(rows)


async def run_periodic_cleanup(interval_seconds: float = CLEANUP_INTERVAL_SECONDS) -> None:
    """Apply the retention settings while the application keeps running.

    Startup already runs one cleanup; installations can run for months between restarts.
    """
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            async with SessionLocal() as session:
                await purge_expired_records(session)
                await session.commit()
        except Exception as exc:
            logger.warning("Periodic retention cleanup failed: %s", exc.__class__.__name__)
