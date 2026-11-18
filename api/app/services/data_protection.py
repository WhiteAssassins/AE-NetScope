import base64
import logging
import secrets
from functools import lru_cache

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

ENCRYPTED_VALUE_PREFIX = "enc:v1:"
DATA_NONCE_BYTES = 12
DATA_AAD = b"AE NetScope sensitive inventory field v1"

SENSITIVE_DATABASE_COLUMNS = {
    "audit_events": ("message", "ip_address"),
    "user_sessions": ("user_agent", "ip_address"),
    "vlans": ("description",),
    "networks": ("gateway", "location"),
    "devices": (
        "vendor",
        "model",
        "serial_number",
        "asset_tag",
        "operating_system",
        "firmware_version",
        "cpu",
        "memory",
        "storage",
        "warranty_expires",
        "owner",
        "rack_position",
        "location",
        "notes",
    ),
}


class DataDecryptionError(ValueError):
    pass


class DataKeyUnavailableError(DataDecryptionError):
    """A well-formed value that none of the configured keys can authenticate."""


@lru_cache(maxsize=8)
def _derive_data_key(key_material: str) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"AE NetScope field encryption v1",
        info=b"sensitive-inventory-data-encryption-key",
    ).derive(key_material.encode("utf-8"))


def is_encrypted_value(value: str) -> bool:
    return value.startswith(ENCRYPTED_VALUE_PREFIX)


def encrypt_sensitive_text(value: str, *, key_material: str | None = None) -> str:
    nonce = secrets.token_bytes(DATA_NONCE_BYTES)
    key = _derive_data_key(key_material or settings.effective_data_encryption_key)
    encrypted = AESGCM(key).encrypt(nonce, value.encode("utf-8"), DATA_AAD)
    token = base64.urlsafe_b64encode(nonce + encrypted).decode("ascii")
    return f"{ENCRYPTED_VALUE_PREFIX}{token}"


def decrypt_sensitive_text(
    value: str,
    *,
    key_materials: list[str] | None = None,
) -> str:
    if not is_encrypted_value(value):
        return value
    try:
        payload = base64.urlsafe_b64decode(value.removeprefix(ENCRYPTED_VALUE_PREFIX))
    except (ValueError, base64.binascii.Error) as exc:
        raise DataDecryptionError("Sensitive data is malformed.") from exc
    if len(payload) <= DATA_NONCE_BYTES:
        raise DataDecryptionError("Sensitive data is truncated.")
    nonce = payload[:DATA_NONCE_BYTES]
    ciphertext = payload[DATA_NONCE_BYTES:]
    for candidate in key_materials or settings.data_decryption_keys:
        try:
            plaintext = AESGCM(_derive_data_key(candidate)).decrypt(
                nonce,
                ciphertext,
                DATA_AAD,
            )
            return plaintext.decode("utf-8")
        except (InvalidTag, UnicodeDecodeError):
            continue
    raise DataKeyUnavailableError("Sensitive data could not be authenticated.")


def sensitive_text_uses_primary_key(value: str) -> bool:
    if not is_encrypted_value(value):
        return False
    try:
        decrypt_sensitive_text(value, key_materials=[settings.effective_data_encryption_key])
    except DataDecryptionError:
        return False
    return True


async def migrate_sensitive_fields_to_primary_key(session: AsyncSession) -> int:
    """Encrypt plaintext values and move values under fallback keys to the primary key.

    Well-formed values that no configured key can decrypt are left untouched and
    reported, so a missing fallback key after a rotation can still be added later.
    Re-encrypting them would wrap the ciphertext and make the original value
    unrecoverable.
    """
    migrated = 0
    unreadable = 0
    # Without fallback keys every encrypted value already uses the primary key or cannot
    # be read at all, so only plaintext values need work and startup skips the full scan.
    check_encrypted = len(settings.data_decryption_keys) > 1
    for table_name, column_names in SENSITIVE_DATABASE_COLUMNS.items():
        for column_name in column_names:
            condition = f"{column_name} IS NOT NULL"
            if not check_encrypted:
                condition += f" AND {column_name} NOT LIKE '{ENCRYPTED_VALUE_PREFIX}%'"
            rows = (
                await session.execute(
                    text(
                        f"SELECT id, {column_name} AS protected_value "  # noqa: S608
                        f"FROM {table_name} WHERE {condition}"
                    )
                )
            ).mappings()
            for row in rows:
                current_value = str(row["protected_value"])
                if sensitive_text_uses_primary_key(current_value):
                    continue
                try:
                    plaintext = decrypt_sensitive_text(current_value)
                except DataKeyUnavailableError:
                    unreadable += 1
                    continue
                except DataDecryptionError:
                    # Malformed values are legacy text that merely starts with the reserved
                    # prefix, so they are kept as literal text.
                    plaintext = current_value
                encrypted = encrypt_sensitive_text(plaintext)
                await session.execute(
                    text(
                        f"UPDATE {table_name} SET {column_name} = :encrypted "  # noqa: S608
                        "WHERE id = :record_id"
                    ),
                    {"encrypted": encrypted, "record_id": row["id"]},
                )
                migrated += 1
    if unreadable:
        logger.warning(
            "%s protected values could not be decrypted with the configured keys and were "
            "left unchanged. Add the previous key to DATA_DECRYPTION_FALLBACK_KEYS.",
            unreadable,
        )
    return migrated
