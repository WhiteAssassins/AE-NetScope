from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import role_has_permission
from app.db.session import get_session
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


async def require_csrf(
    session: SessionDep,
    session_token: SessionCookie = None,
    csrf_token: CsrfHeader = None,
) -> None:
    if not await verify_csrf_token(session, session_token, csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")


def require_permission(permission: str):
    async def dependency(current_user: CurrentUser) -> User:
        if not role_has_permission(current_user.role, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied.")
        return current_user

    return dependency


def require_role(*roles: str):
    async def dependency(current_user: CurrentUser) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied.")
        return current_user

    return dependency
