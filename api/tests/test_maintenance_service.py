from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.db.base import Base
from app.models.security import UpdateHistory
from app.services import maintenance


async def test_interrupted_updates_are_reconciled_after_restart(monkeypatch) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    monkeypatch.setattr(maintenance, "project_version", lambda: "0.1.8-alpha")
    async with session_factory() as session:
        session.add_all(
            [
                UpdateHistory(target_tag="v0.1.8-alpha", status="started"),
                UpdateHistory(target_tag="v0.1.9-alpha", status="started"),
            ]
        )
        await session.commit()
        assert await maintenance.reconcile_interrupted_updates(session) == 2
        await session.commit()
        rows = list(
            (
                await session.scalars(
                    select(UpdateHistory).order_by(UpdateHistory.target_tag)
                )
            ).all()
        )

    assert [item.status for item in rows] == ["succeeded", "unknown"]
    await engine.dispose()
