import hashlib
import secrets

from pwdlib import PasswordHash

password_hasher = PasswordHash.recommended()


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
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_csrf_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_password(length: int = 24) -> str:
    return secrets.token_urlsafe(length)[:length]
