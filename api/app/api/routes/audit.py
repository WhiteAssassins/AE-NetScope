from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.models.audit import AuditEvent
from app.models.user import User
from app.schemas.audit import AuditEventResponse
from app.services.audit import list_audit_events

router = APIRouter(
    prefix="/audit",
    dependencies=[Depends(require_permission("audit:read"))],
)


def serialize_audit_event(event: AuditEvent, actor: User | None) -> AuditEventResponse:
    return AuditEventResponse(
        id=event.id,
        actor_user_id=event.actor_user_id,
        actor_username=actor.username if actor else None,
        actor_email=actor.email if actor else None,
        event_type=event.event_type,
        message=event.message,
        ip_address=event.ip_address,
        created_at=event.created_at,
    )


@router.get("/events", response_model=list[AuditEventResponse])
async def audit_events(
    session: SessionDep,
    _: CurrentUser,
    event_type: str | None = None,
    actor_user_id: int | None = None,
    q: str | None = None,
    limit: int = Query(default=100, ge=1, le=250),
) -> list[AuditEventResponse]:
    events = await list_audit_events(
        session,
        event_type=event_type,
        actor_user_id=actor_user_id,
        query=q,
        limit=limit,
    )
    return [serialize_audit_event(event, actor) for event, actor in events]
