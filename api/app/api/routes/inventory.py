from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, SessionDep, require_csrf, require_permission
from app.schemas.inventory import (
    DashboardSummary,
    DeviceResponse,
    DeviceWithInterfaceCreate,
    NetworkCreate,
    NetworkResponse,
    VlanCreate,
    VlanResponse,
)
from app.services.audit import write_audit_event
from app.services.inventory import (
    create_device,
    create_network,
    create_vlan,
    dashboard_summary,
    device_to_response,
    list_devices,
    list_networks,
    list_vlans,
    network_to_response,
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
    device = await create_device(session, payload)
    await write_audit_event(
        session,
        "inventory.device_created",
        f"Device created: {device.name}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await device_to_response(session, device)


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
