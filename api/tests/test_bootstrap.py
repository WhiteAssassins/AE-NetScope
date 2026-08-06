from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

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
