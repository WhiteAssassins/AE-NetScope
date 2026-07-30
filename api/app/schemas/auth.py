from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)
    totp_code: str | None = Field(default=None, pattern=r"^\d{6}$")


class InitialSetupStatusResponse(BaseModel):
    setup_required: bool
    token_required: bool


class InitialSetupRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=1024)
    setup_token: str | None = Field(default=None, min_length=16, max_length=1024)


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    role: str
    permissions: list[str]
    must_change_password: bool
    preferred_language: str
    timezone: str
    date_format: str
    hour_format: str
    totp_enabled: bool
    passkey_count: int = 0


class SessionResponse(BaseModel):
    user: UserResponse
    csrf_token: str | None = None


class CsrfResponse(BaseModel):
    csrf_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=12, max_length=1024)


class ChangeEmailRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_email: EmailStr


class ChangeLanguageRequest(BaseModel):
    language: str = Field(
        min_length=2,
        max_length=64,
        pattern=r"^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$",
    )


class ChangeRegionalPreferencesRequest(BaseModel):
    timezone: str = Field(min_length=1, max_length=64)
    date_format: str = Field(pattern=r"^(locale|ymd|dmy|mdy)$")
    hour_format: str = Field(pattern=r"^(12|24)$")


class ChangePreferencesRequest(ChangeRegionalPreferencesRequest):
    language: str = Field(
        min_length=2,
        max_length=64,
        pattern=r"^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$",
    )


class UserSessionResponse(BaseModel):
    id: int
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    expires_at: datetime
    is_current: bool


class TotpSetupRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)


class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class TotpConfirmRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class TotpDisableRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    code: str = Field(pattern=r"^\d{6}$")
