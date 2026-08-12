from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentSession, CurrentUser, SessionDep, require_csrf, require_permission
from app.core.rate_limit import rate_limit
from app.models.security import WebAuthnCredential
from app.models.session import UserSession
from app.models.user import User
from app.schemas.users import (
    ManagedUserCreate,
    ManagedUserCreateResponse,
    ManagedUserResetPasswordResponse,
    ManagedUserResponse,
    ManagedUserSessionResponse,
    ManagedUserUpdate,
)
from app.services.audit import write_audit_event
from app.services.users import (
    LastAdminError,
    create_managed_user,
    deactivate_managed_user,
    get_user,
    list_user_sessions,
    list_users,
    reset_managed_user_password,
    revoke_user_sessions,
    update_managed_user,
    user_management_counts,
)

router = APIRouter(
    prefix="/users",
    dependencies=[
        Depends(require_permission("users:manage")),
        Depends(rate_limit("users.manage", limit=120)),
    ],
)


def serialize_managed_user(
    user: User,
    *,
    active_session_count: int = 0,
    passkey_count: int = 0,
) -> ManagedUserResponse:
    return ManagedUserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role,  # type: ignore[arg-type]
        is_active=user.is_active,
        must_change_password=user.must_change_password,
        locked_until=user.locked_until,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        active_session_count=active_session_count,
        totp_enabled=user.totp_enabled,
        passkey_count=passkey_count,
    )


def serialize_user_session(
    user_session: UserSession,
    *,
    current_session_id: int | None = None,
) -> ManagedUserSessionResponse:
    return ManagedUserSessionResponse(
        id=user_session.id,
        user_id=user_session.user_id,
        user_agent=user_session.user_agent,
        ip_address=user_session.ip_address,
        created_at=user_session.created_at,
        expires_at=user_session.expires_at,
        revoked_at=user_session.revoked_at,
        is_current=user_session.id == current_session_id,
    )


@router.get("", response_model=list[ManagedUserResponse])
async def users(session: SessionDep, _: CurrentUser) -> list[ManagedUserResponse]:
    managed_users = await list_users(session)
    session_counts, passkey_counts = await user_management_counts(session)
    return [
        serialize_managed_user(
            user,
            active_session_count=session_counts.get(user.id, 0),
            passkey_count=passkey_counts.get(user.id, 0),
        )
        for user in managed_users
    ]


@router.post(
    "",
    response_model=ManagedUserCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_user_endpoint(
    payload: ManagedUserCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> ManagedUserCreateResponse:
    try:
        user, temporary_password = await create_managed_user(session, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User email already exists.",
        ) from exc

    await write_audit_event(
        session,
        "users.created",
        f"User created: {user.email}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return ManagedUserCreateResponse(
        user=serialize_managed_user(user),
        temporary_password=temporary_password,
    )


@router.patch(
    "/{user_id}",
    response_model=ManagedUserResponse,
    dependencies=[Depends(require_csrf)],
)
async def update_user_endpoint(
    user_id: int,
    payload: ManagedUserUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    current_session: CurrentSession,
) -> ManagedUserResponse:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == current_user.id and (
        payload.is_active is False
        or (payload.role is not None and payload.role != current_user.role)
        or (
            payload.email is not None
            and str(payload.email).lower() != current_user.email.lower()
        )
        or payload.must_change_password is True
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Use account security settings for your own identity and credentials, "
                "or another administrator for role and account-status recovery."
            ),
        )

    previous_email = user.email
    previous_username = user.username
    previous_role = user.role
    previous_active = user.is_active
    try:
        user = await update_managed_user(session, user, payload)
    except LastAdminError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User email already exists.",
        ) from exc
    should_revoke_sessions = (
        payload.role is not None and payload.role != previous_role
    ) or payload.is_active is False or (
        payload.email is not None and str(payload.email).lower() != previous_email
    ) or (
        payload.username is not None and payload.username != previous_username
    ) or payload.must_change_password is True
    if should_revoke_sessions:
        except_session_id = current_session.id if user.id == current_user.id else None
        await revoke_user_sessions(session, user, except_session_id=except_session_id)

    await write_audit_event(
        session,
        "users.updated",
        (
            f"User updated: {previous_email}->{user.email}; "
            f"username {previous_username}->{user.username}; role {previous_role}->{user.role}; "
            f"active {previous_active}->{user.is_active}"
        ),
        actor_user_id=current_user.id,
    )
    await session.commit()
    return serialize_managed_user(user)


@router.post(
    "/{user_id}/reset-password",
    response_model=ManagedUserResetPasswordResponse,
    dependencies=[Depends(require_csrf)],
)
async def reset_user_password_endpoint(
    user_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> ManagedUserResetPasswordResponse:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use account security settings to change your own password.",
        )

    user, temporary_password = await reset_managed_user_password(session, user)
    await revoke_user_sessions(session, user)
    await write_audit_event(
        session,
        "users.password_reset",
        f"Password reset for: {user.email}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return ManagedUserResetPasswordResponse(
        user=serialize_managed_user(user),
        temporary_password=temporary_password,
    )


@router.post(
    "/{user_id}/reset-mfa",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def reset_user_mfa_endpoint(
    user_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use account security settings to change your own MFA methods.",
        )
    user.totp_enabled = False
    user.totp_secret_encrypted = None
    user.last_totp_counter = None
    await session.execute(delete(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
    await revoke_user_sessions(session, user)
    await write_audit_event(
        session,
        "users.mfa_reset",
        f"Multi-factor authentication reset for: {user.email}",
        actor_user_id=current_user.id,
    )
    await session.commit()


@router.delete(
    "/{user_id}",
    response_model=ManagedUserResponse,
    dependencies=[Depends(require_csrf)],
)
async def delete_user_endpoint(
    user_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    current_session: CurrentSession,
) -> ManagedUserResponse:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The current account cannot deactivate itself.",
        )

    try:
        user = await deactivate_managed_user(session, user)
    except LastAdminError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except_session_id = current_session.id if user.id == current_user.id else None
    await revoke_user_sessions(session, user, except_session_id=except_session_id)

    await write_audit_event(
        session,
        "users.deactivated",
        f"User deactivated: {user.email}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return serialize_managed_user(user)


@router.get("/{user_id}/sessions", response_model=list[ManagedUserSessionResponse])
async def user_sessions(
    user_id: int,
    session: SessionDep,
    current_session: CurrentSession,
) -> list[ManagedUserSessionResponse]:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return [
        serialize_user_session(user_session, current_session_id=current_session.id)
        for user_session in await list_user_sessions(session, user)
    ]


@router.delete(
    "/{user_id}/sessions",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def revoke_user_sessions_endpoint(
    user_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    current_session: CurrentSession,
) -> None:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    except_session_id = current_session.id if user.id == current_user.id else None
    revoked_count = await revoke_user_sessions(
        session,
        user,
        except_session_id=except_session_id,
    )
    await write_audit_event(
        session,
        "users.sessions_revoked",
        f"Sessions revoked for {user.email}: {revoked_count}",
        actor_user_id=current_user.id,
    )
    await session.commit()


@router.delete(
    "/{user_id}/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def revoke_user_session_endpoint(
    user_id: int,
    session_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    current_session: CurrentSession,
) -> None:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user_session = await session.get(UserSession, session_id)
    if user_session is None or user_session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if user_session.id == current_session.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The current session cannot be revoked from user management.",
        )
    if user_session.revoked_at is None:
        user_session.revoked_at = datetime.now(UTC)
    await write_audit_event(
        session,
        "users.session_revoked",
        f"Session revoked for {user.email}: {user_session.id}",
        actor_user_id=current_user.id,
    )
    await session.commit()
