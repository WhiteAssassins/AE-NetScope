from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, Field, field_validator, model_validator

from app.schemas.auth import SessionResponse
from app.schemas.email import AccountEmail


def strip_name(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


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
    name: Annotated[str, BeforeValidator(strip_name), Field(min_length=1, max_length=80)]
    credential: dict[str, Any]


class PasskeyAuthenticationOptionsRequest(BaseModel):
    email: AccountEmail


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
    message: str = Field(default="", max_length=500)

    @field_validator("message", mode="before")
    @classmethod
    def strip_message(cls, value: object) -> object:
        # Stripping before validation keeps a whitespace-only message from saving as empty.
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_message_when_enabled(self) -> "MaintenanceUpdateRequest":
        # Users see the message while maintenance is on; turning it off needs none.
        if self.enabled and not self.message:
            raise ValueError("A maintenance message is required to enable maintenance mode.")
        return self


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
