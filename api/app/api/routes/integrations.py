from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import SessionDep, require_csrf, require_permission
from app.core.permissions import permissions_for_role
from app.core.rate_limit import rate_limit
from app.core.security import verify_password
from app.models.integration import IntegrationToken
from app.models.user import User
from app.services.audit import write_audit_event
from app.services.integrations import generate_token

TokenUser = Annotated[User, Depends(require_permission("inventory:read"))]

router = APIRouter(prefix="/integrations", tags=["integrations"])


class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=1024, repr=False)
    allow_write: bool = False
    expires_in_days: int = Field(default=30, ge=1, le=365)


class TokenResponse(BaseModel):
    id: int
    name: str
    allow_write: bool
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None

    model_config = {"from_attributes": True}


class TokenCreated(TokenResponse):
    token: str


@router.post(
    "/tokens",
    response_model=TokenCreated,
    status_code=201,
    dependencies=[Depends(require_csrf), Depends(rate_limit("integration.token", limit=5))],
)
async def create_token(
    payload: TokenCreate,
    session: SessionDep,
    user: TokenUser,
):
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(403, "Password verification failed.")
    if payload.allow_write and "devices:create" not in permissions_for_role(user.role):
        raise HTTPException(403, "Write access requires an operator or administrator.")
    plaintext, digest = generate_token()
    token = IntegrationToken(
        user_id=user.id,
        name=payload.name,
        token_hash=digest,
        allow_write=payload.allow_write,
        expires_at=datetime.now(UTC) + timedelta(days=payload.expires_in_days),
    )
    session.add(token)
    await session.flush()
    await write_audit_event(
        session, "integration.token_created", "Integration token created", actor_user_id=user.id
    )
    await session.commit()
    return TokenCreated(**TokenResponse.model_validate(token).model_dump(), token=plaintext)


@router.get("/tokens", response_model=list[TokenResponse])
async def list_tokens(session: SessionDep, user: TokenUser):
    return (
        await session.scalars(
            select(IntegrationToken)
            .where(IntegrationToken.user_id == user.id)
            .order_by(IntegrationToken.id.desc())
        )
    ).all()


@router.delete("/tokens/{token_id}", status_code=204, dependencies=[Depends(require_csrf)])
async def revoke_token(
    token_id: int,
    session: SessionDep,
    user: TokenUser,
):
    token = await session.get(IntegrationToken, token_id)
    if token is None or token.user_id != user.id:
        raise HTTPException(404, "Integration token not found.")
    token.revoked_at = datetime.now(UTC)
    await write_audit_event(
        session, "integration.token_revoked", "Integration token revoked", actor_user_id=user.id
    )
    await session.commit()
