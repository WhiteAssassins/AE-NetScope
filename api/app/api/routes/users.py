from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, SessionDep, require_csrf, require_permission
from app.models.user import User
from app.schemas.users import (
    ManagedUserCreate,
    ManagedUserCreateResponse,
    ManagedUserResetPasswordResponse,
    ManagedUserResponse,
    ManagedUserUpdate,
)
from app.services.audit import write_audit_event
from app.services.users import (
    LastAdminError,
    create_managed_user,
    deactivate_managed_user,
    get_user,
    list_users,
    reset_managed_user_password,
    update_managed_user,
)

router = APIRouter(
    prefix="/users",
    dependencies=[Depends(require_permission("users:manage"))],
)


def serialize_managed_user(user: User) -> ManagedUserResponse:
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
    )


@router.get("", response_model=list[ManagedUserResponse])
async def users(session: SessionDep, _: CurrentUser) -> list[ManagedUserResponse]:
    return [serialize_managed_user(user) for user in await list_users(session)]


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
) -> ManagedUserResponse:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    previous_role = user.role
    previous_active = user.is_active
    try:
        user = await update_managed_user(session, user, payload)
    except LastAdminError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await write_audit_event(
        session,
        "users.updated",
        (
            f"User updated: {user.email}; role {previous_role}->{user.role}; "
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

    user, temporary_password = await reset_managed_user_password(session, user)
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


@router.delete(
    "/{user_id}",
    response_model=ManagedUserResponse,
    dependencies=[Depends(require_csrf)],
)
async def delete_user_endpoint(
    user_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> ManagedUserResponse:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    try:
        user = await deactivate_managed_user(session, user)
    except LastAdminError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await write_audit_event(
        session,
        "users.deactivated",
        f"User deactivated: {user.email}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return serialize_managed_user(user)
