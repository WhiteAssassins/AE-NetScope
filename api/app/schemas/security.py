from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import SessionResponse


class PasskeyCapabilityResponse(BaseModel):
    enabled: bool
    reason: str | None = None


class PasskeyCredentialResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    last_used_at: datetime | None


class PasskeyRegistrationOptionsRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)


class PasskeyDeleteRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)


class PasskeyOptionsResponse(BaseModel):
    challenge_id: str
    options: dict[str, Any]


class PasskeyRegistrationVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=32, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    credential: dict[str, Any]


class PasskeyAuthenticationOptionsRequest(BaseModel):
    email: EmailStr


class PasskeyAuthenticationVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=32, max_length=64)
    credential: dict[str, Any]


class PasskeyAuthenticationResponse(SessionResponse):
    pass


class MaintenanceStatusResponse(BaseModel):
    enabled: bool
    message: str


class MaintenanceUpdateRequest(BaseModel):
    enabled: bool
    message: str = Field(min_length=1, max_length=500)


class SearchIndexingPolicyResponse(BaseModel):
    allow_indexing: bool


class SearchIndexingPolicyUpdateRequest(BaseModel):
    allow_indexing: bool


class UpdateHistoryResponse(BaseModel):
    id: int
    requested_by_user_id: int | None
    requested_by: str | None
    target_tag: str
    status: str
    message: str | None
    created_at: datetime
