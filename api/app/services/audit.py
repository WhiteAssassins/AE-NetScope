from sqlalchemy import Select, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent
from app.models.user import User


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


async def list_audit_events(
    session: AsyncSession,
    *,
    event_type: str | None = None,
    actor_user_id: int | None = None,
    query: str | None = None,
    limit: int = 100,
) -> list[tuple[AuditEvent, User | None]]:
    statement: Select[tuple[AuditEvent, User | None]] = (
        select(AuditEvent, User)
        .outerjoin(User, User.id == AuditEvent.actor_user_id)
        .order_by(desc(AuditEvent.created_at), desc(AuditEvent.id))
        .limit(min(max(limit, 1), 250))
    )
    if event_type:
        statement = statement.where(AuditEvent.event_type == event_type)
    if actor_user_id:
        statement = statement.where(AuditEvent.actor_user_id == actor_user_id)
    if query:
        like_query = f"%{query}%"
        statement = statement.where(
            or_(
                AuditEvent.message.ilike(like_query),
                AuditEvent.event_type.ilike(like_query),
                User.email.ilike(like_query),
                User.username.ilike(like_query),
            )
        )

    result = await session.execute(statement)
    return list(result.all())
