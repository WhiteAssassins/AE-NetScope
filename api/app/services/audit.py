from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent


async def write_audit_event(
    session: AsyncSession,
    event_type: str,
    message: str,
    *,
    actor_user_id: int | None = None,
    ip_address: str | None = None,
) -> None:
    session.add(
        AuditEvent(
            actor_user_id=actor_user_id,
            event_type=event_type,
            message=message,
            ip_address=ip_address,
        )
    )
