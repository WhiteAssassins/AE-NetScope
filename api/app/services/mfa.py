import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User


class MfaSecretError(Exception):
    pass


def _fernet(key_material: str | None = None) -> Fernet:
    material = key_material or settings.mfa_encryption_key or settings.session_secret
    key = base64.urlsafe_b64encode(hashlib.sha256(material.encode()).digest())
    return Fernet(key)


def _decryption_keys() -> list[str]:
    configured = [
        item.strip() for item in settings.mfa_decryption_fallback_keys.split(",") if item.strip()
    ]
    candidates = [
        settings.mfa_encryption_key,
        *configured,
        settings.session_secret,
    ]
    return list(dict.fromkeys(item for item in candidates if item))


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def encrypt_totp_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_totp_secret(encrypted_secret: str) -> str:
    for key_material in _decryption_keys():
        try:
            return _fernet(key_material).decrypt(encrypted_secret.encode()).decode()
        except InvalidToken:
            continue
    raise MfaSecretError("The stored authenticator secret cannot be decrypted.")


def totp_secret_uses_primary_key(encrypted_secret: str) -> bool:
    try:
        _fernet().decrypt(encrypted_secret.encode())
    except InvalidToken:
        return False
    return True


async def migrate_totp_secrets_to_primary_key(session: AsyncSession) -> int:
    if not settings.mfa_encryption_key:
        return 0

    users = list(
        (
            await session.scalars(
                select(User).where(User.totp_secret_encrypted.is_not(None))
            )
        ).all()
    )
    migrated = 0
    for user in users:
        encrypted_secret = user.totp_secret_encrypted
        if not encrypted_secret or totp_secret_uses_primary_key(encrypted_secret):
            continue
        try:
            secret = decrypt_totp_secret(encrypted_secret)
        except MfaSecretError:
            continue
        user.totp_secret_encrypted = encrypt_totp_secret(secret)
        migrated += 1
    return migrated


def totp_uri(secret: str, email: str) -> str:
    issuer = settings.app_name
    label = quote(f"{issuer}:{email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&digits=6&period=30"


def _totp_code(secret: str, counter: int) -> str:
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{value:06d}"


def verify_totp(secret: str, code: str, *, now: int | None = None) -> bool:
    if not code.isdigit() or len(code) != 6:
        return False
    counter = (now if now is not None else int(time.time())) // 30
    return any(
        hmac.compare_digest(_totp_code(secret, counter + drift), code) for drift in (-1, 0, 1)
    )
