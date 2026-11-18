import re
from datetime import datetime
from functools import lru_cache
from typing import Annotated
from zoneinfo import available_timezones

from pydantic import AfterValidator, BaseModel, BeforeValidator, Field, field_validator

from app.schemas.email import AccountEmail

# Interface languages bundled with the web app.
SUPPORTED_LANGUAGES = ("en", "es")


def strip_code_separators(value: object) -> object:
    # Authenticator apps display "123 456"; password managers may paste it that way.
    return re.sub(r"[\s-]", "", value) if isinstance(value, str) else value


def require_meaningful_password(value: str) -> str:
    # Spaces count inside a passphrase, but a password cannot be padding alone.
    if len(value.strip()) < 12:
        raise ValueError("Password must contain at least 12 characters besides surrounding spaces.")
    return value


NewPassword = Annotated[
    str, Field(min_length=12, max_length=1024), AfterValidator(require_meaningful_password)
]

# Names in the time zone database that browsers do not accept as a time zone.
UNSUPPORTED_BROWSER_TIMEZONES = frozenset({"Factory", "localtime"})


@lru_cache(maxsize=1)
def supported_timezones() -> frozenset[str]:
    return frozenset(available_timezones() - UNSUPPORTED_BROWSER_TIMEZONES)


TotpCode = Annotated[str, BeforeValidator(strip_code_separators), Field(pattern=r"^\d{6}$")]


class LoginRequest(BaseModel):
    email: AccountEmail
    password: str = Field(min_length=1, max_length=1024)
    totp_code: TotpCode | None = None


class InitialSetupStatusResponse(BaseModel):
    setup_required: bool
    token_required: bool


class InitialSetupRequest(BaseModel):
    email: AccountEmail
    username: str = Field(min_length=2, max_length=80)
    password: NewPassword
    setup_token: str | None = Field(default=None, min_length=16, max_length=1024)
    # The administrator keeps the language and time zone the setup screen used.
    language: str | None = Field(default=None, max_length=64)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("language")
    @classmethod
    def optional_supported_language(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized.split("-", 1)[0] not in SUPPORTED_LANGUAGES:
            return None
        return normalized

    @field_validator("timezone")
    @classmethod
    def optional_browser_timezone(cls, value: str | None) -> str | None:
        # An unknown zone falls back to UTC instead of blocking the first sign-in.
        return value if value in supported_timezones() else None

    @field_validator("setup_token", mode="before")
    @classmethod
    def strip_setup_token(cls, value: object) -> object:
        # Tokens are often pasted with surrounding spaces or a trailing newline.
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Username must contain at least two non-whitespace characters.")
        return normalized


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
    new_password: NewPassword


class ChangeEmailRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_email: AccountEmail


class ChangeLanguageRequest(BaseModel):
    language: str = Field(
        min_length=2,
        max_length=64,
        pattern=r"^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$",
    )

    @field_validator("language")
    @classmethod
    def require_supported_language(cls, value: str) -> str:
        # Regional variants such as es-mx are kept; the base language must be bundled.
        if value.lower().split("-", 1)[0] not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language. Use one of: {', '.join(SUPPORTED_LANGUAGES)}.")
        return value.lower()


class ChangeRegionalPreferencesRequest(BaseModel):
    timezone: str = Field(min_length=1, max_length=64)

    @field_validator("timezone")
    @classmethod
    def require_browser_timezone(cls, value: str) -> str:
        # Every page formats dates in this zone, so it must be one browsers understand.
        if value not in supported_timezones():
            raise ValueError("Unsupported timezone.")
        return value
    date_format: str = Field(pattern=r"^(locale|ymd|dmy|mdy)$")
    hour_format: str = Field(pattern=r"^(12|24)$")


class ChangePreferencesRequest(ChangeRegionalPreferencesRequest):
    language: str = Field(
        min_length=2,
        max_length=64,
        pattern=r"^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$",
    )

    @field_validator("language")
    @classmethod
    def require_supported_language(cls, value: str) -> str:
        # Regional variants such as es-mx are kept; the base language must be bundled.
        if value.lower().split("-", 1)[0] not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language. Use one of: {', '.join(SUPPORTED_LANGUAGES)}.")
        return value.lower()


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
    code: TotpCode


class TotpDisableRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    code: TotpCode
