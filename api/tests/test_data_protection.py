from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.models.audit import AuditEvent
from app.models.inventory import Device
from app.models.session import UserSession
from app.models.user import User
from app.services.data_protection import (
    DataDecryptionError,
    decrypt_sensitive_text,
    encrypt_sensitive_text,
    migrate_sensitive_fields_to_primary_key,
)


def test_sensitive_text_encryption_is_authenticated_and_supports_rotation(monkeypatch) -> None:
    old_key = "old-sensitive-data-key" * 3
    new_key = "new-sensitive-data-key" * 3
    monkeypatch.setattr(settings, "data_encryption_key", old_key)
    encrypted = encrypt_sensitive_text("private network note")

    assert encrypted.startswith("enc:v1:")
    assert "private network note" not in encrypted
    assert decrypt_sensitive_text(encrypted) == "private network note"

    monkeypatch.setattr(settings, "data_encryption_key", new_key)
    monkeypatch.setattr(settings, "data_decryption_fallback_keys", old_key)
    assert decrypt_sensitive_text(encrypted) == "private network note"

    tampered = encrypted[:-2] + ("AA" if not encrypted.endswith("AA") else "BB")
    with pytest.raises(DataDecryptionError):
        decrypt_sensitive_text(tampered)


async def test_sensitive_device_fields_are_encrypted_in_database_and_decrypted_by_orm(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "data_encryption_key", "database-field-key" * 3)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        session.add(
            Device(
                name="secret-server",
                device_type="server",
                status="active",
                serial_number="SERIAL-PRIVATE-123",
                owner="Infrastructure Team",
                notes="Management interface is restricted.",
            )
        )
        await session.commit()

    async with session_factory() as session:
        raw = (
            await session.execute(
                text("SELECT serial_number, owner, notes FROM devices LIMIT 1")
            )
        ).one()
        device = await session.scalar(select(Device))

    assert raw.serial_number.startswith("enc:v1:")
    assert raw.owner.startswith("enc:v1:")
    assert raw.notes.startswith("enc:v1:")
    assert "SERIAL-PRIVATE-123" not in raw.serial_number
    assert device is not None
    assert device.serial_number == "SERIAL-PRIVATE-123"
    assert device.owner == "Infrastructure Team"
    assert device.notes == "Management interface is restricted."
    await engine.dispose()


async def test_ciphertext_prefix_in_plaintext_is_not_trusted(monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_encryption_key", "prefix-poisoning-key" * 3)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    literal = "enc:v1:not-actually-ciphertext"
    async with session_factory() as session:
        session.add(
            Device(name="prefixed", device_type="server", status="active", notes=literal)
        )
        await session.commit()

    async with session_factory() as session:
        raw = await session.scalar(text("SELECT notes FROM devices WHERE name = 'prefixed'"))
        device = await session.scalar(select(Device).where(Device.name == "prefixed"))

    assert raw != literal
    assert raw.startswith("enc:v1:")
    assert device is not None
    assert device.notes == literal
    await engine.dispose()


async def test_migration_preserves_malformed_ciphertext_as_literal(monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_encryption_key", "malformed-migration-key" * 3)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(
            text(
                "INSERT INTO devices (name, device_type, status, notes, created_at, updated_at) "
                "VALUES ('malformed', 'server', 'active', :notes, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"notes": "enc:v1:invalid"},
        )

    async with session_factory() as session:
        assert await migrate_sensitive_fields_to_primary_key(session) == 1
        await session.commit()
    async with session_factory() as session:
        device = await session.scalar(select(Device).where(Device.name == "malformed"))

    assert device is not None
    assert device.notes == "enc:v1:invalid"
    await engine.dispose()


async def test_plaintext_and_fallback_encrypted_fields_migrate_to_primary_key(
    monkeypatch,
) -> None:
    old_key = "old-migration-field-key" * 3
    new_key = "new-migration-field-key" * 3
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(
            text(
                "INSERT INTO devices (name, device_type, status, serial_number, notes, "
                "created_at, updated_at) VALUES "
                "('legacy-one', 'server', 'active', 'PLAINTEXT-SERIAL', "
                "'legacy note', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )

    monkeypatch.setattr(settings, "data_encryption_key", old_key)
    old_encrypted = encrypt_sensitive_text("old-key note")
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO devices (name, device_type, status, notes, created_at, updated_at) "
                "VALUES ('legacy-two', 'server', 'active', :notes, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"notes": old_encrypted},
        )

    monkeypatch.setattr(settings, "data_encryption_key", new_key)
    monkeypatch.setattr(settings, "data_decryption_fallback_keys", old_key)
    async with session_factory() as session:
        migrated = await migrate_sensitive_fields_to_primary_key(session)
        await session.commit()

    async with session_factory() as session:
        rows = (
            await session.execute(
                text("SELECT serial_number, notes FROM devices ORDER BY name")
            )
        ).all()

    assert migrated == 3
    assert rows[0].serial_number.startswith("enc:v1:")
    assert rows[0].notes.startswith("enc:v1:")
    assert rows[1].notes.startswith("enc:v1:")
    assert decrypt_sensitive_text(rows[0].serial_number) == "PLAINTEXT-SERIAL"
    assert decrypt_sensitive_text(rows[1].notes) == "old-key note"
    await engine.dispose()


async def test_session_and_audit_metadata_are_encrypted_at_rest(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "data_encryption_key", "metadata-field-key" * 3)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        user = User(
            email="admin@example.com",
            username="admin",
            password_hash="hash",
            role="admin",
        )
        session.add(user)
        await session.flush()
        now = datetime.now(UTC)
        session.add(
            UserSession(
                user_id=user.id,
                token_hash="token",
                csrf_token_hash="csrf",
                user_agent="Private Browser",
                ip_address="192.0.2.10",
                expires_at=now + timedelta(hours=1),
                last_seen_at=now,
            )
        )
        session.add(
            AuditEvent(
                actor_user_id=user.id,
                event_type="test",
                message="Sensitive audit detail",
                ip_address="192.0.2.10",
            )
        )
        await session.commit()

    async with session_factory() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT user_agent, ip_address FROM user_sessions "
                    "UNION ALL SELECT message, ip_address FROM audit_events"
                )
            )
        ).all()

    assert all(row[0].startswith("enc:v1:") for row in rows)
    assert all(row[1].startswith("enc:v1:") for row in rows)
    assert "Private Browser" not in rows[0][0]
    assert "Sensitive audit detail" not in rows[1][0]
    await engine.dispose()
