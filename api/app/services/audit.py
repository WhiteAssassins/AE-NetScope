from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent
from app.models.user import User

AUDIT_SEARCH_SCAN_LIMIT = 2_000


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
    bounded_limit = min(max(limit, 1), 250)
    statement: Select[tuple[AuditEvent, User | None]] = (
        select(AuditEvent, User)
        .outerjoin(User, User.id == AuditEvent.actor_user_id)
        .order_by(desc(AuditEvent.created_at), desc(AuditEvent.id))
    )
    if event_type:
        statement = statement.where(AuditEvent.event_type == event_type)
    if actor_user_id:
        statement = statement.where(AuditEvent.actor_user_id == actor_user_id)

    if not query:
        result = await session.execute(statement.limit(bounded_limit))
        return list(result.all())

    # Audit messages are stored encrypted, so the database cannot match them with
    # LIKE. Scan a bounded, newest-first window and match decrypted values here.
    result = await session.execute(statement.limit(AUDIT_SEARCH_SCAN_LIMIT))
    needle = query.casefold()
    matches: list[tuple[AuditEvent, User | None]] = []
    for event, actor in result.all():
        if matches_audit_query(event, actor, needle):
            matches.append((event, actor))
            if len(matches) == bounded_limit:
                break
    return matches


def matches_audit_query(event: AuditEvent, actor: User | None, needle: str) -> bool:
    candidates = (
        event.message,
        event.event_type,
        actor.email if actor else None,
        actor.username if actor else None,
    )
    return any(value is not None and needle in value.casefold() for value in candidates)
