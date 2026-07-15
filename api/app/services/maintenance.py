from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit import AuditEvent
from app.models.session import UserSession


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
    if settings.audit_retention_days > 0:
        audit_cutoff = now - timedelta(days=settings.audit_retention_days)
        audit_result = await session.execute(
            delete(AuditEvent).where(AuditEvent.created_at < audit_cutoff)
        )
        audit_count = int(audit_result.rowcount or 0)

    return int(session_result.rowcount or 0), audit_count
