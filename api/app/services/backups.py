import json
import os
import secrets
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings

BACKUP_MAGIC = b"AENSB1\x00"
BACKUP_NONCE_BYTES = 12
BACKUP_TAG_BYTES = 16
BACKUP_CHUNK_BYTES = 1024 * 1024


class BackupDecryptionError(ValueError):
    pass


def _derive_backup_key(key_material: str) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"AE NetScope backup encryption v1",
        info=b"backup-data-encryption-key",
    ).derive(key_material.encode("utf-8"))


def encrypt_backup_bytes(data: bytes, *, key_material: str | None = None) -> bytes:
    nonce = secrets.token_bytes(BACKUP_NONCE_BYTES)
    encryption_key = _derive_backup_key(
        key_material or settings.effective_backup_encryption_key
    )
    encryptor = Cipher(
        algorithms.AES(encryption_key),
        modes.GCM(nonce),
    ).encryptor()
    encryptor.authenticate_additional_data(BACKUP_MAGIC)
    ciphertext = encryptor.update(data) + encryptor.finalize()
    return BACKUP_MAGIC + nonce + ciphertext + encryptor.tag


def decrypt_backup_bytes(
    payload: bytes,
    *,
    key_materials: list[str] | None = None,
) -> bytes:
    minimum_length = len(BACKUP_MAGIC) + BACKUP_NONCE_BYTES + BACKUP_TAG_BYTES
    if len(payload) < minimum_length or not payload.startswith(BACKUP_MAGIC):
        raise BackupDecryptionError("Unsupported or truncated encrypted backup.")

    nonce_start = len(BACKUP_MAGIC)
    nonce_end = nonce_start + BACKUP_NONCE_BYTES
    nonce = payload[nonce_start:nonce_end]
    ciphertext = payload[nonce_end:-BACKUP_TAG_BYTES]
    tag = payload[-BACKUP_TAG_BYTES:]
    candidates = key_materials or settings.backup_decryption_keys

    for candidate in candidates:
        try:
            decryptor = Cipher(
                algorithms.AES(_derive_backup_key(candidate)),
                modes.GCM(nonce, tag),
            ).decryptor()
            decryptor.authenticate_additional_data(BACKUP_MAGIC)
            return decryptor.update(ciphertext) + decryptor.finalize()
        except InvalidTag:
            continue
    raise BackupDecryptionError("The encrypted backup could not be authenticated.")


def encrypt_backup_file(source: Path, *, key_material: str | None = None) -> Path:
    destination = source.with_name(f"{source.name}.enc")
    temporary = destination.with_name(f".{destination.name}.{secrets.token_hex(6)}.tmp")
    nonce = secrets.token_bytes(BACKUP_NONCE_BYTES)
    encryption_key = _derive_backup_key(
        key_material or settings.effective_backup_encryption_key
    )
    encryptor = Cipher(
        algorithms.AES(encryption_key),
        modes.GCM(nonce),
    ).encryptor()
    encryptor.authenticate_additional_data(BACKUP_MAGIC)

    try:
        with source.open("rb") as input_handle, temporary.open("xb") as output_handle:
            output_handle.write(BACKUP_MAGIC)
            output_handle.write(nonce)
            while chunk := input_handle.read(BACKUP_CHUNK_BYTES):
                output_handle.write(encryptor.update(chunk))
            output_handle.write(encryptor.finalize())
            output_handle.write(encryptor.tag)
            output_handle.flush()
            os.fsync(output_handle.fileno())
        temporary.chmod(0o600)
        temporary.replace(destination)
        source.unlink()
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def decrypt_backup_file(
    source: Path,
    destination: Path,
    *,
    key_materials: list[str] | None = None,
) -> Path:
    source_size = source.stat().st_size
    header_size = len(BACKUP_MAGIC) + BACKUP_NONCE_BYTES
    if source_size < header_size + BACKUP_TAG_BYTES:
        raise BackupDecryptionError("Unsupported or truncated encrypted backup.")
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite existing file: {destination}")

    with source.open("rb") as handle:
        magic = handle.read(len(BACKUP_MAGIC))
        nonce = handle.read(BACKUP_NONCE_BYTES)
        handle.seek(-BACKUP_TAG_BYTES, os.SEEK_END)
        tag = handle.read(BACKUP_TAG_BYTES)
    if magic != BACKUP_MAGIC:
        raise BackupDecryptionError("Unsupported or truncated encrypted backup.")

    ciphertext_size = source_size - header_size - BACKUP_TAG_BYTES
    candidates = key_materials or settings.backup_decryption_keys
    for candidate in candidates:
        temporary = destination.with_name(f".{destination.name}.{secrets.token_hex(6)}.tmp")
        decryptor = Cipher(
            algorithms.AES(_derive_backup_key(candidate)),
            modes.GCM(nonce, tag),
        ).decryptor()
        decryptor.authenticate_additional_data(BACKUP_MAGIC)
        try:
            with source.open("rb") as input_handle, temporary.open("xb") as output_handle:
                input_handle.seek(header_size)
                remaining = ciphertext_size
                while remaining:
                    chunk = input_handle.read(min(BACKUP_CHUNK_BYTES, remaining))
                    if not chunk:
                        raise BackupDecryptionError("Encrypted backup ended unexpectedly.")
                    remaining -= len(chunk)
                    output_handle.write(decryptor.update(chunk))
                output_handle.write(decryptor.finalize())
                output_handle.flush()
                os.fsync(output_handle.fileno())
            temporary.chmod(0o600)
            temporary.replace(destination)
            return destination
        except InvalidTag:
            temporary.unlink(missing_ok=True)
            continue
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
    raise BackupDecryptionError("The encrypted backup could not be authenticated.")


def persist_inventory_backup(payload: dict[str, object], filename: str) -> Path:
    backup_dir = settings.effective_inventory_backup_dir
    backup_dir.mkdir(parents=True, exist_ok=True)
    encrypted_filename = filename if filename.endswith(".enc") else f"{filename}.enc"
    destination = backup_dir / encrypted_filename
    temporary = backup_dir / f".{encrypted_filename}.{secrets.token_hex(6)}.tmp"
    encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    encrypted = encrypt_backup_bytes(encoded)

    try:
        with temporary.open("xb") as handle:
            handle.write(encrypted)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(0o600)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)

    _enforce_retention(backup_dir)
    return destination


def _enforce_retention(backup_dir: Path) -> None:
    backups = sorted(
        backup_dir.glob("ae-netscope-before-restore-*.json*"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for expired in backups[settings.inventory_backup_retention_count :]:
        expired.unlink(missing_ok=True)
