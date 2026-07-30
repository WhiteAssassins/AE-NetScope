from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

UserRole = Literal["admin", "operator", "viewer"]


class ManagedUserResponse(BaseModel):
    id: int
    email: str
    username: str
    role: UserRole
    is_active: bool
    must_change_password: bool
    locked_until: datetime | None
    last_login_at: datetime | None
    created_at: datetime
    active_session_count: int = 0
    totp_enabled: bool = False
    passkey_count: int = 0


class ManagedUserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=80)
    role: UserRole = "viewer"

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Username must contain at least two non-whitespace characters.")
        return normalized


class ManagedUserCreateResponse(BaseModel):
    user: ManagedUserResponse
    temporary_password: str


class ManagedUserUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=2, max_length=80)
    role: UserRole | None = None
    is_active: bool | None = None
    must_change_password: bool | None = None
    clear_lock: bool = False

    @field_validator("username")
    @classmethod
    def normalize_optional_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Username must contain at least two non-whitespace characters.")
        return normalized


class ManagedUserResetPasswordResponse(BaseModel):
    user: ManagedUserResponse
    temporary_password: str


class ManagedUserSessionResponse(BaseModel):
    id: int
    user_id: int
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    is_current: bool = False
