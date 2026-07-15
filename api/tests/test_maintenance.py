import hashlib
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.config import settings
from app.core.security import hash_csrf_token, hash_password, hash_session_token
from app.db.base import Base
from app.models.audit import AuditEvent
from app.models.session import UserSession
from app.models.user import User
from app.services.auth import get_user_by_session_token
from app.services.maintenance import purge_expired_records


async def test_legacy_session_hash_is_accepted_and_upgraded(monkeypatch) -> None:
    monkeypatch.setattr(settings, "session_secret", "stable-test-session-secret-at-least-32-bytes")
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    raw_token = "legacy-session-token"
    legacy_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    async with session_factory() as session:
        user = User(
            email="legacy@example.com",
            username="legacy",
            password_hash=hash_password("correct-password"),
            role="admin",
        )
        session.add(user)
        await session.flush()
        session.add(
            UserSession(
                user_id=user.id,
                token_hash=legacy_hash,
                csrf_token_hash=hash_csrf_token("csrf-token"),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        await session.commit()

    async with session_factory() as session:
        authenticated_user = await get_user_by_session_token(session, raw_token)
        await session.commit()
        stored_hash = await session.scalar(select(UserSession.token_hash))

    assert authenticated_user is not None
    assert authenticated_user.email == "legacy@example.com"
    assert stored_hash == hash_session_token(raw_token)
    await engine.dispose()


async def test_retention_removes_only_old_sessions_and_audit(monkeypatch) -> None:
    monkeypatch.setattr(settings, "session_record_retention_days", 30)
    monkeypatch.setattr(settings, "audit_retention_days", 365)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    now = datetime.now(UTC)
    async with session_factory() as session:
        user = User(
            email="retention@example.com",
            username="retention",
            password_hash=hash_password("correct-password"),
            role="admin",
        )
        session.add(user)
        await session.flush()
        session.add_all(
            [
                UserSession(
                    user_id=user.id,
                    token_hash="a" * 64,
                    csrf_token_hash="b" * 64,
                    expires_at=now - timedelta(days=40),
                ),
                UserSession(
                    user_id=user.id,
                    token_hash="c" * 64,
                    csrf_token_hash="d" * 64,
                    expires_at=now + timedelta(days=1),
                ),
                AuditEvent(
                    event_type="old.event",
                    message="old",
                    created_at=now - timedelta(days=400),
                ),
                AuditEvent(event_type="recent.event", message="recent", created_at=now),
            ]
        )
        await session.commit()

    async with session_factory() as session:
        removed_sessions, removed_audit = await purge_expired_records(session)
        await session.commit()
        remaining_sessions = await session.scalar(select(func.count(UserSession.id)))
        remaining_audit = await session.scalar(select(func.count(AuditEvent.id)))

    assert (removed_sessions, removed_audit) == (1, 1)
    assert remaining_sessions == 1
    assert remaining_audit == 1

    await engine.dispose()
