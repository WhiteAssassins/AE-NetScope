import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from webauthn import (
    base64url_to_bytes,
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import options_to_json
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.api.deps import CurrentUser, SessionDep, require_csrf, require_permission
from app.api.routes.auth import serialize_user, set_session_cookie
from app.core.config import settings
from app.core.rate_limit import rate_limit
from app.core.security import verify_password_and_update
from app.models.security import SystemSetting, WebAuthnChallenge, WebAuthnCredential
from app.models.user import User
from app.schemas.auth import SessionResponse
from app.schemas.security import (
    MaintenanceStatusResponse,
    MaintenanceUpdateRequest,
    PasskeyAuthenticationOptionsRequest,
    PasskeyAuthenticationVerifyRequest,
    PasskeyCapabilityResponse,
    PasskeyCredentialResponse,
    PasskeyDeleteRequest,
    PasskeyOptionsResponse,
    PasskeyRegistrationOptionsRequest,
    PasskeyRegistrationVerifyRequest,
    SearchIndexingPolicyResponse,
    SearchIndexingPolicyUpdateRequest,
)
from app.services import search_indexing
from app.services.audit import write_audit_event
from app.services.auth import create_user_session

router = APIRouter(prefix="/security")
MAX_PASSKEYS_PER_USER = 8
PASSKEY_TRANSPORTS = {"ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"}


@dataclass(frozen=True)
class ConsumedChallenge:
    user_id: int
    challenge: bytes


def _webauthn_config() -> tuple[str, str]:
    if not settings.webauthn_rp_id or not settings.webauthn_origin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Passkeys require WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN.",
        )
    return settings.webauthn_rp_id, settings.webauthn_origin


def _options_dict(options: object) -> dict[str, object]:
    return json.loads(options_to_json(options))


async def _create_challenge(
    session: SessionDep, *, user_id: int, purpose: str, challenge: bytes
) -> WebAuthnChallenge:
    await session.execute(
        delete(WebAuthnChallenge).where(WebAuthnChallenge.expires_at < datetime.now(UTC))
    )
    item = WebAuthnChallenge(
        id=secrets.token_urlsafe(32),
        user_id=user_id,
        purpose=purpose,
        challenge=challenge,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    session.add(item)
    await session.flush()
    return item


async def _consume_challenge(
    session: SessionDep, challenge_id: str, purpose: str
) -> ConsumedChallenge:
    now = datetime.now(UTC)
    result = await session.execute(
        delete(WebAuthnChallenge)
        .where(
            WebAuthnChallenge.id == challenge_id,
            WebAuthnChallenge.purpose == purpose,
            WebAuthnChallenge.expires_at > now,
        )
        .returning(WebAuthnChallenge.user_id, WebAuthnChallenge.challenge)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=400, detail="Invalid or expired passkey challenge.")
    return ConsumedChallenge(user_id=row.user_id, challenge=row.challenge)


async def _audit_passkey_failure(
    session: SessionDep,
    request: Request,
    *,
    user_id: int | None = None,
) -> None:
    await write_audit_event(
        session,
        "auth.passkey_failed",
        "Passkey login failed",
        actor_user_id=user_id,
        ip_address=request.client.host if request.client else None,
    )


@router.get("/passkeys/capability", response_model=PasskeyCapabilityResponse)
async def passkey_capability() -> PasskeyCapabilityResponse:
    enabled = bool(settings.webauthn_rp_id and settings.webauthn_origin)
    return PasskeyCapabilityResponse(
        enabled=enabled,
        reason=None if enabled else "Passkeys are not configured for this deployment.",
    )


@router.get("/maintenance", response_model=MaintenanceStatusResponse)
async def maintenance_status(session: SessionDep) -> MaintenanceStatusResponse:
    state = await session.get(SystemSetting, 1)
    return MaintenanceStatusResponse(
        enabled=bool(state and state.maintenance_enabled),
        message=(state.maintenance_message if state else "AE NetScope is undergoing maintenance."),
    )


@router.patch(
    "/maintenance",
    response_model=MaintenanceStatusResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("settings:manage"))],
)
async def update_maintenance_status(
    payload: MaintenanceUpdateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> MaintenanceStatusResponse:
    state = await session.get(SystemSetting, 1)
    if state is None:
        state = SystemSetting(id=1)
        session.add(state)
    state.maintenance_enabled = payload.enabled
    state.maintenance_message = payload.message.strip()
    state.updated_by_user_id = current_user.id
    state.updated_at = datetime.now(UTC)
    await write_audit_event(
        session,
        "settings.maintenance_updated",
        f"Maintenance mode {'enabled' if payload.enabled else 'disabled'}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return MaintenanceStatusResponse(
        enabled=state.maintenance_enabled, message=state.maintenance_message
    )


@router.get("/search-indexing", response_model=SearchIndexingPolicyResponse)
async def search_indexing_policy(session: SessionDep) -> SearchIndexingPolicyResponse:
    state = await session.get(SystemSetting, 1)
    allowed = bool(state and state.search_engine_indexing_allowed)
    search_indexing.cache_search_engine_indexing_allowed(allowed)
    return SearchIndexingPolicyResponse(allow_indexing=allowed)


@router.patch(
    "/search-indexing",
    response_model=SearchIndexingPolicyResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("settings:manage"))],
)
async def update_search_indexing_policy(
    payload: SearchIndexingPolicyUpdateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> SearchIndexingPolicyResponse:
    state = await session.get(SystemSetting, 1)
    if state is None:
        state = SystemSetting(id=1)
        session.add(state)
    state.search_engine_indexing_allowed = payload.allow_indexing
    state.updated_by_user_id = current_user.id
    state.updated_at = datetime.now(UTC)
    await write_audit_event(
        session,
        "settings.search_indexing_updated",
        f"Search engine indexing {'allowed' if payload.allow_indexing else 'blocked'}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    search_indexing.cache_search_engine_indexing_allowed(payload.allow_indexing)
    return SearchIndexingPolicyResponse(allow_indexing=payload.allow_indexing)


@router.get("/passkeys", response_model=list[PasskeyCredentialResponse])
async def passkeys(
    session: SessionDep, current_user: CurrentUser
) -> list[PasskeyCredentialResponse]:
    result = await session.execute(
        select(WebAuthnCredential)
        .where(WebAuthnCredential.user_id == current_user.id)
        .order_by(WebAuthnCredential.created_at.desc())
    )
    return [
        PasskeyCredentialResponse(
            id=item.id,
            name=item.name,
            created_at=item.created_at,
            last_used_at=item.last_used_at,
        )
        for item in result.scalars()
    ]


@router.post(
    "/passkeys/register/options",
    response_model=PasskeyOptionsResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("passkeys.register", limit=10))],
)
async def passkey_registration_options(
    payload: PasskeyRegistrationOptionsRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> PasskeyOptionsResponse:
    valid_password, _ = verify_password_and_update(
        payload.current_password, current_user.password_hash
    )
    if not valid_password:
        raise HTTPException(status_code=400, detail="Current password is invalid.")
    rp_id, _ = _webauthn_config()
    credentials = (
        await session.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.user_id == current_user.id)
        )
    ).scalars()
    credentials = list(credentials)
    if len(credentials) >= MAX_PASSKEYS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A maximum of {MAX_PASSKEYS_PER_USER} passkeys is supported per account.",
        )
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=str(current_user.id).encode(),
        user_name=current_user.email,
        user_display_name=current_user.username,
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=item.credential_id) for item in credentials
        ],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    challenge = await _create_challenge(
        session, user_id=current_user.id, purpose="register", challenge=options.challenge
    )
    await session.commit()
    return PasskeyOptionsResponse(challenge_id=challenge.id, options=_options_dict(options))


@router.post(
    "/passkeys/register/verify",
    response_model=PasskeyCredentialResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("passkeys.verify", limit=10))],
)
async def verify_passkey_registration(
    payload: PasskeyRegistrationVerifyRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> PasskeyCredentialResponse:
    rp_id, origin = _webauthn_config()
    challenge = await _consume_challenge(session, payload.challenge_id, "register")
    if challenge.user_id != current_user.id:
        raise HTTPException(status_code=400, detail="Invalid passkey challenge.")
    try:
        verified = verify_registration_response(
            credential=payload.credential,
            expected_challenge=challenge.challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=True,
        )
    except InvalidRegistrationResponse as exc:
        await session.commit()
        raise HTTPException(status_code=400, detail="Passkey registration failed.") from exc
    item = WebAuthnCredential(
        user_id=current_user.id,
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        name=payload.name,
        transports=json.dumps(
            sorted(
                item
                for item in payload.credential.get("response", {}).get("transports", [])
                if isinstance(item, str) and item in PASSKEY_TRANSPORTS
            )
        ),
    )
    session.add(item)
    await write_audit_event(
        session, "auth.passkey_added", f"Passkey added: {item.name}", actor_user_id=current_user.id
    )
    await session.commit()
    await session.refresh(item)
    return PasskeyCredentialResponse(
        id=item.id, name=item.name, created_at=item.created_at, last_used_at=item.last_used_at
    )


@router.delete(
    "/passkeys/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf), Depends(rate_limit("passkeys.delete", limit=10))],
)
async def delete_passkey(
    credential_id: int,
    payload: PasskeyDeleteRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    valid_password, updated_password_hash = verify_password_and_update(
        payload.current_password, current_user.password_hash
    )
    if not valid_password:
        raise HTTPException(status_code=400, detail="Current password is invalid.")
    if updated_password_hash:
        current_user.password_hash = updated_password_hash
    item = await session.get(WebAuthnCredential, credential_id)
    if item is None or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Passkey not found.")
    name = item.name
    await session.delete(item)
    await write_audit_event(
        session, "auth.passkey_removed", f"Passkey removed: {name}", actor_user_id=current_user.id
    )
    await session.commit()


@router.post(
    "/passkeys/authenticate/options",
    response_model=PasskeyOptionsResponse,
    dependencies=[Depends(rate_limit("passkeys.login"))],
)
async def passkey_authentication_options(
    payload: PasskeyAuthenticationOptionsRequest,
    session: SessionDep,
) -> PasskeyOptionsResponse:
    rp_id, _ = _webauthn_config()
    user = await session.scalar(select(User).where(User.email == str(payload.email).lower()))
    credentials: list[WebAuthnCredential] = []
    if user is not None and user.is_active:
        credentials = list(
            (
                await session.execute(
                    select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id)
                )
            ).scalars()
        )
    descriptors = [
        PublicKeyCredentialDescriptor(id=item.credential_id)
        for item in credentials[:MAX_PASSKEYS_PER_USER]
    ]
    while len(descriptors) < MAX_PASSKEYS_PER_USER:
        descriptors.append(PublicKeyCredentialDescriptor(id=secrets.token_bytes(32)))
    secrets.SystemRandom().shuffle(descriptors)
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=descriptors,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    if user is None or not user.is_active or not credentials:
        return PasskeyOptionsResponse(
            challenge_id=secrets.token_urlsafe(32),
            options=_options_dict(options),
        )
    challenge = await _create_challenge(
        session, user_id=user.id, purpose="authenticate", challenge=options.challenge
    )
    await session.commit()
    return PasskeyOptionsResponse(challenge_id=challenge.id, options=_options_dict(options))


@router.post(
    "/passkeys/authenticate/verify",
    response_model=SessionResponse,
    dependencies=[Depends(rate_limit("passkeys.login_verify"))],
)
async def verify_passkey_authentication(
    payload: PasskeyAuthenticationVerifyRequest,
    request: Request,
    response: Response,
    session: SessionDep,
) -> SessionResponse:
    rp_id, origin = _webauthn_config()
    try:
        challenge = await _consume_challenge(session, payload.challenge_id, "authenticate")
    except HTTPException:
        await _audit_passkey_failure(session, request)
        await session.commit()
        raise
    try:
        credential_id = base64url_to_bytes(str(payload.credential.get("id", "")))
    except Exception as exc:
        await _audit_passkey_failure(session, request, user_id=challenge.user_id)
        await session.commit()
        raise HTTPException(status_code=400, detail="Passkey authentication failed.") from exc
    credential = await session.scalar(
        select(WebAuthnCredential).where(
            WebAuthnCredential.credential_id == credential_id,
            WebAuthnCredential.user_id == challenge.user_id,
        )
    )
    user = await session.get(User, challenge.user_id)
    if credential is None or user is None or not user.is_active:
        await _audit_passkey_failure(session, request, user_id=challenge.user_id)
        await session.commit()
        raise HTTPException(status_code=401, detail="Passkey authentication failed.")
    try:
        verified = verify_authentication_response(
            credential=payload.credential,
            expected_challenge=challenge.challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=credential.public_key,
            credential_current_sign_count=credential.sign_count,
            require_user_verification=True,
        )
    except InvalidAuthenticationResponse as exc:
        await _audit_passkey_failure(session, request, user_id=challenge.user_id)
        await session.commit()
        raise HTTPException(status_code=401, detail="Passkey authentication failed.") from exc
    credential.sign_count = verified.new_sign_count
    credential.last_used_at = datetime.now(UTC)
    user.last_login_at = datetime.now(UTC)
    token, csrf_token = await create_user_session(
        session,
        user=user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    await write_audit_event(
        session,
        "auth.passkey_login",
        f"Passkey login succeeded for {user.email}",
        actor_user_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    set_session_cookie(response, token)
    return SessionResponse(user=serialize_user(user), csrf_token=csrf_token)
