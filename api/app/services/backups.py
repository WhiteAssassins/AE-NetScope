import json
import os
import secrets
from pathlib import Path

from app.core.config import settings


def persist_inventory_backup(payload: dict[str, object], filename: str) -> Path:
    backup_dir = settings.effective_inventory_backup_dir
    backup_dir.mkdir(parents=True, exist_ok=True)
    destination = backup_dir / filename
    temporary = backup_dir / f".{filename}.{secrets.token_hex(6)}.tmp"
    encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

    try:
        with temporary.open("xb") as handle:
            handle.write(encoded)
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
        backup_dir.glob("ae-netscope-before-restore-*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for expired in backups[settings.inventory_backup_retention_count :]:
        expired.unlink(missing_ok=True)
