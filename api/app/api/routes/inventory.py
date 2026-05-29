import ipaddress

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, SessionDep, require_csrf, require_permission
from app.models.inventory import Network, NetworkInterface, Vlan
from app.schemas.inventory import (
    DashboardSummary,
    DeviceDetailResponse,
    DeviceResponse,
    DeviceUpdate,
    DeviceWithInterfaceCreate,
    InterfaceCreate,
    InterfaceRecordResponse,
    InterfaceResponse,
    IpAddressCreate,
    IpAddressRecordResponse,
    IpAddressUpdate,
    NetworkCreate,
    NetworkResponse,
    NetworkUpdate,
    VlanCreate,
    VlanResponse,
)
from app.services.audit import write_audit_event
from app.services.inventory import (
    add_device_interface,
    create_device,
    create_ip_address,
    create_network,
    create_vlan,
    dashboard_summary,
    deactivate_device,
    delete_ip_address,
    device_to_detail_response,
    device_to_response,
    get_device,
    get_ip_address,
    get_network,
    ip_address_to_response,
    ip_belongs_to_network,
    list_devices,
    list_interfaces,
    list_ip_addresses,
    list_networks,
    list_vlans,
    network_to_response,
    update_device,
    update_ip_address,
    update_network,
)

router = APIRouter(prefix="/inventory")


@router.get("/dashboard", response_model=DashboardSummary)
async def dashboard(
    session: SessionDep,
    _: CurrentUser,
) -> DashboardSummary:
    return await dashboard_summary(session)


@router.get("/devices", response_model=list[DeviceResponse])
async def devices(session: SessionDep, _: CurrentUser) -> list[DeviceResponse]:
    return await list_devices(session)


@router.post(
    "/devices",
    response_model=DeviceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def create_device_endpoint(
    payload: DeviceWithInterfaceCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> DeviceResponse:
    try:
        device = await create_device(session, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Device name, MAC address, or IP address already exists.",
        ) from exc
    await write_audit_event(
        session,
        "inventory.device_created",
        f"Device created: {device.name}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await device_to_response(session, device)


@router.get("/devices/{device_id}", response_model=DeviceDetailResponse)
async def device_detail(
    device_id: int,
    session: SessionDep,
    _: CurrentUser,
) -> DeviceDetailResponse:
    device = await get_device(session, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    return await device_to_detail_response(session, device)


@router.patch(
    "/devices/{device_id}",
    response_model=DeviceDetailResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def update_device_endpoint(
    device_id: int,
    payload: DeviceUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> DeviceDetailResponse:
    device = await get_device(session, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    try:
        device = await update_device(session, device, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Device name already exists.",
        ) from exc

    await write_audit_event(
        session,
        "inventory.device_updated",
        f"Device updated: {device.name}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await device_to_detail_response(session, device)


@router.post(
    "/devices/{device_id}/interfaces",
    response_model=InterfaceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def add_device_interface_endpoint(
    device_id: int,
    payload: InterfaceCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> InterfaceResponse:
    device = await get_device(session, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    try:
        interface = await add_device_interface(session, device, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Interface name, MAC address, or IP address already exists.",
        ) from exc

    await write_audit_event(
        session,
        "inventory.interface_created",
        f"Interface created: {device.name}/{interface.name}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    detail = await device_to_detail_response(session, device)
    return next(item for item in detail.interfaces if item.id == interface.id)


@router.get("/ip-addresses", response_model=list[IpAddressRecordResponse])
async def ip_addresses(session: SessionDep, _: CurrentUser) -> list[IpAddressRecordResponse]:
    return await list_ip_addresses(session)


@router.get("/interfaces", response_model=list[InterfaceRecordResponse])
async def interfaces(session: SessionDep, _: CurrentUser) -> list[InterfaceRecordResponse]:
    return await list_interfaces(session)


@router.post(
    "/ip-addresses",
    response_model=IpAddressRecordResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def create_ip_address_endpoint(
    payload: IpAddressCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> IpAddressRecordResponse:
    if payload.network_id and await session.get(Network, payload.network_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network not found.")
    if payload.interface_id and await session.get(NetworkInterface, payload.interface_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interface not found.")
    if payload.network_id and not await ip_belongs_to_network(
        session,
        payload.address,
        payload.network_id,
    ):
        raise HTTPException(
            status_code=422,
            detail="IP address does not belong to the selected network.",
        )

    try:
        ip_address = await create_ip_address(session, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="IP address already exists.",
        ) from exc

    await write_audit_event(
        session,
        "inventory.ip_created",
        f"IP address created: {ip_address.address}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await ip_address_to_response(session, ip_address)


@router.patch(
    "/ip-addresses/{ip_address_id}",
    response_model=IpAddressRecordResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def update_ip_address_endpoint(
    ip_address_id: int,
    payload: IpAddressUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> IpAddressRecordResponse:
    ip_address = await get_ip_address(session, ip_address_id)
    if ip_address is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found.")
    if payload.network_id and await session.get(Network, payload.network_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network not found.")
    if payload.interface_id and await session.get(NetworkInterface, payload.interface_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interface not found.")
    next_address = payload.address if payload.address is not None else ip_address.address
    next_network_id = (
        payload.network_id if payload.network_id is not None else ip_address.network_id
    )
    if next_network_id and not await ip_belongs_to_network(session, next_address, next_network_id):
        raise HTTPException(
            status_code=422,
            detail="IP address does not belong to the selected network.",
        )

    try:
        ip_address = await update_ip_address(session, ip_address, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="IP address already exists.",
        ) from exc

    await write_audit_event(
        session,
        "inventory.ip_updated",
        f"IP address updated: {ip_address.address}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await ip_address_to_response(session, ip_address)


@router.delete(
    "/ip-addresses/{ip_address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def delete_ip_address_endpoint(
    ip_address_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    ip_address = await get_ip_address(session, ip_address_id)
    if ip_address is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found.")

    address = ip_address.address
    await delete_ip_address(session, ip_address)
    await write_audit_event(
        session,
        "inventory.ip_deleted",
        f"IP address deleted: {address}",
        actor_user_id=current_user.id,
    )
    await session.commit()


@router.post(
    "/devices/{device_id}/deactivate",
    response_model=DeviceDetailResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def deactivate_device_endpoint(
    device_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> DeviceDetailResponse:
    device = await get_device(session, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    device = await deactivate_device(session, device)
    await write_audit_event(
        session,
        "inventory.device_deactivated",
        f"Device deactivated: {device.name}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await device_to_detail_response(session, device)


@router.get("/networks", response_model=list[NetworkResponse])
async def networks(session: SessionDep, _: CurrentUser) -> list[NetworkResponse]:
    return await list_networks(session)


@router.post(
    "/networks",
    response_model=NetworkResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def create_network_endpoint(
    payload: NetworkCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> NetworkResponse:
    if payload.vlan_id and await session.get(Vlan, payload.vlan_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")
    try:
        network = await create_network(session, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Network CIDR already exists.",
        ) from exc
    await write_audit_event(
        session,
        "inventory.network_created",
        f"Network created: {network.cidr}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await network_to_response(session, network)


@router.patch(
    "/networks/{network_id}",
    response_model=NetworkResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def update_network_endpoint(
    network_id: int,
    payload: NetworkUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> NetworkResponse:
    network = await get_network(session, network_id)
    if network is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network not found.")
    if payload.vlan_id and await session.get(Vlan, payload.vlan_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")
    next_cidr = payload.cidr if payload.cidr is not None else network.cidr
    next_gateway = payload.gateway if payload.gateway is not None else network.gateway
    if next_gateway and ipaddress.ip_address(next_gateway) not in ipaddress.ip_network(
        next_cidr,
        strict=False,
    ):
        raise HTTPException(
            status_code=422,
            detail="Gateway must belong to the network CIDR.",
        )

    try:
        network = await update_network(session, network, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Network CIDR already exists.",
        ) from exc

    await write_audit_event(
        session,
        "inventory.network_updated",
        f"Network updated: {network.cidr}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await network_to_response(session, network)


@router.get("/vlans", response_model=list[VlanResponse])
async def vlans(session: SessionDep, _: CurrentUser) -> list[VlanResponse]:
    return await list_vlans(session)


@router.post(
    "/vlans",
    response_model=VlanResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("inventory:write"))],
)
async def create_vlan_endpoint(
    payload: VlanCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> VlanResponse:
    vlan = await create_vlan(session, payload)
    await write_audit_event(
        session,
        "inventory.vlan_created",
        f"VLAN created: {vlan.vlan_id}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return VlanResponse(
        id=vlan.id,
        vlan_id=vlan.vlan_id,
        name=vlan.name,
        description=vlan.description,
    )
