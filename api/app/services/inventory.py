import ipaddress
from collections import defaultdict
from collections.abc import Callable
from typing import Literal

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
    InterfaceRecordResponse,
    InterfaceResponse,
    InventoryQualityCounts,
    InventoryQualityIssue,
    InventoryQualityReport,
    InventoryRelationshipSummary,
    IpAddressCreate,
    IpAddressRecordResponse,
    IpAddressResponse,
    IpAddressUpdate,
    NetworkCreate,
    NetworkNode,
    NetworkResponse,
    NetworkUpdate,
    RecentDevice,
    ServiceCreate,
    ServiceRecordResponse,
    ServiceSummary,
    ServiceUpdate,
    VlanCreate,
    VlanResponse,
    VlanSummaryResponse,
    VlanUpdate,
)

QUALITY_ISSUE_LIMIT = 250
QUALITY_SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}


async def create_vlan(session: AsyncSession, payload: VlanCreate) -> Vlan:
    vlan = Vlan(**payload.model_dump())
    session.add(vlan)
    await session.flush()
    return vlan


async def get_vlan(session: AsyncSession, vlan_id: int) -> Vlan | None:
    return await session.get(Vlan, vlan_id)


async def update_vlan(session: AsyncSession, vlan: Vlan, payload: VlanUpdate) -> Vlan:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(vlan, key, value)
    await session.flush()
    return vlan


async def delete_vlan(session: AsyncSession, vlan: Vlan) -> None:
    networks = await session.execute(select(Network).where(Network.vlan_id == vlan.id))
    for network in networks.scalars():
        network.vlan_id = None
    await session.delete(vlan)
    await session.flush()


async def create_network(session: AsyncSession, payload: NetworkCreate) -> Network:
    network = Network(**payload.model_dump())
    session.add(network)
    await session.flush()
    return network


async def get_network(session: AsyncSession, network_id: int) -> Network | None:
    return await session.get(Network, network_id)


async def update_network(
    session: AsyncSession,
    network: Network,
    payload: NetworkUpdate,
) -> Network:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(network, key, value)
    await session.flush()
    return network


async def delete_network(session: AsyncSession, network: Network) -> None:
    ip_addresses = await session.execute(
        select(IpAddress).where(IpAddress.network_id == network.id)
    )
    for ip_address in ip_addresses.scalars():
        ip_address.network_id = None
    await session.delete(network)
    await session.flush()


async def inventory_quality_report(session: AsyncSession) -> InventoryQualityReport:
    devices = list((await session.scalars(select(Device).order_by(Device.name))).all())
    interfaces = list(
        (await session.scalars(select(NetworkInterface).order_by(NetworkInterface.id))).all()
    )
    ip_addresses = list(
        (await session.scalars(select(IpAddress).order_by(IpAddress.address))).all()
    )
    networks = list((await session.scalars(select(Network).order_by(Network.cidr))).all())
    vlans = list((await session.scalars(select(Vlan).order_by(Vlan.vlan_id))).all())

    interfaces_by_device: dict[int, list[NetworkInterface]] = defaultdict(list)
    ips_by_interface: dict[int, list[IpAddress]] = defaultdict(list)
    for interface in interfaces:
        interfaces_by_device[interface.device_id].append(interface)
    for ip_address in ip_addresses:
        if ip_address.interface_id is not None:
            ips_by_interface[ip_address.interface_id].append(ip_address)

    issues: list[InventoryQualityIssue] = []
    checks_completed = 0
    checks_passed = 0

    def check(passed: bool) -> None:
        nonlocal checks_completed, checks_passed
        checks_completed += 1
        checks_passed += int(passed)

    def add_issue(
        code: str,
        severity: Literal["critical", "warning", "info"],
        resource_type: Literal["device", "ip_address", "network", "vlan"],
        resource_id: int,
        resource_name: str,
        **context: str | int,
    ) -> None:
        issues.append(
            InventoryQualityIssue(
                code=code,
                severity=severity,
                resource_type=resource_type,
                resource_id=resource_id,
                resource_name=resource_name,
                context=context,
            )
        )

    for device in devices:
        device_interfaces = interfaces_by_device[device.id]
        has_interface = bool(device_interfaces)
        check(has_interface)
        if not has_interface:
            add_issue("device_no_interface", "warning", "device", device.id, device.name)

        has_ip = any(ips_by_interface[interface.id] for interface in device_interfaces)
        check(has_ip)
        if not has_ip:
            add_issue("device_no_ip", "warning", "device", device.id, device.name)

        missing_fields = [
            field
            for field, value in (
                ("vendor", device.vendor),
                ("model", device.model),
                ("location", device.location),
            )
            if not value
        ]
        has_core_documentation = not missing_fields
        check(has_core_documentation)
        if not has_core_documentation:
            add_issue(
                "device_missing_documentation",
                "info",
                "device",
                device.id,
                device.name,
                fields=", ".join(missing_fields),
            )

    device_by_id = {device.id: device for device in devices}
    for interface in interfaces:
        has_mac = bool(interface.mac_address)
        check(has_mac)
        if not has_mac:
            device = device_by_id[interface.device_id]
            add_issue(
                "interface_no_mac",
                "info",
                "device",
                device.id,
                device.name,
                interface=interface.name,
            )

    network_by_id = {network.id: network for network in networks}
    interface_by_id = {interface.id: interface for interface in interfaces}
    for ip_address in ip_addresses:
        has_network = ip_address.network_id in network_by_id
        check(has_network)
        if not has_network:
            add_issue(
                "ip_no_network",
                "warning",
                "ip_address",
                ip_address.id,
                ip_address.address,
            )
        else:
            network = network_by_id[ip_address.network_id]
            belongs_to_network = ipaddress.ip_address(ip_address.address) in ipaddress.ip_network(
                network.cidr,
                strict=False,
            )
            check(belongs_to_network)
            if not belongs_to_network:
                add_issue(
                    "ip_outside_network",
                    "critical",
                    "ip_address",
                    ip_address.id,
                    ip_address.address,
                    network=network.cidr,
                )

        if ip_address.assignment_type != "reserved":
            has_device = ip_address.interface_id in interface_by_id
            check(has_device)
            if not has_device:
                add_issue(
                    "ip_no_device",
                    "warning",
                    "ip_address",
                    ip_address.id,
                    ip_address.address,
                )

    for network in networks:
        has_gateway = bool(network.gateway)
        check(has_gateway)
        if not has_gateway:
            add_issue("network_no_gateway", "info", "network", network.id, network.cidr)

    parsed_networks = {
        network.id: ipaddress.ip_network(network.cidr, strict=False) for network in networks
    }
    overlapping_network_ids: set[int] = set()
    for index, network in enumerate(networks):
        parsed = parsed_networks[network.id]
        for other_network in networks[index + 1 :]:
            other_parsed = parsed_networks[other_network.id]
            if parsed.version == other_parsed.version and parsed.overlaps(other_parsed):
                overlapping_network_ids.update((network.id, other_network.id))
                add_issue(
                    "network_overlap",
                    "critical",
                    "network",
                    network.id,
                    network.cidr,
                    other=other_network.cidr,
                )
    for network in networks:
        check(network.id not in overlapping_network_ids)

    networks_by_vlan: dict[int, list[Network]] = defaultdict(list)
    for network in networks:
        if network.vlan_id is not None:
            networks_by_vlan[network.vlan_id].append(network)
    for vlan in vlans:
        in_use = bool(networks_by_vlan[vlan.id])
        check(in_use)
        if not in_use:
            add_issue("vlan_no_network", "info", "vlan", vlan.id, f"VLAN {vlan.vlan_id}")

    _append_duplicate_device_identifier_issues(devices, "serial_number", issues, check)
    _append_duplicate_device_identifier_issues(devices, "asset_tag", issues, check)
    _append_duplicate_device_identifier_issues(devices, "name", issues, check)

    counts = InventoryQualityCounts(
        critical=sum(issue.severity == "critical" for issue in issues),
        warning=sum(issue.severity == "warning" for issue in issues),
        info=sum(issue.severity == "info" for issue in issues),
    )
    records_reviewed = (
        len(devices) + len(interfaces) + len(ip_addresses) + len(networks) + len(vlans)
    )
    score = round((checks_passed / checks_completed) * 100) if checks_completed else 0
    if records_reviewed == 0:
        quality_status = "empty"
    elif counts.critical:
        quality_status = "critical"
    elif score >= 90:
        quality_status = "excellent"
    elif score >= 75:
        quality_status = "good"
    elif score >= 50:
        quality_status = "attention"
    else:
        quality_status = "critical"

    sorted_issues = sorted(
        issues,
        key=lambda issue: (
            QUALITY_SEVERITY_ORDER[issue.severity],
            issue.code,
            issue.resource_name.casefold(),
        ),
    )
    devices_with_ip = {
        interface.device_id
        for interface in interfaces
        if ips_by_interface[interface.id]
    }
    unassigned_ips = sum(
        ip_address.network_id is None
        or (
            ip_address.assignment_type != "reserved"
            and ip_address.interface_id not in interface_by_id
        )
        for ip_address in ip_addresses
    )

    valid_vlan_ids = {vlan.id for vlan in vlans}
    return InventoryQualityReport(
        score=score,
        status=quality_status,
        records_reviewed=records_reviewed,
        checks_completed=checks_completed,
        checks_passed=checks_passed,
        issue_counts=counts,
        issues_total=len(sorted_issues),
        issues_truncated=len(sorted_issues) > QUALITY_ISSUE_LIMIT,
        issues=sorted_issues[:QUALITY_ISSUE_LIMIT],
        relationships=InventoryRelationshipSummary(
            device_ip_links=len(devices_with_ip),
            ip_network_links=sum(
                ip_address.network_id in network_by_id for ip_address in ip_addresses
            ),
            network_vlan_links=sum(network.vlan_id in valid_vlan_ids for network in networks),
            disconnected_devices=len(devices) - len(devices_with_ip),
            unassigned_ips=unassigned_ips,
        ),
    )


def _append_duplicate_device_identifier_issues(
    devices: list[Device],
    field: str,
    issues: list[InventoryQualityIssue],
    check: Callable[[bool], None],
) -> None:
    grouped: dict[str, list[Device]] = defaultdict(list)
    for device in devices:
        value = getattr(device, field)
        if value and value.strip():
            grouped[value.strip().casefold()].append(device)

    for matches in grouped.values():
        is_unique = len(matches) == 1
        check(is_unique)
        if is_unique:
            continue
        first = matches[0]
        issues.append(
            InventoryQualityIssue(
                code=f"duplicate_{field}",
                severity="warning",
                resource_type="device",
                resource_id=first.id,
                resource_name=first.name,
                context={
                    "identifier": str(getattr(first, field)),
                    "count": len(matches),
                },
            )
        )


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


async def delete_device(session: AsyncSession, device: Device) -> None:
    interfaces = await session.execute(
        select(NetworkInterface).where(NetworkInterface.device_id == device.id)
    )
    for interface in interfaces.scalars():
        ip_addresses = await session.execute(
            select(IpAddress).where(IpAddress.interface_id == interface.id)
        )
        for ip_address in ip_addresses.scalars():
            ip_address.interface_id = None
        await session.delete(interface)

    services = await session.execute(select(Service).where(Service.device_id == device.id))
    for service in services.scalars():
        await session.delete(service)

    await session.delete(device)
    await session.flush()


async def list_services(session: AsyncSession) -> list[ServiceRecordResponse]:
    result = await session.execute(
        select(Service, Device, IpAddress.address)
        .join(Device, Service.device_id == Device.id)
        .outerjoin(NetworkInterface, NetworkInterface.device_id == Device.id)
        .outerjoin(IpAddress, IpAddress.interface_id == NetworkInterface.id)
        .order_by(Service.name, Device.name)
    )
    seen: set[int] = set()
    responses: list[ServiceRecordResponse] = []
    for service, device, primary_ip in result.all():
        if service.id in seen:
            continue
        seen.add(service.id)
        responses.append(service_to_record(service, device, primary_ip))
    return responses


async def get_service(session: AsyncSession, service_id: int) -> Service | None:
    return await session.get(Service, service_id)


async def create_service(session: AsyncSession, payload: ServiceCreate) -> Service:
    service = Service(**payload.model_dump())
    session.add(service)
    await session.flush()
    return service


async def update_service(
    session: AsyncSession,
    service: Service,
    payload: ServiceUpdate,
) -> Service:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(service, key, value)
    await session.flush()
    return service


async def delete_service(session: AsyncSession, service: Service) -> None:
    await session.delete(service)
    await session.flush()


async def service_to_response(
    session: AsyncSession,
    service: Service,
) -> ServiceRecordResponse:
    result = await session.execute(
        select(Service, Device, IpAddress.address)
        .join(Device, Service.device_id == Device.id)
        .outerjoin(NetworkInterface, NetworkInterface.device_id == Device.id)
        .outerjoin(IpAddress, IpAddress.interface_id == NetworkInterface.id)
        .where(Service.id == service.id)
        .limit(1)
    )
    row = result.one()
    return service_to_record(*row)


def service_to_record(
    service: Service,
    device: Device,
    primary_ip: str | None,
) -> ServiceRecordResponse:
    return ServiceRecordResponse(
        id=service.id,
        device_id=device.id,
        device_name=device.name,
        device_type=device.device_type,
        name=service.name,
        port=service.port,
        protocol=service.protocol,
        status=service.status,
        primary_ip=primary_ip,
    )


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


async def list_ip_addresses(session: AsyncSession) -> list[IpAddressRecordResponse]:
    result = await session.execute(
        select(IpAddress, NetworkInterface, Device, Network, Vlan)
        .outerjoin(NetworkInterface, IpAddress.interface_id == NetworkInterface.id)
        .outerjoin(Device, NetworkInterface.device_id == Device.id)
        .outerjoin(Network, IpAddress.network_id == Network.id)
        .outerjoin(Vlan, Network.vlan_id == Vlan.id)
        .order_by(IpAddress.address)
    )
    return [
        ip_address_to_record(ip_address, interface, device, network, vlan)
        for ip_address, interface, device, network, vlan in result.all()
    ]


async def list_interfaces(session: AsyncSession) -> list[InterfaceRecordResponse]:
    result = await session.execute(
        select(NetworkInterface, Device)
        .join(Device, NetworkInterface.device_id == Device.id)
        .order_by(Device.name, NetworkInterface.name)
    )
    return [
        InterfaceRecordResponse(
            id=interface.id,
            name=interface.name,
            mac_address=interface.mac_address,
            device_id=device.id,
            device_name=device.name,
        )
        for interface, device in result.all()
    ]


async def get_ip_address(session: AsyncSession, ip_address_id: int) -> IpAddress | None:
    return await session.get(IpAddress, ip_address_id)


async def create_ip_address(session: AsyncSession, payload: IpAddressCreate) -> IpAddress:
    ip_address = IpAddress(**payload.model_dump())
    session.add(ip_address)
    await session.flush()
    return ip_address


async def update_ip_address(
    session: AsyncSession,
    ip_address: IpAddress,
    payload: IpAddressUpdate,
) -> IpAddress:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(ip_address, key, value)
    await session.flush()
    return ip_address


async def delete_ip_address(session: AsyncSession, ip_address: IpAddress) -> None:
    await session.delete(ip_address)
    await session.flush()


async def ip_addresses_outside_network(
    session: AsyncSession,
    network_id: int,
    cidr: str,
) -> list[str]:
    addresses = await session.scalars(
        select(IpAddress.address).where(IpAddress.network_id == network_id)
    )
    network = ipaddress.ip_network(cidr, strict=False)
    return [
        address for address in addresses if ipaddress.ip_address(address) not in network
    ]


async def ip_belongs_to_network(session: AsyncSession, address: str, network_id: int) -> bool:
    network = await session.get(Network, network_id)
    if network is None:
        return False
    return ipaddress.ip_address(address) in ipaddress.ip_network(network.cidr, strict=False)


async def ip_address_to_response(
    session: AsyncSession,
    ip_address: IpAddress,
) -> IpAddressRecordResponse:
    result = await session.execute(
        select(IpAddress, NetworkInterface, Device, Network, Vlan)
        .outerjoin(NetworkInterface, IpAddress.interface_id == NetworkInterface.id)
        .outerjoin(Device, NetworkInterface.device_id == Device.id)
        .outerjoin(Network, IpAddress.network_id == Network.id)
        .outerjoin(Vlan, Network.vlan_id == Vlan.id)
        .where(IpAddress.id == ip_address.id)
    )
    row = result.one()
    return ip_address_to_record(*row)


def ip_address_to_record(
    ip_address: IpAddress,
    interface: NetworkInterface | None,
    device: Device | None,
    network: Network | None,
    vlan: Vlan | None,
) -> IpAddressRecordResponse:
    return IpAddressRecordResponse(
        id=ip_address.id,
        address=ip_address.address,
        assignment_type=ip_address.assignment_type,
        network_id=ip_address.network_id,
        interface_id=ip_address.interface_id,
        interface_name=interface.name if interface else None,
        mac_address=interface.mac_address if interface else None,
        device_id=device.id if device else None,
        device_name=device.name if device else None,
        network_cidr=network.cidr if network else None,
        vlan_id=vlan.vlan_id if vlan else None,
        vlan_name=vlan.name if vlan else None,
        state=ip_address_state(ip_address, interface),
    )


def ip_address_state(ip_address: IpAddress, interface: NetworkInterface | None) -> str:
    if ip_address.assignment_type == "reserved":
        return "reserved"
    if interface is None:
        return "unassigned"
    return "active"


def device_select() -> Select[tuple[Device, str | None, str | None]]:
    return (
        select(Device, IpAddress.address, NetworkInterface.mac_address)
        .outerjoin(NetworkInterface, NetworkInterface.device_id == Device.id)
        .outerjoin(IpAddress, IpAddress.interface_id == NetworkInterface.id)
        .order_by(
            Device.updated_at.desc(),
            Device.id.desc(),
            NetworkInterface.id.asc(),
            IpAddress.id.asc(),
        )
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
                **device_response_payload(device),
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
            **device_response_payload(device),
        )

    selected_device, ip_address, mac_address = row
    return DeviceResponse(
        **device_response_payload(selected_device),
        primary_ip=ip_address,
        primary_mac=mac_address,
    )


def device_response_payload(device: Device) -> dict[str, object]:
    return {
        "id": device.id,
        "name": device.name,
        "device_type": device.device_type,
        "status": device.status,
        "vendor": device.vendor,
        "model": device.model,
        "serial_number": device.serial_number,
        "asset_tag": device.asset_tag,
        "operating_system": device.operating_system,
        "firmware_version": device.firmware_version,
        "cpu": device.cpu,
        "memory": device.memory,
        "storage": device.storage,
        "warranty_expires": device.warranty_expires,
        "owner": device.owner,
        "rack_position": device.rack_position,
        "location": device.location,
        "notes": device.notes,
    }


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


async def list_vlans(session: AsyncSession) -> list[VlanSummaryResponse]:
    result = await session.execute(select(Vlan).order_by(Vlan.vlan_id))
    return [await vlan_to_summary_response(session, vlan) for vlan in result.scalars()]


async def vlan_to_summary_response(session: AsyncSession, vlan: Vlan) -> VlanSummaryResponse:
    network_rows = await session.execute(select(Network).where(Network.vlan_id == vlan.id))
    networks = list(network_rows.scalars())
    ip_count = 0
    usable_hosts = 0
    for network in networks:
        ip_count += await session.scalar(
            select(func.count(IpAddress.id)).where(IpAddress.network_id == network.id)
        ) or 0
        usable_hosts += network_usable_hosts(network.cidr)

    utilization_percent = round((ip_count / usable_hosts) * 100, 1) if usable_hosts else 0
    return VlanSummaryResponse(
        id=vlan.id,
        vlan_id=vlan.vlan_id,
        name=vlan.name,
        description=vlan.description,
        network_count=len(networks),
        ip_count=ip_count,
        usable_hosts=usable_hosts,
        utilization_percent=utilization_percent,
    )


async def list_networks(session: AsyncSession) -> list[NetworkResponse]:
    result = await session.execute(select(Network, Vlan).outerjoin(Vlan).order_by(Network.cidr))
    responses: list[NetworkResponse] = []
    for network, vlan in result.all():
        ip_count = await session.scalar(
            select(func.count(IpAddress.id)).where(IpAddress.network_id == network.id)
        )
        responses.append(network_response(network, vlan, ip_count or 0))
    return responses


async def network_to_response(session: AsyncSession, network: Network) -> NetworkResponse:
    vlan = await session.get(Vlan, network.vlan_id) if network.vlan_id else None
    ip_count = await session.scalar(
        select(func.count(IpAddress.id)).where(IpAddress.network_id == network.id)
    )
    return network_response(network, vlan, ip_count or 0)


def network_response(network: Network, vlan: Vlan | None, ip_count: int) -> NetworkResponse:
    usable_hosts = network_usable_hosts(network.cidr)
    utilization_percent = round((ip_count / usable_hosts) * 100, 1) if usable_hosts else 0
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
        ip_count=ip_count,
        usable_hosts=usable_hosts,
        utilization_percent=utilization_percent,
    )


def network_usable_hosts(cidr: str) -> int:
    network = ipaddress.ip_network(cidr, strict=False)
    if network.version == 4 and network.prefixlen <= 30:
        return max(network.num_addresses - 2, 0)
    return network.num_addresses


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

    network_rows = await session.execute(
        select(Network, Vlan).outerjoin(Vlan).order_by(Network.cidr).limit(4)
    )
    networks: list[NetworkNode] = []
    for network, vlan in network_rows.all():
        device_count = await session.scalar(
            select(func.count(func.distinct(NetworkInterface.device_id)))
            .join(IpAddress, IpAddress.interface_id == NetworkInterface.id)
            .where(IpAddress.network_id == network.id)
        )
        ip_count = await session.scalar(
            select(func.count(IpAddress.id)).where(IpAddress.network_id == network.id)
        )
        usable_hosts = network_usable_hosts(network.cidr)
        utilization_percent = (
            round(((ip_count or 0) / usable_hosts) * 100, 1) if usable_hosts else 0
        )
        networks.append(
            NetworkNode(
                cidr=network.cidr,
                name=network.name,
                device_count=device_count or 0,
                ip_count=ip_count or 0,
                usable_hosts=usable_hosts,
                utilization_percent=utilization_percent,
                vlan=VlanResponse(
                    id=vlan.id,
                    vlan_id=vlan.vlan_id,
                    name=vlan.name,
                    description=vlan.description,
                )
                if vlan
                else None,
            )
        )

    return DashboardSummary(
        stats=stats,
        recent_devices=recent_devices,
        services=services,
        networks=networks,
    )


async def count_rows(session: AsyncSession, model: type) -> int:
    return await session.scalar(select(func.count(model.id))) or 0
