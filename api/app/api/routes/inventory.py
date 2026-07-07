import csv
import ipaddress
from datetime import UTC, datetime
from io import StringIO
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import ValidationError
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, SessionDep, require_csrf, require_permission
from app.core.config import settings
from app.models.inventory import Device, IpAddress, Network, NetworkInterface, Service, Vlan
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
    ServiceCreate,
    ServiceRecordResponse,
    ServiceUpdate,
    VlanCreate,
    VlanSummaryResponse,
    VlanUpdate,
)
from app.services.audit import write_audit_event
from app.services.inventory import (
    add_device_interface,
    count_rows,
    create_device,
    create_ip_address,
    create_network,
    create_service,
    create_vlan,
    dashboard_summary,
    deactivate_device,
    delete_device,
    delete_ip_address,
    delete_network,
    delete_service,
    delete_vlan,
    device_to_detail_response,
    device_to_response,
    get_device,
    get_ip_address,
    get_network,
    get_service,
    get_vlan,
    ip_address_to_response,
    ip_belongs_to_network,
    list_devices,
    list_interfaces,
    list_ip_addresses,
    list_networks,
    list_services,
    list_vlans,
    network_to_response,
    service_to_response,
    update_device,
    update_ip_address,
    update_network,
    update_service,
    update_vlan,
    vlan_to_summary_response,
)

router = APIRouter(
    prefix="/inventory",
    dependencies=[Depends(require_permission("inventory:read"))],
)

ExportResource = Literal["devices", "ip-addresses", "networks", "vlans", "services", "interfaces"]
BACKUP_FORMAT = "ae-netscope.inventory.v1"
BACKUP_KEYS = ("vlans", "networks", "devices", "interfaces", "ip_addresses", "services")
CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


async def require_import_size_limit(content_length: int | None = Header(default=None)) -> None:
    if content_length is None:
        return
    if content_length > settings.max_import_json_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Inventory import JSON is too large.",
        )


@router.get("/dashboard", response_model=DashboardSummary)
async def dashboard(
    session: SessionDep,
    _: CurrentUser,
) -> DashboardSummary:
    return await dashboard_summary(session)


@router.get("/export.json")
async def export_inventory_json(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, object]:
    payload = await export_inventory_payload(session)
    await write_audit_event(
        session,
        "inventory.exported",
        "Inventory exported as JSON",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return payload


@router.post(
    "/import/preview",
    dependencies=[
        Depends(require_csrf),
        Depends(require_permission("settings:manage")),
        Depends(require_import_size_limit),
    ],
)
async def preview_inventory_import(
    payload: dict[str, object],
    session: SessionDep,
    _: CurrentUser,
) -> dict[str, object]:
    analysis = analyze_backup_payload(payload)
    return {
        **analysis,
        "current_counts": await current_inventory_counts(session),
        "mode": "replace",
    }


@router.get("/export/{resource}.csv")
async def export_inventory_csv(
    resource: ExportResource,
    session: SessionDep,
    current_user: CurrentUser,
) -> Response:
    rows = await export_rows_for_resource(session, resource)
    output = StringIO()
    fieldnames = sorted({key for row in rows for key in row})
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(sanitize_csv_rows(rows))
    await write_audit_event(
        session,
        "inventory.exported",
        f"Inventory exported as CSV: {resource}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    filename = f"ae-netscope-{resource}-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/import.json",
    dependencies=[
        Depends(require_csrf),
        Depends(require_permission("settings:manage")),
        Depends(require_import_size_limit),
    ],
)
async def import_inventory_json(
    payload: dict[str, object],
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, object]:
    analysis = analyze_backup_payload(payload)
    if not analysis["valid"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"message": "Invalid inventory backup.", "errors": analysis["errors"]},
        )

    try:
        previous_backup = await export_inventory_payload(session)
        counts = await restore_inventory_from_payload(session, payload)
    except (KeyError, TypeError, ValueError) as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid inventory backup: {exc}",
        ) from exc
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Backup contains duplicate inventory records.",
        ) from exc

    await write_audit_event(
        session,
        "inventory.imported",
        (
            "Inventory restored from JSON backup "
            f"({counts['devices']} devices, {counts['ip_addresses']} IPs)"
        ),
        actor_user_id=current_user.id,
    )
    await session.commit()
    return {
        "status": "imported",
        "counts": counts,
        "previous_backup": previous_backup,
        "previous_backup_filename": (
            f"ae-netscope-before-restore-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}.json"
        ),
    }


async def export_inventory_payload(session: SessionDep) -> dict[str, object]:
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "format": BACKUP_FORMAT,
        "devices": [item.model_dump(mode="json") for item in await list_devices(session)],
        "ip_addresses": [
            item.model_dump(mode="json") for item in await list_ip_addresses(session)
        ],
        "networks": [item.model_dump(mode="json") for item in await list_networks(session)],
        "vlans": [item.model_dump(mode="json") for item in await list_vlans(session)],
        "services": [item.model_dump(mode="json") for item in await list_services(session)],
        "interfaces": [item.model_dump(mode="json") for item in await list_interfaces(session)],
    }


async def current_inventory_counts(session: SessionDep) -> dict[str, int]:
    return {
        "vlans": await count_rows(session, Vlan),
        "networks": await count_rows(session, Network),
        "devices": await count_rows(session, Device),
        "interfaces": await count_rows(session, NetworkInterface),
        "ip_addresses": await count_rows(session, IpAddress),
        "services": await count_rows(session, Service),
    }


def analyze_backup_payload(payload: dict[str, object]) -> dict[str, object]:
    errors: list[str] = []
    warnings: list[str] = []
    counts = {key: 0 for key in BACKUP_KEYS}

    if payload.get("format") != BACKUP_FORMAT:
        errors.append("Unsupported inventory backup format.")

    try:
        data = {key: backup_list(payload, key) for key in BACKUP_KEYS}
    except TypeError as exc:
        errors.append(str(exc))
        return {"valid": False, "counts": counts, "warnings": warnings, "errors": errors}

    counts = {key: len(data[key]) for key in BACKUP_KEYS}
    for key in BACKUP_KEYS:
        errors.extend(validate_unique_source_ids(data[key], key))

    vlan_source_ids = source_ids(data["vlans"])
    network_source_ids = source_ids(data["networks"])
    device_source_ids = source_ids(data["devices"])
    interface_source_ids = source_ids(data["interfaces"])

    vlan_values: set[int] = set()
    network_cidrs: dict[int, str] = {}
    device_names: set[str] = set()
    interface_keys: set[tuple[int, str]] = set()
    mac_addresses: set[str] = set()
    ip_addresses: set[str] = set()
    service_keys: set[tuple[int, str, int | None, str]] = set()

    for row in data["vlans"]:
        try:
            item = VlanCreate.model_validate(row)
            if item.vlan_id in vlan_values:
                errors.append(f"Duplicate VLAN number: {item.vlan_id}.")
            vlan_values.add(item.vlan_id)
        except ValidationError as exc:
            errors.append(f"Invalid VLAN {row.get('id', '?')}: {validation_message(exc)}")

    for row in data["networks"]:
        try:
            item = NetworkCreate.model_validate(row)
            source_id = int(row["id"])
            if row.get("vlan_id") is not None and int(row["vlan_id"]) not in vlan_source_ids:
                errors.append(f"Network {source_id} references a missing VLAN.")
            if item.cidr in network_cidrs.values():
                errors.append(f"Duplicate network CIDR: {item.cidr}.")
            network_cidrs[source_id] = item.cidr
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            errors.append(f"Invalid network {row.get('id', '?')}: {validation_message(exc)}")

    for row in data["devices"]:
        try:
            item = DeviceWithInterfaceCreate.model_validate({**row, "interface": None})
            normalized_name = item.name.lower()
            if normalized_name in device_names:
                errors.append(f"Duplicate device name: {item.name}.")
            device_names.add(normalized_name)
        except ValidationError as exc:
            errors.append(f"Invalid device {row.get('id', '?')}: {validation_message(exc)}")

    for row in data["interfaces"]:
        try:
            source_id = int(row["id"])
            source_device_id = int(row["device_id"])
            if source_device_id not in device_source_ids:
                errors.append(f"Interface {source_id} references a missing device.")
            item = InterfaceCreate.model_validate(row)
            interface_key = (source_device_id, item.name.lower())
            if interface_key in interface_keys:
                errors.append(
                    f"Duplicate interface name on device {source_device_id}: {item.name}."
                )
            interface_keys.add(interface_key)
            if item.mac_address:
                if item.mac_address in mac_addresses:
                    errors.append(f"Duplicate MAC address: {item.mac_address}.")
                mac_addresses.add(item.mac_address)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            errors.append(f"Invalid interface {row.get('id', '?')}: {validation_message(exc)}")

    for row in data["ip_addresses"]:
        try:
            source_id = int(row["id"])
            item = IpAddressCreate.model_validate(row)
            if row.get("network_id") is not None:
                network_id = int(row["network_id"])
                if network_id not in network_source_ids:
                    errors.append(f"IP {source_id} references a missing network.")
                elif ipaddress.ip_address(item.address) not in ipaddress.ip_network(
                    network_cidrs[network_id],
                    strict=False,
                ):
                    errors.append(f"IP {item.address} is outside its referenced network.")
            if (
                row.get("interface_id") is not None
                and int(row["interface_id"]) not in interface_source_ids
            ):
                errors.append(f"IP {source_id} references a missing interface.")
            if item.address in ip_addresses:
                errors.append(f"Duplicate IP address: {item.address}.")
            ip_addresses.add(item.address)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            errors.append(f"Invalid IP {row.get('id', '?')}: {validation_message(exc)}")

    for row in data["services"]:
        try:
            source_device_id = int(row["device_id"])
            if source_device_id not in device_source_ids:
                errors.append(f"Service {row.get('id', '?')} references a missing device.")
            item = ServiceCreate.model_validate(row)
            service_key = (source_device_id, item.name.lower(), item.port, item.protocol.lower())
            if service_key in service_keys:
                errors.append(f"Duplicate service on device {source_device_id}: {item.name}.")
            service_keys.add(service_key)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            errors.append(f"Invalid service {row.get('id', '?')}: {validation_message(exc)}")

    if not any(counts.values()):
        warnings.append("Backup contains no inventory records.")

    return {"valid": not errors, "counts": counts, "warnings": warnings, "errors": errors}


def validate_unique_source_ids(rows: list[dict[str, object]], label: str) -> list[str]:
    errors: list[str] = []
    seen: set[int] = set()
    for row in rows:
        try:
            source_id = int(row["id"])
        except (KeyError, TypeError, ValueError):
            errors.append(f"{label} contains a record without a valid id.")
            continue
        if source_id in seen:
            errors.append(f"{label} contains duplicate source id {source_id}.")
        seen.add(source_id)
    return errors


def source_ids(rows: list[dict[str, object]]) -> set[int]:
    ids: set[int] = set()
    for row in rows:
        try:
            ids.add(int(row["id"]))
        except (KeyError, TypeError, ValueError):
            continue
    return ids


def validation_message(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        first_error = exc.errors()[0]
        location = ".".join(str(part) for part in first_error["loc"])
        return f"{location}: {first_error['msg']}"
    return str(exc)


def sanitize_csv_cell(value: object) -> object:
    if not isinstance(value, str):
        return value
    if value.startswith(CSV_FORMULA_PREFIXES):
        return f"'{value}"
    return value


def sanitize_csv_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [{key: sanitize_csv_cell(value) for key, value in row.items()} for row in rows]


async def export_rows_for_resource(
    session: SessionDep,
    resource: ExportResource,
) -> list[dict[str, object]]:
    if resource == "devices":
        return [item.model_dump(mode="json") for item in await list_devices(session)]
    if resource == "ip-addresses":
        return [item.model_dump(mode="json") for item in await list_ip_addresses(session)]
    if resource == "networks":
        return [item.model_dump(mode="json") for item in await list_networks(session)]
    if resource == "vlans":
        return [item.model_dump(mode="json") for item in await list_vlans(session)]
    if resource == "services":
        return [item.model_dump(mode="json") for item in await list_services(session)]
    return [item.model_dump(mode="json") for item in await list_interfaces(session)]


async def restore_inventory_from_payload(
    session: SessionDep,
    payload: dict[str, object],
) -> dict[str, int]:
    vlans = backup_list(payload, "vlans")
    networks = backup_list(payload, "networks")
    devices = backup_list(payload, "devices")
    interfaces = backup_list(payload, "interfaces")
    ip_addresses = backup_list(payload, "ip_addresses")
    services = backup_list(payload, "services")

    for model in (Service, IpAddress, NetworkInterface, Device, Network, Vlan):
        await session.execute(delete(model))
    await session.flush()

    vlan_map: dict[int, int] = {}
    network_map: dict[int, int] = {}
    device_map: dict[int, int] = {}
    interface_map: dict[int, int] = {}

    for item in sorted(vlans, key=lambda row: int(row["id"])):
        source_id = int(item["id"])
        vlan = await create_vlan(session, VlanCreate.model_validate(item))
        vlan_map[source_id] = vlan.id

    for item in sorted(networks, key=lambda row: int(row["id"])):
        source_id = int(item["id"])
        data = dict(item)
        if data.get("vlan_id") is not None:
            data["vlan_id"] = vlan_map[int(data["vlan_id"])]
        network = await create_network(session, NetworkCreate.model_validate(data))
        network_map[source_id] = network.id

    for item in sorted(devices, key=lambda row: int(row["id"])):
        source_id = int(item["id"])
        device = await create_device(
            session,
            DeviceWithInterfaceCreate.model_validate({**item, "interface": None}),
        )
        device_map[source_id] = device.id

    for item in sorted(interfaces, key=lambda row: int(row["id"])):
        source_id = int(item["id"])
        source_device_id = int(item["device_id"])
        interface = NetworkInterface(
            device_id=device_map[source_device_id],
            name=str(item["name"]),
            mac_address=item.get("mac_address"),
        )
        session.add(interface)
        await session.flush()
        interface_map[source_id] = interface.id

    for item in sorted(ip_addresses, key=lambda row: int(row["id"])):
        data = dict(item)
        if data.get("network_id") is not None:
            data["network_id"] = network_map[int(data["network_id"])]
        if data.get("interface_id") is not None:
            data["interface_id"] = interface_map[int(data["interface_id"])]
        await create_ip_address(session, IpAddressCreate.model_validate(data))

    for item in sorted(services, key=lambda row: int(row["id"])):
        data = dict(item)
        data["device_id"] = device_map[int(data["device_id"])]
        await create_service(session, ServiceCreate.model_validate(data))

    await session.flush()
    return {
        "vlans": len(vlans),
        "networks": len(networks),
        "devices": len(devices),
        "interfaces": len(interfaces),
        "ip_addresses": len(ip_addresses),
        "services": len(services),
    }


def backup_list(payload: dict[str, object], key: str) -> list[dict[str, object]]:
    value = payload.get(key, [])
    if not isinstance(value, list):
        raise TypeError(f"{key} must be a list")
    if not all(isinstance(item, dict) for item in value):
        raise TypeError(f"{key} must contain objects")
    return value


@router.get("/devices", response_model=list[DeviceResponse])
async def devices(session: SessionDep, _: CurrentUser) -> list[DeviceResponse]:
    return await list_devices(session)


@router.post(
    "/devices",
    response_model=DeviceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("devices:create"))],
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
    dependencies=[Depends(require_csrf), Depends(require_permission("devices:update"))],
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
    dependencies=[Depends(require_csrf), Depends(require_permission("devices:update"))],
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
    dependencies=[Depends(require_csrf), Depends(require_permission("ip_addresses:create"))],
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
    dependencies=[Depends(require_csrf), Depends(require_permission("ip_addresses:update"))],
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
    dependencies=[Depends(require_csrf), Depends(require_permission("ip_addresses:delete"))],
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
    dependencies=[Depends(require_csrf), Depends(require_permission("devices:update"))],
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


@router.delete(
    "/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf), Depends(require_permission("devices:delete"))],
)
async def delete_device_endpoint(
    device_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    device = await get_device(session, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    name = device.name
    await delete_device(session, device)
    await write_audit_event(
        session,
        "inventory.device_deleted",
        f"Device deleted: {name}",
        actor_user_id=current_user.id,
    )
    await session.commit()


@router.get("/networks", response_model=list[NetworkResponse])
async def networks(session: SessionDep, _: CurrentUser) -> list[NetworkResponse]:
    return await list_networks(session)


@router.post(
    "/networks",
    response_model=NetworkResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("networks:create"))],
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
    dependencies=[Depends(require_csrf), Depends(require_permission("networks:update"))],
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


@router.delete(
    "/networks/{network_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf), Depends(require_permission("networks:delete"))],
)
async def delete_network_endpoint(
    network_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    network = await get_network(session, network_id)
    if network is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network not found.")

    cidr = network.cidr
    await delete_network(session, network)
    await write_audit_event(
        session,
        "inventory.network_deleted",
        f"Network deleted: {cidr}",
        actor_user_id=current_user.id,
    )
    await session.commit()


@router.get("/services", response_model=list[ServiceRecordResponse])
async def services(session: SessionDep, _: CurrentUser) -> list[ServiceRecordResponse]:
    return await list_services(session)


@router.post(
    "/services",
    response_model=ServiceRecordResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("services:create"))],
)
async def create_service_endpoint(
    payload: ServiceCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> ServiceRecordResponse:
    if await get_device(session, payload.device_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    service = await create_service(session, payload)
    await write_audit_event(
        session,
        "inventory.service_created",
        f"Service created: {service.name}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await service_to_response(session, service)


@router.patch(
    "/services/{service_id}",
    response_model=ServiceRecordResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("services:update"))],
)
async def update_service_endpoint(
    service_id: int,
    payload: ServiceUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> ServiceRecordResponse:
    service = await get_service(session, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
    if payload.device_id and await get_device(session, payload.device_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    service = await update_service(session, service, payload)
    await write_audit_event(
        session,
        "inventory.service_updated",
        f"Service updated: {service.name}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await service_to_response(session, service)


@router.delete(
    "/services/{service_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf), Depends(require_permission("services:delete"))],
)
async def delete_service_endpoint(
    service_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    service = await get_service(session, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    name = service.name
    await delete_service(session, service)
    await write_audit_event(
        session,
        "inventory.service_deleted",
        f"Service deleted: {name}",
        actor_user_id=current_user.id,
    )
    await session.commit()


@router.get("/vlans", response_model=list[VlanSummaryResponse])
async def vlans(session: SessionDep, _: CurrentUser) -> list[VlanSummaryResponse]:
    return await list_vlans(session)


@router.post(
    "/vlans",
    response_model=VlanSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf), Depends(require_permission("vlans:create"))],
)
async def create_vlan_endpoint(
    payload: VlanCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> VlanSummaryResponse:
    try:
        vlan = await create_vlan(session, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="VLAN ID already exists.",
        ) from exc
    await write_audit_event(
        session,
        "inventory.vlan_created",
        f"VLAN created: {vlan.vlan_id}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await vlan_to_summary_response(session, vlan)


@router.patch(
    "/vlans/{vlan_pk}",
    response_model=VlanSummaryResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("vlans:update"))],
)
async def update_vlan_endpoint(
    vlan_pk: int,
    payload: VlanUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> VlanSummaryResponse:
    vlan = await get_vlan(session, vlan_pk)
    if vlan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")

    try:
        vlan = await update_vlan(session, vlan, payload)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="VLAN ID already exists.",
        ) from exc

    await write_audit_event(
        session,
        "inventory.vlan_updated",
        f"VLAN updated: {vlan.vlan_id}",
        actor_user_id=current_user.id,
    )
    await session.commit()
    return await vlan_to_summary_response(session, vlan)


@router.delete(
    "/vlans/{vlan_pk}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf), Depends(require_permission("vlans:delete"))],
)
async def delete_vlan_endpoint(
    vlan_pk: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    vlan = await get_vlan(session, vlan_pk)
    if vlan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")

    vlan_id = vlan.vlan_id
    await delete_vlan(session, vlan)
    await write_audit_event(
        session,
        "inventory.vlan_deleted",
        f"VLAN deleted: {vlan_id}",
        actor_user_id=current_user.id,
    )
    await session.commit()
