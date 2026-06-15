from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect


def migration_config(database_url: str) -> Config:
    api_root = Path(__file__).resolve().parents[1]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_alembic_has_single_head() -> None:
    config = migration_config("sqlite:///:memory:")
    script = ScriptDirectory.from_config(config)

    assert len(script.get_heads()) == 1


def test_alembic_upgrade_head_creates_core_tables(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "migration-test.db"
    async_url = f"sqlite+aiosqlite:///{database_path.as_posix()}"
    sync_url = f"sqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", async_url)

    config = migration_config(sync_url)
    command.upgrade(config, "head")

    engine = create_engine(sync_url)
    try:
        tables = set(inspect(engine).get_table_names())
    finally:
        engine.dispose()

    assert {
        "users",
        "user_sessions",
        "audit_events",
        "devices",
        "network_interfaces",
        "ip_addresses",
        "networks",
        "vlans",
        "services",
        "alembic_version",
    }.issubset(tables)
