import hashlib
import hmac
import secrets

from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import settings

password_hasher = PasswordHash((Argon2Hasher(),))


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def verify_password_and_update(password: str, password_hash: str) -> tuple[bool, str | None]:
    return password_hasher.verify_and_update(password, password_hash)


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hmac.new(
        settings.session_secret.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def hash_csrf_token(token: str) -> str:
    return hmac.new(
        settings.session_secret.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def session_token_hash_candidates(token: str) -> tuple[str, ...]:
    return _unique_hashes(hash_session_token(token), _legacy_token_hash(token))


def csrf_token_hash_candidates(token: str) -> tuple[str, ...]:
    return _unique_hashes(hash_csrf_token(token), _legacy_token_hash(token))


def _legacy_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _unique_hashes(*values: str) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def generate_password(length: int = 24) -> str:
    return secrets.token_urlsafe(length)[:length]
