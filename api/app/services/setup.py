from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.state import AppState
from app.models.user import User


async def has_any_user(session: AsyncSession) -> bool:
    count = await session.scalar(select(func.count(User.id)))
    return bool(count)


async def initial_setup_required(session: AsyncSession) -> bool:
    state = await session.get(AppState, 1)
    if state is not None:
        return not state.setup_completed
    return not await has_any_user(session)


async def ensure_app_state(session: AsyncSession) -> None:
    setup_completed = await has_any_user(session)
    values = {"id": 1, "setup_completed": setup_completed, "admin_guard": 0}
    dialect_name = session.get_bind().dialect.name
    if dialect_name == "postgresql":
        statement = postgresql_insert(AppState).values(**values).on_conflict_do_nothing()
    elif dialect_name == "sqlite":
        statement = sqlite_insert(AppState).values(**values).on_conflict_do_nothing()
    else:
        existing = await session.get(AppState, 1)
        if existing is None:
            session.add(AppState(**values))
        await session.flush()
        return
    await session.execute(statement)


async def claim_initial_setup(session: AsyncSession) -> bool:
    await ensure_app_state(session)
    result = await session.execute(
        update(AppState)
        .where(AppState.id == 1, AppState.setup_completed.is_(False))
        .values(setup_completed=True)
    )
    return bool(result.rowcount)


async def acquire_admin_guard(session: AsyncSession) -> None:
    await ensure_app_state(session)
    await session.execute(
        update(AppState)
        .where(AppState.id == 1)
        .values(admin_guard=AppState.admin_guard + 1)
    )
