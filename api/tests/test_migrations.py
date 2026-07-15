from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text


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
    assert all(len(revision.revision) <= 32 for revision in script.walk_revisions())


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
        "app_state",
        "alembic_version",
    }.issubset(tables)


def test_language_migration_preserves_existing_users(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "language-migration-test.db"
    async_url = f"sqlite+aiosqlite:///{database_path.as_posix()}"
    sync_url = f"sqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", async_url)

    config = migration_config(sync_url)
    command.upgrade(config, "0003_device_hardware_fields")
    engine = create_engine(sync_url)
    now = "2026-07-10 00:00:00+00:00"
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (
                    email, username, password_hash, role, is_active,
                    must_change_password, failed_login_count, created_at, updated_at
                ) VALUES (
                    :email, :username, :password_hash, :role, :is_active,
                    :must_change_password, :failed_login_count, :created_at, :updated_at
                )
                """
            ),
            {
                "email": "existing@example.com",
                "username": "existing",
                "password_hash": "hash",
                "role": "admin",
                "is_active": True,
                "must_change_password": False,
                "failed_login_count": 0,
                "created_at": now,
                "updated_at": now,
            },
        )

    command.upgrade(config, "head")

    try:
        inspected_columns = inspect(engine).get_columns("users")
        columns = {column["name"] for column in inspected_columns}
        preferred_language_column = next(
            column for column in inspected_columns if column["name"] == "preferred_language"
        )
        with engine.connect() as connection:
            user = connection.execute(
                text("SELECT email, preferred_language FROM users WHERE username = 'existing'")
            ).one()
    finally:
        engine.dispose()

    assert "preferred_language" in columns
    assert preferred_language_column["type"].length == 64
    assert user.email == "existing@example.com"
    assert user.preferred_language == "en"


def test_security_migration_marks_existing_setup_complete(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "security-migration-test.db"
    async_url = f"sqlite+aiosqlite:///{database_path.as_posix()}"
    sync_url = f"sqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", async_url)

    config = migration_config(sync_url)
    command.upgrade(config, "0004_user_preferred_language")
    engine = create_engine(sync_url)
    now = "2026-07-15 00:00:00+00:00"
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (
                    email, username, password_hash, role, preferred_language,
                    is_active, must_change_password, failed_login_count,
                    created_at, updated_at
                ) VALUES (
                    'owner@example.com', 'owner', 'hash', 'admin', 'en',
                    TRUE, FALSE, 0, :now, :now
                )
                """
            ),
            {"now": now},
        )

    command.upgrade(config, "head")

    try:
        inspector = inspect(engine)
        session_indexes = {index["name"] for index in inspector.get_indexes("user_sessions")}
        audit_indexes = {index["name"] for index in inspector.get_indexes("audit_events")}
        with engine.connect() as connection:
            state = connection.execute(
                text("SELECT setup_completed, admin_guard FROM app_state WHERE id = 1")
            ).one()
    finally:
        engine.dispose()

    assert bool(state.setup_completed) is True
    assert state.admin_guard == 0
    assert "ix_user_sessions_expires_at" in session_indexes
    assert "ix_audit_events_created_at" in audit_indexes
