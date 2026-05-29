from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Device, IpAddress, Network, NetworkInterface, Service, Vlan
from app.schemas.inventory import (
    DashboardStats,
    DashboardSummary,
    DeviceDetailResponse,
    DeviceResponse,
    DeviceUpdate,
    DeviceWithInterfaceCreate,
    InterfaceCreate,
    InterfaceResponse,
    IpAddressResponse,
    NetworkCreate,
    NetworkNode,
    NetworkResponse,
    RecentDevice,
    ServiceSummary,
    VlanCreate,
    VlanResponse,
)


async def create_vlan(session: AsyncSession, payload: VlanCreate) -> Vlan:
    vlan = Vlan(**payload.model_dump())
    session.add(vlan)
    await session.flush()
    return vlan


async def create_network(session: AsyncSession, payload: NetworkCreate) -> Network:
    network = Network(**payload.model_dump())
    session.add(network)
    await session.flush()
    return network


async def create_device(session: AsyncSession, payload: DeviceWithInterfaceCreate) -> Device:
    data = payload.model_dump(exclude={"interface"})
    device = Device(**data)
    session.add(device)
    await session.flush()

    if payload.interface:
        interface = NetworkInterface(
            device_id=device.id,
            name=payload.interface.name,
            mac_address=payload.interface.mac_address,
        )
        session.add(interface)
        await session.flush()

        if payload.interface.ip_address:
            session.add(
                IpAddress(
                    address=payload.interface.ip_address,
                    assignment_type=payload.interface.assignment_type,
                    network_id=payload.interface.network_id,
                    interface_id=interface.id,
                )
            )
            await session.flush()

    return device


async def get_device(session: AsyncSession, device_id: int) -> Device | None:
    return await session.get(Device, device_id)


async def update_device(session: AsyncSession, device: Device, payload: DeviceUpdate) -> Device:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, key, value)
    await session.flush()
    return device


async def deactivate_device(session: AsyncSession, device: Device) -> Device:
    device.status = "inactive"
    await session.flush()
    return device


async def add_device_interface(
    session: AsyncSession,
    device: Device,
    payload: InterfaceCreate,
) -> NetworkInterface:
    interface = NetworkInterface(
        device_id=device.id,
        name=payload.name,
        mac_address=payload.mac_address,
    )
    session.add(interface)
    await session.flush()

    if payload.ip_address:
        session.add(
            IpAddress(
                address=payload.ip_address,
                assignment_type=payload.assignment_type,
                network_id=payload.network_id,
                interface_id=interface.id,
            )
        )
        await session.flush()

    return interface


def device_select() -> Select[tuple[Device, str | None, str | None]]:
    return (
        select(Device, IpAddress.address, NetworkInterface.mac_address)
        .outerjoin(NetworkInterface, NetworkInterface.device_id == Device.id)
        .outerjoin(IpAddress, IpAddress.interface_id == NetworkInterface.id)
        .order_by(Device.updated_at.desc())
    )


async def list_devices(session: AsyncSession) -> list[DeviceResponse]:
    result = await session.execute(device_select())
    seen: set[int] = set()
    devices: list[DeviceResponse] = []
    for device, ip_address, mac_address in result.all():
        if device.id in seen:
            continue
        seen.add(device.id)
        devices.append(
            DeviceResponse(
                id=device.id,
                name=device.name,
                device_type=device.device_type,
                status=device.status,
                vendor=device.vendor,
                model=device.model,
                operating_system=device.operating_system,
                location=device.location,
                notes=device.notes,
                primary_ip=ip_address,
                primary_mac=mac_address,
            )
        )
    return devices


async def device_to_response(session: AsyncSession, device: Device) -> DeviceResponse:
    result = await session.execute(device_select().where(Device.id == device.id).limit(1))
    row = result.first()
    if row is None:
        return DeviceResponse(
            id=device.id,
            name=device.name,
            device_type=device.device_type,
            status=device.status,
            vendor=device.vendor,
            model=device.model,
            operating_system=device.operating_system,
            location=device.location,
            notes=device.notes,
        )

    selected_device, ip_address, mac_address = row
    return DeviceResponse(
        id=selected_device.id,
        name=selected_device.name,
        device_type=selected_device.device_type,
        status=selected_device.status,
        vendor=selected_device.vendor,
        model=selected_device.model,
        operating_system=selected_device.operating_system,
        location=selected_device.location,
        notes=selected_device.notes,
        primary_ip=ip_address,
        primary_mac=mac_address,
    )


async def device_to_detail_response(session: AsyncSession, device: Device) -> DeviceDetailResponse:
    base = await device_to_response(session, device)
    result = await session.execute(
        select(NetworkInterface, IpAddress)
        .outerjoin(IpAddress, IpAddress.interface_id == NetworkInterface.id)
        .where(NetworkInterface.device_id == device.id)
        .order_by(NetworkInterface.name, IpAddress.address)
    )

    interface_map: dict[int, InterfaceResponse] = {}
    for interface, ip_address in result.all():
        if interface.id not in interface_map:
            interface_map[interface.id] = InterfaceResponse(
                id=interface.id,
                name=interface.name,
                mac_address=interface.mac_address,
                ip_addresses=[],
            )
        if ip_address:
            interface_map[interface.id].ip_addresses.append(
                IpAddressResponse(
                    id=ip_address.id,
                    address=ip_address.address,
                    assignment_type=ip_address.assignment_type,
                    network_id=ip_address.network_id,
                )
            )

    return DeviceDetailResponse(
        **base.model_dump(),
        interfaces=list(interface_map.values()),
    )


async def list_vlans(session: AsyncSession) -> list[VlanResponse]:
    result = await session.execute(select(Vlan).order_by(Vlan.vlan_id))
    return [
        VlanResponse(
            id=vlan.id,
            vlan_id=vlan.vlan_id,
            name=vlan.name,
            description=vlan.description,
        )
        for vlan in result.scalars()
    ]


async def list_networks(session: AsyncSession) -> list[NetworkResponse]:
    result = await session.execute(select(Network, Vlan).outerjoin(Vlan).order_by(Network.cidr))
    responses: list[NetworkResponse] = []
    for network, vlan in result.all():
        ip_count = await session.scalar(
            select(func.count(IpAddress.id)).where(IpAddress.network_id == network.id)
        )
        responses.append(
            NetworkResponse(
                id=network.id,
                cidr=network.cidr,
                name=network.name,
                gateway=network.gateway,
                location=network.location,
                status=network.status,
                vlan_id=network.vlan_id,
                vlan=VlanResponse(
                    id=vlan.id,
                    vlan_id=vlan.vlan_id,
                    name=vlan.name,
                    description=vlan.description,
                )
                if vlan
                else None,
                ip_count=ip_count or 0,
            )
        )
    return responses


async def network_to_response(session: AsyncSession, network: Network) -> NetworkResponse:
    vlan = await session.get(Vlan, network.vlan_id) if network.vlan_id else None
    ip_count = await session.scalar(
        select(func.count(IpAddress.id)).where(IpAddress.network_id == network.id)
    )
    return NetworkResponse(
        id=network.id,
        cidr=network.cidr,
        name=network.name,
        gateway=network.gateway,
        location=network.location,
        status=network.status,
        vlan_id=network.vlan_id,
        vlan=VlanResponse(
            id=vlan.id,
            vlan_id=vlan.vlan_id,
            name=vlan.name,
            description=vlan.description,
        )
        if vlan
        else None,
        ip_count=ip_count or 0,
    )


async def dashboard_summary(session: AsyncSession) -> DashboardSummary:
    stats = DashboardStats(
        devices=await count_rows(session, Device),
        ip_addresses=await count_rows(session, IpAddress),
        networks=await count_rows(session, Network),
        vlans=await count_rows(session, Vlan),
        services=await count_rows(session, Service),
        notes=await session.scalar(
            select(func.count(Device.id)).where(Device.notes.is_not(None))
        )
        or 0,
    )

    device_rows = await session.execute(device_select().limit(5))
    recent_devices: list[RecentDevice] = []
    seen: set[int] = set()
    for device, ip_address, mac_address in device_rows.all():
        if device.id in seen:
            continue
        seen.add(device.id)
        recent_devices.append(
            RecentDevice(
                id=device.id,
                name=device.name,
                device_type=device.device_type,
                primary_ip=ip_address,
                primary_mac=mac_address,
                status=device.status,
                last_change=device.updated_at.strftime("%Y-%m-%d %H:%M"),
            )
        )

    service_rows = await session.execute(
        select(Service.name, func.count(Service.device_id), func.max(Service.status))
        .group_by(Service.name)
        .order_by(Service.name)
    )
    services = [
        ServiceSummary(name=name, device_count=count, status=status or "active")
        for name, count, status in service_rows.all()
    ]

    network_rows = await session.execute(select(Network).order_by(Network.cidr).limit(3))
    networks: list[NetworkNode] = []
    for network in network_rows.scalars():
        device_count = await session.scalar(
            select(func.count(func.distinct(NetworkInterface.device_id)))
            .join(IpAddress, IpAddress.interface_id == NetworkInterface.id)
            .where(IpAddress.network_id == network.id)
        )
        networks.append(NetworkNode(cidr=network.cidr, device_count=device_count or 0))

    return DashboardSummary(
        stats=stats,
        recent_devices=recent_devices,
        services=services,
        networks=networks,
    )


async def count_rows(session: AsyncSession, model: type) -> int:
    return await session.scalar(select(func.count(model.id))) or 0
