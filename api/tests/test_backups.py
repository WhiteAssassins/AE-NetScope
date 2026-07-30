import json

from app.core.config import settings
from app.services.backups import persist_inventory_backup


def test_inventory_backups_are_persisted_atomically_with_retention(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "inventory_backup_dir", str(tmp_path))
    monkeypatch.setattr(settings, "inventory_backup_retention_count", 2)

    for index in range(3):
        path = persist_inventory_backup(
            {"format": "ae-netscope.inventory.v1", "sequence": index},
            f"ae-netscope-before-restore-20260721000000000{index}.json",
        )
        path.touch()

    backups = sorted(tmp_path.glob("ae-netscope-before-restore-*.json"))
    assert len(backups) == 2
    assert json.loads(backups[-1].read_text(encoding="utf-8"))["sequence"] == 2
    assert list(tmp_path.glob("*.tmp")) == []
