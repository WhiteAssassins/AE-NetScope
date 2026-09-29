from typing import Literal

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Device, IpAddress, Network, NetworkInterface, Service, Vlan
from app.services.inventory import (
    list_devices,
    list_interfaces,
    list_ip_addresses,
    list_services,
    network_to_response,
    vlan_to_summary_response,
)

SearchResource = Literal["devices", "interfaces", "ip-addresses", "networks", "vlans", "services"]


async def search_inventory(
    session: AsyncSession,
    resource: SearchResource,
    query: str,
    limit: int,
    offset: int,
) -> dict[str, object]:
    if resource == "devices":
        model = Device
        statement = (
            select(Device.id)
            .outerjoin(NetworkInterface, NetworkInterface.device_id == Device.id)
            .outerjoin(IpAddress, IpAddress.interface_id == NetworkInterface.id)
        )
        columns = [
            Device.name,
            Device.device_type,
            Device.status,
            NetworkInterface.mac_address,
            IpAddress.address,
        ]
    elif resource == "interfaces":
        model = NetworkInterface
        statement = select(NetworkInterface.id).join(Device)
        columns = [NetworkInterface.name, NetworkInterface.mac_address, Device.name]
    elif resource == "ip-addresses":
        model = IpAddress
        statement = (
            select(IpAddress.id)
            .outerjoin(NetworkInterface, IpAddress.interface_id == NetworkInterface.id)
            .outerjoin(Device, NetworkInterface.device_id == Device.id)
            .outerjoin(Network, IpAddress.network_id == Network.id)
            .outerjoin(Vlan, Network.vlan_id == Vlan.id)
        )
        columns = [
            IpAddress.address,
            IpAddress.assignment_type,
            NetworkInterface.mac_address,
            Device.name,
            Network.cidr,
            Vlan.name,
            cast(Vlan.vlan_id, String),
        ]
    elif resource == "networks":
        model = Network
        statement = select(Network.id).outerjoin(Vlan)
        columns = [
            Network.name,
            Network.cidr,
            Network.status,
            Vlan.name,
            cast(Vlan.vlan_id, String),
        ]
    elif resource == "vlans":
        model = Vlan
        statement = select(Vlan.id)
        columns = [Vlan.name, cast(Vlan.vlan_id, String)]
    else:
        model = Service
        statement = (
            select(Service.id)
            .join(Device)
            .outerjoin(NetworkInterface, NetworkInterface.device_id == Device.id)
            .outerjoin(IpAddress, IpAddress.interface_id == NetworkInterface.id)
        )
        columns = [
            Service.name,
            Service.protocol,
            Service.status,
            cast(Service.port, String),
            Device.name,
            Device.device_type,
            IpAddress.address,
        ]
    needle = query.strip()
    if needle:
        statement = statement.where(
            or_(*(column.icontains(needle, autoescape=True) for column in columns))
        )
    statement = statement.distinct()
    total = await session.scalar(select(func.count()).select_from(statement.subquery())) or 0
    ids = list(await session.scalars(statement.order_by(model.id).limit(limit).offset(offset)))
    loaders = {
        "devices": list_devices,
        "interfaces": list_interfaces,
        "ip-addresses": list_ip_addresses,
        "services": list_services,
    }
    if resource in loaders:
        rows = await loaders[resource](session, record_ids=ids)
    elif resource == "networks":
        rows = [
            await network_to_response(session, row)
            for row in await session.scalars(select(Network).where(Network.id.in_(ids)))
        ]
    else:
        rows = [
            await vlan_to_summary_response(session, row)
            for row in await session.scalars(select(Vlan).where(Vlan.id.in_(ids)))
        ]
    by_id = {row.id: row for row in rows}
    return {
        "items": [by_id[record_id].model_dump(mode="json") for record_id in ids],
        "total": total,
        "next_offset": offset + limit if offset + limit < total else None,
    }
