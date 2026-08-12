import json
import sys

import pytest

from app.backup_cli import main as backup_cli_main
from app.core.config import settings
from app.services.backups import (
    BACKUP_MAGIC,
    BackupDecryptionError,
    decrypt_backup_bytes,
    decrypt_backup_file,
    encrypt_backup_file,
    persist_inventory_backup,
)


def test_inventory_backups_are_encrypted_atomically_with_retention(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "inventory_backup_dir", str(tmp_path))
    monkeypatch.setattr(settings, "inventory_backup_retention_count", 2)
    monkeypatch.setattr(settings, "backup_encryption_key", "backup-key-a" * 4)

    for index in range(3):
        path = persist_inventory_backup(
            {"format": "ae-netscope.inventory.v1", "sequence": index},
            f"ae-netscope-before-restore-20260721000000000{index}.json",
        )
        path.touch()

    backups = sorted(tmp_path.glob("ae-netscope-before-restore-*.json.enc"))
    assert len(backups) == 2
    encrypted = backups[-1].read_bytes()
    assert encrypted.startswith(BACKUP_MAGIC)
    assert b"ae-netscope.inventory.v1" not in encrypted
    decoded = decrypt_backup_bytes(encrypted)
    assert json.loads(decoded)["sequence"] == 2
    assert list(tmp_path.glob("*.tmp")) == []


def test_backup_authentication_rejects_tampering_and_wrong_keys(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "inventory_backup_dir", str(tmp_path))
    monkeypatch.setattr(settings, "backup_encryption_key", "primary-key" * 4)
    path = persist_inventory_backup(
        {"format": "ae-netscope.inventory.v1", "secret": "hidden"},
        "ae-netscope-before-restore-test.json",
    )
    encrypted = bytearray(path.read_bytes())
    encrypted[-20] ^= 1

    with pytest.raises(BackupDecryptionError):
        decrypt_backup_bytes(bytes(encrypted))
    with pytest.raises(BackupDecryptionError):
        decrypt_backup_bytes(path.read_bytes(), key_materials=["wrong-key" * 4])


def test_backup_key_rotation_accepts_fallback_key(tmp_path, monkeypatch) -> None:
    old_key = "old-backup-key" * 4
    new_key = "new-backup-key" * 4
    monkeypatch.setattr(settings, "inventory_backup_dir", str(tmp_path))
    monkeypatch.setattr(settings, "backup_encryption_key", old_key)
    path = persist_inventory_backup(
        {"format": "ae-netscope.inventory.v1"},
        "ae-netscope-before-restore-rotation.json",
    )

    monkeypatch.setattr(settings, "backup_encryption_key", new_key)
    monkeypatch.setattr(settings, "backup_decryption_fallback_keys", old_key)
    assert json.loads(decrypt_backup_bytes(path.read_bytes()))["format"] == (
        "ae-netscope.inventory.v1"
    )


def test_large_file_backup_is_stream_encrypted_and_plaintext_removed(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "backup_encryption_key", "stream-key" * 4)
    source = tmp_path / "ae-netscope-pre-migration.dump"
    plaintext = b"database-secret\x00" * 100_000
    source.write_bytes(plaintext)

    encrypted_path = encrypt_backup_file(source)

    assert encrypted_path.name.endswith(".dump.enc")
    assert source.exists() is False
    assert b"database-secret" not in encrypted_path.read_bytes()
    assert decrypt_backup_bytes(encrypted_path.read_bytes()) == plaintext

    restored_path = tmp_path / "restored.dump"
    assert decrypt_backup_file(encrypted_path, restored_path) == restored_path
    assert restored_path.read_bytes() == plaintext

    with pytest.raises(FileExistsError):
        decrypt_backup_file(encrypted_path, restored_path)


def test_backup_cli_encrypts_and_decrypts_files(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(settings, "backup_encryption_key", "cli-backup-key" * 4)
    source = tmp_path / "database.dump"
    source.write_bytes(b"recoverable database data")
    monkeypatch.setattr(sys, "argv", ["backup_cli", "encrypt", str(source)])

    backup_cli_main()

    encrypted = tmp_path / "database.dump.enc"
    assert capsys.readouterr().out.strip() == str(encrypted)
    output = tmp_path / "restored.dump"
    monkeypatch.setattr(
        sys,
        "argv",
        ["backup_cli", "decrypt", str(encrypted), "--output", str(output)],
    )

    backup_cli_main()

    assert capsys.readouterr().out.strip() == str(output)
    assert output.read_bytes() == b"recoverable database data"


def test_backup_cli_requires_decryption_output(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(sys, "argv", ["backup_cli", "decrypt", str(tmp_path / "backup.enc")])

    with pytest.raises(SystemExit, match="2"):
        backup_cli_main()
