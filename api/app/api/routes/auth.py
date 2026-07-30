import secrets
from datetime import UTC, datetime
from zoneinfo import available_timezones

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.deps import CurrentSession, CurrentUser, SessionCookie, SessionDep, require_csrf
from app.core.config import settings
from app.core.permissions import permissions_for_role
from app.core.rate_limit import rate_limit
from app.core.security import hash_password, verify_password_and_update
from app.models.user import User
from app.schemas.auth import (
    ChangeEmailRequest,
    ChangeLanguageRequest,
    ChangePasswordRequest,
    ChangePreferencesRequest,
    ChangeRegionalPreferencesRequest,
    CsrfResponse,
    InitialSetupRequest,
    InitialSetupStatusResponse,
    LoginRequest,
    SessionResponse,
    TotpConfirmRequest,
    TotpDisableRequest,
    TotpSetupRequest,
    TotpSetupResponse,
    UserResponse,
    UserSessionResponse,
)
from app.services.audit import write_audit_event
from app.services.auth import (
    AccountLockedError,
    AuthError,
    TotpRequiredError,
    authenticate_user,
    change_user_email,
    change_user_password,
    create_user_session,
    revoke_user_session,
    rotate_csrf_token,
)
from app.services.mfa import (
    MfaSecretError,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_totp_secret,
    totp_uri,
    verify_totp,
)
from app.services.setup import claim_initial_setup, initial_setup_required
from app.services.users import list_user_sessions, revoke_user_sessions

router = APIRouter(prefix="/auth")


def session_is_active(expires_at: datetime) -> bool:
    aware_expiry = expires_at.replace(tzinfo=UTC) if expires_at.tzinfo is None else expires_at
    return aware_expiry > datetime.now(UTC)


def serialize_user(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role,
        permissions=sorted(permissions_for_role(user.role)),
        must_change_password=user.must_change_password,
        preferred_language=user.preferred_language,
        timezone=user.timezone,
        date_format=user.date_format,
        hour_format=user.hour_format,
        totp_enabled=user.totp_enabled,
    )


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.effective_session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.effective_session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )


@router.get("/setup", response_model=InitialSetupStatusResponse)
async def setup_status(session: SessionDep) -> InitialSetupStatusResponse:
    return InitialSetupStatusResponse(
        setup_required=await initial_setup_required(session),
        token_required=bool(settings.initial_setup_token) or settings.app_env != "local",
    )


@router.post(
    "/setup",
    response_model=SessionResponse,
    dependencies=[Depends(rate_limit("auth.setup", limit=3))],
)
async def initial_setup(
    payload: InitialSetupRequest,
    request: Request,
    response: Response,
    session: SessionDep,
) -> SessionResponse:
    expected_setup_token = settings.effective_initial_setup_token
    if expected_setup_token is None and settings.app_env != "local":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Initial setup token is not configured.",
        )
    if expected_setup_token is not None and (
        payload.setup_token is None
        or not secrets.compare_digest(payload.setup_token, expected_setup_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid initial setup token.",
        )

    if not await claim_initial_setup(session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Initial setup has already been completed.",
        )

    user = User(
        email=str(payload.email).lower(),
        username=payload.username,
        password_hash=hash_password(payload.password),
        role="admin",
        is_active=True,
        must_change_password=False,
    )
    session.add(user)
    await session.flush()

    token, csrf_token = await create_user_session(
        session,
        user=user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    set_session_cookie(response, token)
    return SessionResponse(user=serialize_user(user), csrf_token=csrf_token)


@router.post(
    "/login",
    response_model=SessionResponse,
    dependencies=[Depends(rate_limit("auth.login"))],
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: SessionDep,
) -> SessionResponse:
    try:
        user = await authenticate_user(
            session,
            email=payload.email,
            password=payload.password,
            ip_address=request.client.host if request.client else None,
            totp_code=payload.totp_code,
        )
    except TotpRequiredError as exc:
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail={"code": "totp_required", "message": str(exc)},
        ) from exc
    except AccountLockedError as exc:
        await session.commit()
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail=str(exc)) from exc
    except AuthError:
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from None

    token, csrf_token = await create_user_session(
        session,
        user=user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    set_session_cookie(response, token)
    return SessionResponse(user=serialize_user(user), csrf_token=csrf_token)


@router.get("/me", response_model=SessionResponse)
async def me(current_user: CurrentUser) -> SessionResponse:
    return SessionResponse(user=serialize_user(current_user))


@router.get("/csrf", response_model=CsrfResponse)
async def csrf(session: SessionDep, session_token: SessionCookie = None) -> CsrfResponse:
    csrf_token = await rotate_csrf_token(session, session_token)
    if csrf_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    await session.commit()
    return CsrfResponse(csrf_token=csrf_token)


@router.post(
    "/password",
    response_model=SessionResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("auth.password", limit=10))],
)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    current_session: CurrentSession,
) -> SessionResponse:
    try:
        await change_user_password(
            session,
            user=current_user,
            current_password=payload.current_password,
            new_password=payload.new_password,
            ip_address=request.client.host if request.client else None,
            current_session_id=current_session.id,
        )
    except AuthError as exc:
        await session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await session.commit()
    return SessionResponse(user=serialize_user(current_user))


@router.post(
    "/email",
    response_model=SessionResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("auth.email", limit=10))],
)
async def change_email(
    payload: ChangeEmailRequest,
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
) -> SessionResponse:
    try:
        await change_user_email(
            session,
            user=current_user,
            current_password=payload.current_password,
            new_email=str(payload.new_email),
            ip_address=request.client.host if request.client else None,
        )
    except AuthError as exc:
        await session.commit()
        status_code = (
            status.HTTP_409_CONFLICT
            if str(exc) == "Email is already in use."
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc

    await session.commit()
    return SessionResponse(user=serialize_user(current_user))


@router.patch(
    "/preferences",
    response_model=SessionResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("auth.preferences", limit=30))],
)
async def change_preferences(
    payload: ChangePreferencesRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> SessionResponse:
    if payload.timezone not in available_timezones():
        raise HTTPException(status_code=400, detail="Unsupported timezone.")
    current_user.preferred_language = payload.language.lower()
    current_user.timezone = payload.timezone
    current_user.date_format = payload.date_format
    current_user.hour_format = payload.hour_format
    await session.commit()
    return SessionResponse(user=serialize_user(current_user))


@router.patch(
    "/preferences/language",
    response_model=SessionResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("auth.language", limit=30))],
)
async def change_language(
    payload: ChangeLanguageRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> SessionResponse:
    current_user.preferred_language = payload.language.lower()
    await session.commit()
    return SessionResponse(user=serialize_user(current_user))


@router.patch(
    "/preferences/regional",
    response_model=SessionResponse,
    dependencies=[Depends(require_csrf)],
)
async def change_regional_preferences(
    payload: ChangeRegionalPreferencesRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> SessionResponse:
    if payload.timezone not in available_timezones():
        raise HTTPException(status_code=400, detail="Unsupported timezone.")
    current_user.timezone = payload.timezone
    current_user.date_format = payload.date_format
    current_user.hour_format = payload.hour_format
    await session.commit()
    return SessionResponse(user=serialize_user(current_user))


@router.get("/sessions", response_model=list[UserSessionResponse])
async def own_sessions(
    session: SessionDep,
    current_user: CurrentUser,
    current_session: CurrentSession,
) -> list[UserSessionResponse]:
    return [
        UserSessionResponse(
            id=item.id,
            user_agent=item.user_agent,
            ip_address=item.ip_address,
            created_at=item.created_at,
            expires_at=item.expires_at,
            is_current=item.id == current_session.id,
        )
        for item in await list_user_sessions(session, current_user)
        if item.revoked_at is None and session_is_active(item.expires_at)
    ]


@router.delete(
    "/sessions/others",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def revoke_other_sessions(
    session: SessionDep,
    current_user: CurrentUser,
    current_session: CurrentSession,
) -> None:
    count = await revoke_user_sessions(session, current_user, except_session_id=current_session.id)
    await write_audit_event(
        session,
        "auth.sessions_revoked",
        f"Other sessions revoked: {count}",
        actor_user_id=current_user.id,
    )
    await session.commit()


@router.post(
    "/totp/setup",
    response_model=TotpSetupResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("auth.totp_setup", limit=5))],
)
async def setup_totp(
    payload: TotpSetupRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> TotpSetupResponse:
    if current_user.totp_enabled:
        raise HTTPException(status_code=409, detail="TOTP authentication is already enabled.")
    valid_password, _ = verify_password_and_update(
        payload.current_password, current_user.password_hash
    )
    if not valid_password:
        raise HTTPException(status_code=400, detail="Current password is invalid.")
    secret = generate_totp_secret()
    current_user.totp_secret_encrypted = encrypt_totp_secret(secret)
    await session.commit()
    return TotpSetupResponse(secret=secret, otpauth_uri=totp_uri(secret, current_user.email))


@router.post(
    "/totp/confirm",
    response_model=SessionResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("auth.totp_confirm", limit=10))],
)
async def confirm_totp(
    payload: TotpConfirmRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> SessionResponse:
    if not current_user.totp_secret_encrypted:
        raise HTTPException(status_code=409, detail="Authenticator setup has not been started.")
    try:
        valid = verify_totp(decrypt_totp_secret(current_user.totp_secret_encrypted), payload.code)
    except MfaSecretError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid authenticator code.")
    current_user.totp_enabled = True
    await write_audit_event(
        session, "auth.totp_enabled", "TOTP authentication enabled", actor_user_id=current_user.id
    )
    await session.commit()
    return SessionResponse(user=serialize_user(current_user))


@router.delete(
    "/totp",
    response_model=SessionResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("auth.totp_disable", limit=5))],
)
async def disable_totp(
    payload: TotpDisableRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> SessionResponse:
    password_valid, _ = verify_password_and_update(
        payload.current_password, current_user.password_hash
    )
    try:
        code_valid = bool(current_user.totp_secret_encrypted) and verify_totp(
            decrypt_totp_secret(current_user.totp_secret_encrypted), payload.code
        )
    except MfaSecretError:
        code_valid = False
    if not password_valid or not code_valid:
        raise HTTPException(status_code=400, detail="Password or authenticator code is invalid.")
    current_user.totp_enabled = False
    current_user.totp_secret_encrypted = None
    await write_audit_event(
        session, "auth.totp_disabled", "TOTP authentication disabled", actor_user_id=current_user.id
    )
    await session.commit()
    return SessionResponse(user=serialize_user(current_user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: SessionDep,
    _: None = Depends(require_csrf),
    session_token: SessionCookie = None,
) -> None:
    await revoke_user_session(session, session_token)
    await session.commit()
    clear_session_cookie(response)
