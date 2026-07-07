import ipaddress
import re

from pydantic import BaseModel, Field, field_validator, model_validator

MAC_PATTERN = re.compile(r"^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$")


class VlanCreate(BaseModel):
    vlan_id: int = Field(ge=1, le=4094)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None


class VlanUpdate(BaseModel):
    vlan_id: int | None = Field(default=None, ge=1, le=4094)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None


class VlanResponse(VlanCreate):
    id: int


class VlanSummaryResponse(VlanResponse):
    network_count: int = 0
    ip_count: int = 0
    usable_hosts: int = 0
    utilization_percent: float = 0


class NetworkCreate(BaseModel):
    cidr: str
    name: str = Field(min_length=1, max_length=120)
    gateway: str | None = None
    location: str | None = Field(default=None, max_length=120)
    status: str = Field(default="active", max_length=32)
    vlan_id: int | None = None

    @field_validator("cidr")
    @classmethod
    def validate_cidr(cls, value: str) -> str:
        return str(ipaddress.ip_network(value, strict=False))

    @field_validator("gateway")
    @classmethod
    def validate_gateway(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return str(ipaddress.ip_address(value))

    @model_validator(mode="after")
    def validate_gateway_in_network(self) -> "NetworkCreate":
        if self.gateway and ipaddress.ip_address(self.gateway) not in ipaddress.ip_network(
            self.cidr,
            strict=False,
        ):
            raise ValueError("Gateway must belong to the network CIDR.")
        return self


class NetworkUpdate(BaseModel):
    cidr: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    gateway: str | None = None
    location: str | None = Field(default=None, max_length=120)
    status: str | None = Field(default=None, max_length=32)
    vlan_id: int | None = None

    @field_validator("cidr")
    @classmethod
    def validate_cidr(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return str(ipaddress.ip_network(value, strict=False))

    @field_validator("gateway")
    @classmethod
    def validate_gateway(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return str(ipaddress.ip_address(value))


class NetworkResponse(NetworkCreate):
    id: int
    vlan: VlanResponse | None = None
    ip_count: int = 0
    usable_hosts: int = 0
    utilization_percent: float = 0


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    device_type: str = Field(min_length=1, max_length=60)
    status: str = Field(default="active", max_length=32)
    vendor: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=120)
    asset_tag: str | None = Field(default=None, max_length=120)
    operating_system: str | None = Field(default=None, max_length=120)
    firmware_version: str | None = Field(default=None, max_length=120)
    cpu: str | None = Field(default=None, max_length=160)
    memory: str | None = Field(default=None, max_length=120)
    storage: str | None = Field(default=None, max_length=160)
    warranty_expires: str | None = Field(default=None, max_length=60)
    owner: str | None = Field(default=None, max_length=120)
    rack_position: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    notes: str | None = None


class DeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    device_type: str | None = Field(default=None, min_length=1, max_length=60)
    status: str | None = Field(default=None, max_length=32)
    vendor: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=120)
    asset_tag: str | None = Field(default=None, max_length=120)
    operating_system: str | None = Field(default=None, max_length=120)
    firmware_version: str | None = Field(default=None, max_length=120)
    cpu: str | None = Field(default=None, max_length=160)
    memory: str | None = Field(default=None, max_length=120)
    storage: str | None = Field(default=None, max_length=160)
    warranty_expires: str | None = Field(default=None, max_length=60)
    owner: str | None = Field(default=None, max_length=120)
    rack_position: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    notes: str | None = None


class InterfaceCreate(BaseModel):
    name: str = Field(default="eth0", min_length=1, max_length=80)
    mac_address: str | None = None
    ip_address: str | None = None
    network_id: int | None = None
    assignment_type: str = Field(default="static", max_length=32)

    @field_validator("mac_address")
    @classmethod
    def validate_mac(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not MAC_PATTERN.match(value):
            raise ValueError("Invalid MAC address.")
        return value.lower()

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return str(ipaddress.ip_address(value))


class DeviceWithInterfaceCreate(DeviceCreate):
    interface: InterfaceCreate | None = None


class DeviceResponse(DeviceCreate):
    id: int
    primary_ip: str | None = None
    primary_mac: str | None = None


class IpAddressResponse(BaseModel):
    id: int
    address: str
    assignment_type: str
    network_id: int | None


class IpAddressCreate(BaseModel):
    address: str
    assignment_type: str = Field(default="static", max_length=32)
    network_id: int | None = None
    interface_id: int | None = None

    @field_validator("address")
    @classmethod
    def validate_address(cls, value: str) -> str:
        return str(ipaddress.ip_address(value))


class IpAddressUpdate(BaseModel):
    address: str | None = None
    assignment_type: str | None = Field(default=None, max_length=32)
    network_id: int | None = None
    interface_id: int | None = None

    @field_validator("address")
    @classmethod
    def validate_address(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return str(ipaddress.ip_address(value))


class IpAddressRecordResponse(IpAddressResponse):
    interface_id: int | None
    interface_name: str | None
    mac_address: str | None
    device_id: int | None
    device_name: str | None
    network_cidr: str | None
    vlan_id: int | None
    vlan_name: str | None
    state: str


class InterfaceResponse(BaseModel):
    id: int
    name: str
    mac_address: str | None
    ip_addresses: list[IpAddressResponse]


class InterfaceRecordResponse(BaseModel):
    id: int
    name: str
    mac_address: str | None
    device_id: int
    device_name: str


class ServiceCreate(BaseModel):
    device_id: int
    name: str = Field(min_length=1, max_length=80)
    port: int | None = Field(default=None, ge=1, le=65535)
    protocol: str = Field(default="tcp", max_length=20)
    status: str = Field(default="active", max_length=32)


class ServiceUpdate(BaseModel):
    device_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=80)
    port: int | None = Field(default=None, ge=1, le=65535)
    protocol: str | None = Field(default=None, max_length=20)
    status: str | None = Field(default=None, max_length=32)


class ServiceRecordResponse(BaseModel):
    id: int
    device_id: int
    device_name: str
    device_type: str
    name: str
    port: int | None
    protocol: str
    status: str
    primary_ip: str | None = None


class DeviceDetailResponse(DeviceResponse):
    interfaces: list[InterfaceResponse]


class DashboardStats(BaseModel):
    devices: int
    ip_addresses: int
    networks: int
    vlans: int
    services: int
    notes: int


class RecentDevice(BaseModel):
    id: int
    name: str
    device_type: str
    primary_ip: str | None
    primary_mac: str | None
    status: str
    last_change: str


class ServiceSummary(BaseModel):
    name: str
    device_count: int
    status: str


class NetworkNode(BaseModel):
    cidr: str
    name: str
    device_count: int
    ip_count: int
    usable_hosts: int
    utilization_percent: float
    vlan: VlanResponse | None = None


class DashboardSummary(BaseModel):
    stats: DashboardStats
    recent_devices: list[RecentDevice]
    services: list[ServiceSummary]
    networks: list[NetworkNode]
