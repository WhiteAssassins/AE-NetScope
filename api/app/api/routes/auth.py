from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.deps import CurrentUser, SessionCookie, SessionDep, require_csrf
from app.core.config import settings
from app.core.permissions import permissions_for_role
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    CsrfResponse,
    LoginRequest,
    SessionResponse,
    UserResponse,
)
from app.services.auth import (
    AccountLockedError,
    AuthError,
    authenticate_user,
    change_user_password,
    create_user_session,
    revoke_user_session,
    rotate_csrf_token,
)

router = APIRouter(prefix="/auth")


def serialize_user(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role,
        permissions=sorted(permissions_for_role(user.role)),
        must_change_password=user.must_change_password,
    )


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )


@router.post("/login", response_model=SessionResponse)
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
        )
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


@router.post("/password", response_model=SessionResponse, dependencies=[Depends(require_csrf)])
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
) -> SessionResponse:
    try:
        await change_user_password(
            session,
            user=current_user,
            current_password=payload.current_password,
            new_password=payload.new_password,
            ip_address=request.client.host if request.client else None,
        )
    except AuthError as exc:
        await session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

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
