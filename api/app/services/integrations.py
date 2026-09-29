import hashlib
import secrets
from datetime import UTC, datetime

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integration import IntegrationToken
from app.models.user import User

TOKEN_PREFIX = "aens_"

INTEGRATION_PERMISSIONS = {
    "inventory:read",
    *(
        f"{resource}:{action}"
        for resource in ("devices", "ip_addresses", "networks", "vlans", "services")
        for action in ("create", "update")
    ),
}


def generate_token() -> tuple[str, str]:
    token = TOKEN_PREFIX + secrets.token_urlsafe(48)
    return token, token_digest(token)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def integration_credential(request: Request) -> str | None:
    authorization = request.headers.get("Authorization", "")
    scheme, _, credential = authorization.partition(" ")
    credential = credential.strip()
    if scheme.lower() == "bearer" and credential.startswith(TOKEN_PREFIX):
        return credential
    return None


async def authenticate_integration(request: Request, session: AsyncSession) -> User:
    credential = integration_credential(request)
    if credential is None or len(credential) > 256:
        raise HTTPException(401, "Invalid integration token.")
    result = await session.execute(
        select(IntegrationToken, User)
        .join(User, User.id == IntegrationToken.user_id)
        .where(
            IntegrationToken.token_hash == token_digest(credential),
            IntegrationToken.revoked_at.is_(None),
            IntegrationToken.expires_at > datetime.now(UTC),
            User.is_active.is_(True),
        )
    )
    row = result.first()
    if row is None:
        raise HTTPException(401, "Invalid or expired integration token.")
    token, user = row
    if user.must_change_password:
        raise HTTPException(403, "Password change required.")
    request.state.integration_token = token
    return user


def check_integration_permission(request: Request, permission: str) -> None:
    token = getattr(request.state, "integration_token", None)
    if token is None:
        return
    if permission not in INTEGRATION_PERMISSIONS or (
        permission != "inventory:read" and not token.allow_write
    ):
        raise HTTPException(403, "Integration token scope does not allow this operation.")
