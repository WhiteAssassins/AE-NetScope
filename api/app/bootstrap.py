from pathlib import Path

from sqlalchemy import select

import app.models  # noqa: F401
from app.core.security import generate_password, hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.inventory import Device, IpAddress, Network, NetworkInterface, Service, Vlan
from app.models.user import User
from app.services.setup import ensure_app_state

LOCAL_ADMIN_FILE = Path(".local-admin.txt")


async def init_database() -> None:
    var_dir = Path("var")
    var_dir.mkdir(exist_ok=True)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def ensure_local_admin() -> None:
    await init_database()

    async with SessionLocal() as session:
        result = await session.execute(select(User).limit(1))
        existing_user = result.scalar_one_or_none()
        if existing_user is not None:
            await ensure_app_state(session)
            await session.commit()
            return

        password = generate_password()
        admin = User(
            email="admin@example.com",
            username="admin",
            password_hash=hash_password(password),
            role="admin",
            is_active=True,
            must_change_password=True,
        )
        session.add(admin)
        await session.flush()
        await ensure_app_state(session)
        await session.commit()

    LOCAL_ADMIN_FILE.write_text(
        "\n".join(
            [
                "AE NetScope local admin",
                "Email: admin@example.com",
                f"Password: {password}",
                "",
                "This file is local only and must not be committed.",
            ]
        ),
        encoding="utf-8",
    )


async def ensure_demo_inventory() -> None:
    async with SessionLocal() as session:
        result = await session.execute(select(Device).limit(1))
        if result.scalar_one_or_none() is not None:
            return

        vlan_core = Vlan(vlan_id=10, name="Core", description="Fictional demo VLAN")
        vlan_lab = Vlan(vlan_id=20, name="Lab", description="Fictional demo VLAN")
        session.add_all([vlan_core, vlan_lab])
        await session.flush()

        net_core = Network(
            cidr="10.0.0.0/24",
            name="Core network",
            gateway="10.0.0.1",
            location="Lab",
            vlan_id=vlan_core.id,
        )
        net_srv = Network(
            cidr="10.0.1.0/24",
            name="Server network",
            gateway="10.0.1.1",
            location="Lab",
            vlan_id=vlan_core.id,
        )
        net_lab = Network(
            cidr="10.0.2.0/24",
            name="Lab clients",
            gateway="10.0.2.1",
            location="Lab",
            vlan_id=vlan_lab.id,
        )
        session.add_all([net_core, net_srv, net_lab])
        await session.flush()

        demo_devices = [
            ("SW-Core-01", "Switch", "10.0.0.2", "00:11:22:33:44:55", net_core.id, ["SSH"]),
            ("RTR-Edge-01", "Router", "10.0.0.1", "00:11:22:33:44:66", net_core.id, ["SSH", "DNS"]),
            (
                "SRV-APP-01",
                "Servidor",
                "10.0.1.10",
                "00:11:22:33:44:77",
                net_srv.id,
                ["SSH", "HTTP/HTTPS"],
            ),
            ("AP-LAB-01", "Access Point", "10.0.2.15", "00:11:22:33:44:88", net_lab.id, ["SSH"]),
            ("PC-LAB-07", "Equipo", "10.0.2.107", "00:11:22:33:44:99", net_lab.id, ["RDP"]),
        ]

        for name, device_type, ip_address, mac_address, network_id, service_names in demo_devices:
            device = Device(
                name=name,
                device_type=device_type,
                status="active",
                vendor="Demo Vendor",
                model="Demo Model",
                serial_number=f"DEMO-{name}",
                asset_tag=f"AE-{device_type[:3].upper()}",
                firmware_version="Demo firmware",
                cpu="Demo CPU",
                memory="Demo RAM",
                storage="Demo storage",
                owner="IT",
                rack_position="Lab",
                location="Lab",
                notes="Fictional demo data.",
            )
            session.add(device)
            await session.flush()

            interface = NetworkInterface(
                device_id=device.id,
                name="eth0",
                mac_address=mac_address.lower(),
            )
            session.add(interface)
            await session.flush()

            session.add(
                IpAddress(
                    address=ip_address,
                    assignment_type="static",
                    network_id=network_id,
                    interface_id=interface.id,
                )
            )

            for service_name in service_names:
                session.add(Service(device_id=device.id, name=service_name, status="active"))

        await session.commit()
