from contextvars import ContextVar

from sqlalchemy import Select, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent
from app.models.user import User

AUDIT_SEARCH_SCAN_LIMIT = 2_000


# Set per HTTP request by ClientIpMiddleware, so every audit event records its origin.
request_client_ip: ContextVar[str | None] = ContextVar("request_client_ip", default=None)


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
            ip_address=ip_address or request_client_ip.get(),
        )
    )


async def list_audit_events(
    session: AsyncSession,
    *,
    event_type: str | None = None,
    event_group: str | None = None,
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
    if event_group:
        # A group is the event type prefix, such as "auth" for "auth.login_failed".
        statement = statement.where(AuditEvent.event_type.startswith(f"{event_group}."))
    if actor_user_id:
        statement = statement.where(AuditEvent.actor_user_id == actor_user_id)

    if not query:
        result = await session.execute(statement.limit(bounded_limit))
        return list(result.all())

    # Event types and actors are stored in clear text, so the database matches them
    # across the whole history.
    plain_matches = (
        await session.execute(
            statement.where(
                or_(
                    AuditEvent.event_type.icontains(query, autoescape=True),
                    User.email.icontains(query, autoescape=True),
                    User.username.icontains(query, autoescape=True),
                )
            ).limit(bounded_limit)
        )
    ).all()
    # Messages are stored encrypted, so the database cannot match them with LIKE. Scan
    # a bounded, newest-first window and match decrypted values here.
    result = await session.execute(statement.limit(AUDIT_SEARCH_SCAN_LIMIT))
    needle = query.casefold()
    message_matches = [
        (event, actor) for event, actor in result.all() if matches_audit_query(event, actor, needle)
    ]
    merged = {event.id: (event, actor) for event, actor in [*plain_matches, *message_matches]}
    ordered = sorted(
        merged.values(), key=lambda row: (row[0].created_at, row[0].id), reverse=True
    )
    return ordered[:bounded_limit]


def matches_audit_query(event: AuditEvent, actor: User | None, needle: str) -> bool:
    candidates = (
        event.message,
        event.event_type,
        actor.email if actor else None,
        actor.username if actor else None,
    )
    return any(value is not None and needle in value.casefold() for value in candidates)
