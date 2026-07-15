from datetime import UTC, datetime
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import role_has_permission
from app.core.security import hash_session_token, session_token_hash_candidates
from app.db.session import get_session
from app.models.session import UserSession
from app.models.user import User
from app.services.auth import get_user_by_session_token, verify_csrf_token

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SessionCookie = Annotated[str | None, Cookie(alias=settings.session_cookie_name)]
CsrfHeader = Annotated[str | None, Header(alias="X-CSRF-Token")]


async def get_current_user(
    session: SessionDep,
    session_token: SessionCookie = None,
) -> User:
    user = await get_user_by_session_token(session, session_token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_session(
    session: SessionDep,
    session_token: SessionCookie = None,
) -> UserSession:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    result = await session.execute(
        select(UserSession).where(
            UserSession.token_hash.in_(session_token_hash_candidates(session_token)),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.now(UTC),
        )
    )
    user_session = result.scalar_one_or_none()
    if user_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    current_hash = hash_session_token(session_token)
    if user_session.token_hash != current_hash:
        user_session.token_hash = current_hash
        await session.flush()
    return user_session


CurrentSession = Annotated[UserSession, Depends(get_current_session)]


async def require_csrf(
    session: SessionDep,
    session_token: SessionCookie = None,
    csrf_token: CsrfHeader = None,
) -> None:
    if not await verify_csrf_token(session, session_token, csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")


def require_permission(permission: str):
    async def dependency(current_user: CurrentUser) -> User:
        if current_user.must_change_password:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password change required.",
            )
        if not role_has_permission(current_user.role, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied.")
        return current_user

    return dependency


def require_role(*roles: str):
    async def dependency(current_user: CurrentUser) -> User:
        if current_user.must_change_password:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password change required.",
            )
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied.")
        return current_user

    return dependency
