from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    consume_password_verification_time,
    csrf_token_hash_candidates,
    generate_csrf_token,
    generate_session_token,
    hash_csrf_token,
    hash_password,
    hash_session_token,
    session_token_hash_candidates,
    verify_password_and_update,
)
from app.models.session import UserSession
from app.models.user import User
from app.services.audit import write_audit_event
from app.services.mfa import MfaSecretError, decrypt_totp_secret, match_totp_counter
from app.services.users import revoke_user_sessions


class AuthError(Exception):
    pass


class AccountLockedError(AuthError):
    pass


class TotpRequiredError(AuthError):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _record_account_failure(user: User) -> None:
    user.failed_login_count += 1
    if user.failed_login_count >= settings.auth_failed_login_limit:
        user.locked_until = _now() + timedelta(minutes=settings.auth_lockout_minutes)


async def authenticate_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    ip_address: str | None,
    totp_code: str | None = None,
) -> User:
    result = await session.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()

    if user is None:
        consume_password_verification_time(password)
        await write_audit_event(
            session,
            "auth.login_failed",
            f"Login failed for unknown user {email.lower()}",
            ip_address=ip_address,
        )
        raise AuthError("Invalid email or password.")

    if not user.is_active:
        consume_password_verification_time(password)
        await write_audit_event(
            session,
            "auth.login_blocked",
            f"Inactive user attempted login: {user.email}",
            actor_user_id=user.id,
            ip_address=ip_address,
        )
        raise AuthError("Invalid email or password.")

    if user.locked_until and _as_aware(user.locked_until) > _now():
        consume_password_verification_time(password)
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
        _record_account_failure(user)

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

    if user.totp_enabled:
        if not totp_code:
            raise TotpRequiredError("Authenticator code required.")
        matched_counter: int | None = None
        try:
            if user.totp_secret_encrypted:
                matched_counter = match_totp_counter(
                    decrypt_totp_secret(user.totp_secret_encrypted), totp_code
                )
        except MfaSecretError:
            matched_counter = None
        if matched_counter is not None:
            consumed = await session.execute(
                update(User)
                .where(
                    User.id == user.id,
                    or_(
                        User.last_totp_counter.is_(None),
                        User.last_totp_counter < matched_counter,
                    ),
                )
                .values(last_totp_counter=matched_counter)
                .execution_options(synchronize_session=False)
            )
            if consumed.rowcount != 1:
                matched_counter = None
        if matched_counter is None:
            _record_account_failure(user)
            await write_audit_event(
                session,
                "auth.mfa_failed",
                f"Authenticator code failed for {user.email}",
                actor_user_id=user.id,
                ip_address=ip_address,
            )
            raise AuthError("Invalid email, password, or authenticator code.")

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
    now = _now()
    session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            csrf_token_hash=hash_csrf_token(csrf_token),
            user_agent=user_agent,
            ip_address=ip_address,
            expires_at=now + timedelta(seconds=settings.session_ttl_seconds),
            last_seen_at=now,
        )
    )
    return token, csrf_token


async def get_user_by_session_token(session: AsyncSession, token: str | None) -> User | None:
    if not token:
        return None

    now = _now()
    idle_cutoff = now - timedelta(seconds=settings.session_idle_timeout_seconds)
    result = await session.execute(
        select(User, UserSession)
        .join(UserSession, UserSession.user_id == User.id)
        .where(
            UserSession.token_hash.in_(session_token_hash_candidates(token)),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
            UserSession.last_seen_at > idle_cutoff,
            User.is_active.is_(True),
        )
    )
    row = result.first()
    if row is None:
        return None
    user, user_session = row
    current_hash = hash_session_token(token)
    session_changed = False
    if user_session.token_hash != current_hash:
        user_session.token_hash = current_hash
        session_changed = True
    if _as_aware(user_session.last_seen_at) <= now - timedelta(
        seconds=settings.session_touch_interval_seconds
    ):
        user_session.last_seen_at = now
        session_changed = True
    if session_changed:
        await session.commit()
    return user


async def rotate_csrf_token(session: AsyncSession, token: str | None) -> str | None:
    if not token:
        return None

    now = _now()
    idle_cutoff = now - timedelta(seconds=settings.session_idle_timeout_seconds)
    result = await session.execute(
        select(UserSession).where(
            UserSession.token_hash.in_(session_token_hash_candidates(token)),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
            UserSession.last_seen_at > idle_cutoff,
        )
    )
    user_session = result.scalar_one_or_none()
    if user_session is None:
        return None

    csrf_token = generate_csrf_token()
    current_session_hash = hash_session_token(token)
    if user_session.token_hash != current_session_hash:
        user_session.token_hash = current_session_hash
    user_session.csrf_token_hash = hash_csrf_token(csrf_token)
    user_session.last_seen_at = now
    return csrf_token


async def verify_csrf_token(
    session: AsyncSession,
    session_token: str | None,
    csrf_token: str | None,
) -> bool:
    if not session_token or not csrf_token:
        return False

    now = _now()
    idle_cutoff = now - timedelta(seconds=settings.session_idle_timeout_seconds)
    result = await session.execute(
        select(UserSession).where(
            UserSession.token_hash.in_(session_token_hash_candidates(session_token)),
            UserSession.csrf_token_hash.in_(csrf_token_hash_candidates(csrf_token)),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
            UserSession.last_seen_at > idle_cutoff,
        )
    )
    user_session = result.scalar_one_or_none()
    if user_session is None:
        return False
    current_session_hash = hash_session_token(session_token)
    current_csrf_hash = hash_csrf_token(csrf_token)
    if user_session.token_hash != current_session_hash:
        user_session.token_hash = current_session_hash
    if user_session.csrf_token_hash != current_csrf_hash:
        user_session.csrf_token_hash = current_csrf_hash
    if _as_aware(user_session.last_seen_at) <= now - timedelta(
        seconds=settings.session_touch_interval_seconds
    ):
        user_session.last_seen_at = now
    await session.flush()
    return True


async def change_user_password(
    session: AsyncSession,
    *,
    user: User,
    current_password: str,
    new_password: str,
    ip_address: str | None,
    current_session_id: int | None = None,
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
    await revoke_user_sessions(session, user, except_session_id=current_session_id)

    await write_audit_event(
        session,
        "auth.password_changed",
        f"Password changed for {user.email}",
        actor_user_id=user.id,
        ip_address=ip_address,
    )


async def change_user_email(
    session: AsyncSession,
    *,
    user: User,
    current_password: str,
    new_email: str,
    ip_address: str | None,
    current_session_id: int | None = None,
) -> None:
    is_valid_password, _ = verify_password_and_update(current_password, user.password_hash)
    if not is_valid_password:
        await write_audit_event(
            session,
            "auth.email_change_failed",
            f"Email change failed for {user.email}",
            actor_user_id=user.id,
            ip_address=ip_address,
        )
        raise AuthError("Current password is invalid.")

    normalized_email = new_email.lower()
    if normalized_email == user.email:
        return

    existing_user = await session.scalar(select(User).where(User.email == normalized_email))
    if existing_user is not None:
        await write_audit_event(
            session,
            "auth.email_change_failed",
            f"Email change conflict for {user.email}",
            actor_user_id=user.id,
            ip_address=ip_address,
        )
        raise AuthError("Email is already in use.")

    old_email = user.email
    user.email = normalized_email
    await revoke_user_sessions(session, user, except_session_id=current_session_id)
    await write_audit_event(
        session,
        "auth.email_changed",
        f"Email changed for {old_email} to {normalized_email}",
        actor_user_id=user.id,
        ip_address=ip_address,
    )


async def revoke_user_session(session: AsyncSession, token: str | None) -> None:
    if not token:
        return

    result = await session.execute(
        select(UserSession).where(
            UserSession.token_hash.in_(session_token_hash_candidates(token)),
            UserSession.revoked_at.is_(None),
        )
    )
    user_session = result.scalar_one_or_none()
    if user_session:
        user_session.revoked_at = _now()
