from datetime import datetime

from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    id: int
    actor_user_id: int | None
    actor_username: str | None
    actor_email: str | None
    event_type: str
    message: str
    ip_address: str | None
    created_at: datetime
