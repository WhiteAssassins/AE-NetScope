from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

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


class ManagedUserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=80)
    role: UserRole = "viewer"


class ManagedUserCreateResponse(BaseModel):
    user: ManagedUserResponse
    temporary_password: str


class ManagedUserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=80)
    role: UserRole | None = None
    is_active: bool | None = None
    must_change_password: bool | None = None
    clear_lock: bool = False


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
