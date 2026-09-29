import os
import stat
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.bootstrap as bootstrap
import app.cli as cli
import app.models  # noqa: F401
from app.models.inventory import Device, IpAddress, Network, NetworkInterface, Service, Vlan
from app.models.user import User


async def test_local_bootstrap_is_idempotent(tmp_path: Path, monkeypatch) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(bootstrap, "engine", engine)
    monkeypatch.setattr(bootstrap, "SessionLocal", session_factory)
    monkeypatch.setattr(bootstrap, "LOCAL_ADMIN_FILE", tmp_path / ".local-admin.txt")
    monkeypatch.setattr(bootstrap, "generate_password", lambda: "Local-Password-123")

    await bootstrap.ensure_local_admin()
    await bootstrap.ensure_local_admin()
    await bootstrap.ensure_demo_inventory()
    await bootstrap.ensure_demo_inventory()

    credentials = (tmp_path / ".local-admin.txt").read_text(encoding="utf-8")
    assert "Email: admin@example.com" in credentials
    assert "Password: Local-Password-123" in credentials
    assert (tmp_path / "var").is_dir()

    async with session_factory() as session:
        counts = {
            model.__tablename__: await session.scalar(select(func.count()).select_from(model))
            for model in (User, Vlan, Network, Device, NetworkInterface, IpAddress, Service)
        }

    assert counts == {
        "users": 1,
        "vlans": 2,
        "networks": 3,
        "devices": 5,
        "network_interfaces": 5,
        "ip_addresses": 5,
        "services": 7,
    }
    await engine.dispose()


async def test_cli_prepares_admin_and_demo_inventory(monkeypatch, capsys) -> None:
    calls: list[str] = []

    async def local_admin() -> None:
        calls.append("admin")

    async def demo_inventory() -> None:
        calls.append("inventory")

    monkeypatch.setattr(cli, "ensure_local_admin", local_admin)
    monkeypatch.setattr(cli, "ensure_demo_inventory", demo_inventory)

    await cli.main()

    assert calls == ["admin", "inventory"]
    assert capsys.readouterr().out.strip() == "AE NetScope local database is ready."


@pytest.mark.skipif(os.name != "posix", reason="POSIX file modes required")
async def test_initial_admin_credentials_are_private_before_writing(tmp_path, monkeypatch) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    credential_file = tmp_path / ".local-admin.txt"
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(bootstrap, "engine", engine)
    monkeypatch.setattr(bootstrap, "SessionLocal", session_factory)
    monkeypatch.setattr(bootstrap, "LOCAL_ADMIN_FILE", credential_file)
    monkeypatch.setattr(bootstrap, "generate_password", lambda: "Local-Password-123")
    original_open = bootstrap.open_private_file
    created_modes = []

    def record_mode(path):
        handle = original_open(path)
        created_modes.append(stat.S_IMODE(path.stat().st_mode))
        return handle

    monkeypatch.setattr(bootstrap, "open_private_file", record_mode)
    previous_umask = os.umask(0o022)
    try:
        await bootstrap.ensure_local_admin()
    finally:
        os.umask(previous_umask)

    assert created_modes == [0o600]
    assert stat.S_IMODE(credential_file.stat().st_mode) == 0o600
    assert "Password: Local-Password-123" in credential_file.read_text(encoding="utf-8")
    await engine.dispose()


@pytest.mark.parametrize("existing_kind", ["regular", "symlink"])
async def test_bootstrap_refuses_preexisting_credential_path_without_creating_admin(
    tmp_path, monkeypatch, existing_kind
) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    credential_file = tmp_path / ".local-admin.txt"
    target = tmp_path / "existing.txt"
    target.write_text("unchanged", encoding="utf-8")
    if existing_kind == "symlink":
        credential_file.symlink_to(target)
    else:
        credential_file.write_text("unchanged", encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(bootstrap, "engine", engine)
    monkeypatch.setattr(bootstrap, "SessionLocal", session_factory)
    monkeypatch.setattr(bootstrap, "LOCAL_ADMIN_FILE", credential_file)
    monkeypatch.setattr(bootstrap, "generate_password", lambda: "Local-Password-123")

    with pytest.raises(FileExistsError):
        await bootstrap.ensure_local_admin()
    async with session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 0
    assert target.read_text(encoding="utf-8") == "unchanged"
    credential_file.unlink()

    await bootstrap.ensure_local_admin()
    async with session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 1
    await engine.dispose()


async def test_bootstrap_removes_new_credentials_if_database_commit_fails(
    tmp_path, monkeypatch
) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    credential_file = tmp_path / ".local-admin.txt"
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(bootstrap, "engine", engine)
    monkeypatch.setattr(bootstrap, "SessionLocal", session_factory)
    monkeypatch.setattr(bootstrap, "LOCAL_ADMIN_FILE", credential_file)

    async def fail_commit(_session):
        raise RuntimeError("commit failed")

    monkeypatch.setattr(AsyncSession, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="commit failed"):
        await bootstrap.ensure_local_admin()
    assert not credential_file.exists()
    async with session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 0
    await engine.dispose()
