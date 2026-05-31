from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_password, hash_password
from app.models.session import UserSession
from app.models.user import User
from app.schemas.users import ManagedUserCreate, ManagedUserUpdate


class LastAdminError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


async def list_users(session: AsyncSession) -> list[User]:
    result = await session.execute(select(User).order_by(User.created_at.desc(), User.id.desc()))
    return list(result.scalars())


async def get_user(session: AsyncSession, user_id: int) -> User | None:
    return await session.get(User, user_id)


async def active_admin_count(session: AsyncSession) -> int:
    result = await session.execute(
        select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True))
    )
    return result.scalar_one()


async def would_remove_last_active_admin(
    session: AsyncSession,
    user: User,
    *,
    next_role: str | None = None,
    next_is_active: bool | None = None,
) -> bool:
    role = next_role if next_role is not None else user.role
    is_active = next_is_active if next_is_active is not None else user.is_active
    if user.role != "admin" or not user.is_active:
        return False
    if role == "admin" and is_active:
        return False
    return await active_admin_count(session) <= 1


async def create_managed_user(
    session: AsyncSession,
    payload: ManagedUserCreate,
) -> tuple[User, str]:
    temporary_password = generate_password()
    user = User(
        email=payload.email.lower(),
        username=payload.username,
        password_hash=hash_password(temporary_password),
        role=payload.role,
        is_active=True,
        must_change_password=True,
    )
    session.add(user)
    await session.flush()
    return user, temporary_password


async def update_managed_user(
    session: AsyncSession,
    user: User,
    payload: ManagedUserUpdate,
) -> User:
    next_role = payload.role if payload.role is not None else user.role
    next_is_active = payload.is_active if payload.is_active is not None else user.is_active
    if await would_remove_last_active_admin(
        session,
        user,
        next_role=next_role,
        next_is_active=next_is_active,
    ):
        raise LastAdminError("At least one active admin is required.")

    if payload.username is not None:
        user.username = payload.username
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.must_change_password is not None:
        user.must_change_password = payload.must_change_password
    if payload.clear_lock:
        user.locked_until = None
        user.failed_login_count = 0
    await session.flush()
    return user


async def reset_managed_user_password(session: AsyncSession, user: User) -> tuple[User, str]:
    temporary_password = generate_password()
    user.password_hash = hash_password(temporary_password)
    user.must_change_password = True
    user.locked_until = None
    user.failed_login_count = 0
    await session.flush()
    return user, temporary_password


async def deactivate_managed_user(session: AsyncSession, user: User) -> User:
    if await would_remove_last_active_admin(session, user, next_is_active=False):
        raise LastAdminError("At least one active admin is required.")
    user.is_active = False
    await session.flush()
    return user


async def list_user_sessions(session: AsyncSession, user: User) -> list[UserSession]:
    result = await session.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id)
        .order_by(UserSession.created_at.desc(), UserSession.id.desc())
    )
    return list(result.scalars())


async def revoke_user_sessions(
    session: AsyncSession,
    user: User,
    *,
    except_session_id: int | None = None,
) -> int:
    revoked_count = 0
    now = _now()
    for user_session in await list_user_sessions(session, user):
        if user_session.revoked_at is not None:
            continue
        if _as_aware(user_session.expires_at) <= now:
            continue
        if except_session_id is not None and user_session.id == except_session_id:
            continue
        user_session.revoked_at = now
        revoked_count += 1
    await session.flush()
    return revoked_count
