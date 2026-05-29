from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    generate_csrf_token,
    generate_session_token,
    hash_csrf_token,
    hash_password,
    hash_session_token,
    verify_password_and_update,
)
from app.models.session import UserSession
from app.models.user import User
from app.services.audit import write_audit_event


class AuthError(Exception):
    pass


class AccountLockedError(AuthError):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


async def authenticate_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    ip_address: str | None,
) -> User:
    result = await session.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()

    if user is None:
        await write_audit_event(
            session,
            "auth.login_failed",
            f"Login failed for unknown user {email.lower()}",
            ip_address=ip_address,
        )
        raise AuthError("Invalid email or password.")

    if not user.is_active:
        await write_audit_event(
            session,
            "auth.login_blocked",
            f"Inactive user attempted login: {user.email}",
            actor_user_id=user.id,
            ip_address=ip_address,
        )
        raise AuthError("Invalid email or password.")

    if user.locked_until and user.locked_until > _now():
        await write_audit_event(
            session,
            "auth.login_locked",
            f"Locked user attempted login: {user.email}",
            actor_user_id=user.id,
            ip_address=ip_address,
        )
        raise AccountLockedError("Account is temporarily locked.")

    is_valid_password, updated_password_hash = verify_password_and_update(
        password,
        user.password_hash,
    )
    if not is_valid_password:
        user.failed_login_count += 1
        if user.failed_login_count >= settings.auth_rate_limit_per_minute:
            user.locked_until = _now() + timedelta(minutes=settings.auth_lockout_minutes)

        await write_audit_event(
            session,
            "auth.login_failed",
            f"Login failed for {user.email}",
            actor_user_id=user.id,
            ip_address=ip_address,
        )
        raise AuthError("Invalid email or password.")

    if updated_password_hash:
        user.password_hash = updated_password_hash

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = _now()

    await write_audit_event(
        session,
        "auth.login_success",
        f"Login succeeded for {user.email}",
        actor_user_id=user.id,
        ip_address=ip_address,
    )
    return user


async def create_user_session(
    session: AsyncSession,
    *,
    user: User,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[str, str]:
    token = generate_session_token()
    csrf_token = generate_csrf_token()
    session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            csrf_token_hash=hash_csrf_token(csrf_token),
            user_agent=user_agent,
            ip_address=ip_address,
            expires_at=_now() + timedelta(seconds=settings.session_ttl_seconds),
        )
    )
    return token, csrf_token


async def get_user_by_session_token(session: AsyncSession, token: str | None) -> User | None:
    if not token:
        return None

    result = await session.execute(
        select(User)
        .join(UserSession, UserSession.user_id == User.id)
        .where(
            UserSession.token_hash == hash_session_token(token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > _now(),
            User.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()


async def rotate_csrf_token(session: AsyncSession, token: str | None) -> str | None:
    if not token:
        return None

    result = await session.execute(
        select(UserSession).where(
            UserSession.token_hash == hash_session_token(token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > _now(),
        )
    )
    user_session = result.scalar_one_or_none()
    if user_session is None:
        return None

    csrf_token = generate_csrf_token()
    user_session.csrf_token_hash = hash_csrf_token(csrf_token)
    return csrf_token


async def verify_csrf_token(
    session: AsyncSession,
    session_token: str | None,
    csrf_token: str | None,
) -> bool:
    if not session_token or not csrf_token:
        return False

    result = await session.execute(
        select(UserSession).where(
            UserSession.token_hash == hash_session_token(session_token),
            UserSession.csrf_token_hash == hash_csrf_token(csrf_token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > _now(),
        )
    )
    return result.scalar_one_or_none() is not None


async def change_user_password(
    session: AsyncSession,
    *,
    user: User,
    current_password: str,
    new_password: str,
    ip_address: str | None,
) -> None:
    is_valid_password, _ = verify_password_and_update(current_password, user.password_hash)
    if not is_valid_password:
        await write_audit_event(
            session,
            "auth.password_change_failed",
            f"Password change failed for {user.email}",
            actor_user_id=user.id,
            ip_address=ip_address,
        )
        raise AuthError("Current password is invalid.")

    user.password_hash = hash_password(new_password)
    user.must_change_password = False

    await write_audit_event(
        session,
        "auth.password_changed",
        f"Password changed for {user.email}",
        actor_user_id=user.id,
        ip_address=ip_address,
    )


async def revoke_user_session(session: AsyncSession, token: str | None) -> None:
    if not token:
        return

    result = await session.execute(
        select(UserSession).where(
            UserSession.token_hash == hash_session_token(token),
            UserSession.revoked_at.is_(None),
        )
    )
    user_session = result.scalar_one_or_none()
    if user_session:
        user_session.revoked_at = _now()
