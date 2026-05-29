from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, SessionDep, require_csrf, require_permission
from app.schemas.inventory import (
    DashboardSummary,
    DeviceDetailResponse,
    DeviceResponse,
    DeviceUpdate,
    DeviceWithInterfaceCreate,
    InterfaceCreate,
    InterfaceResponse,
    NetworkCreate,
    NetworkResponse,
    VlanCreate,
    VlanResponse,
)
from app.services.audit import write_audit_event
from app.services.inventory import (
    add_device_interface,
    create_device,
    create_network,
    create_vlan,
    dashboard_summary,
    deactivate_device,
    device_to_detail_response,
    device_to_response,
    get_device,
    list_devices,
    list_networks,
    list_vlans,
    network_to_response,
    update_device,
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
    network = await create_network(session, payload)
    await write_audit_event(
        session,
        "inventory.network_created",
        f"Network created: {network.cidr}",
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
