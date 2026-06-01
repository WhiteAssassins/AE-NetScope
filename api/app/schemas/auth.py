from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)


class InitialSetupStatusResponse(BaseModel):
    setup_required: bool


class InitialSetupRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=1024)


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    role: str
    permissions: list[str]
    must_change_password: bool


class SessionResponse(BaseModel):
    user: UserResponse
    csrf_token: str | None = None


class CsrfResponse(BaseModel):
    csrf_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=12, max_length=1024)
