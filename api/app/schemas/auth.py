from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)


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
