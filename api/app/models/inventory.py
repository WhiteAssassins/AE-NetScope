from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Vlan(Base):
    __tablename__ = "vlans"
    __table_args__ = (UniqueConstraint("vlan_id", name="uq_vlans_vlan_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vlan_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    networks = relationship("Network", back_populates="vlan")


class Network(Base):
    __tablename__ = "networks"
    __table_args__ = (UniqueConstraint("cidr", name="uq_networks_cidr"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cidr: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    gateway: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    vlan_id: Mapped[int | None] = mapped_column(ForeignKey("vlans.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    vlan = relationship("Vlan", back_populates="networks")
    ip_addresses = relationship("IpAddress", back_populates="network")


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (UniqueConstraint("name", name="uq_devices_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    device_type: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    vendor: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    asset_tag: Mapped[str | None] = mapped_column(String(120), nullable=True)
    operating_system: Mapped[str | None] = mapped_column(String(120), nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cpu: Mapped[str | None] = mapped_column(String(160), nullable=True)
    memory: Mapped[str | None] = mapped_column(String(120), nullable=True)
    storage: Mapped[str | None] = mapped_column(String(160), nullable=True)
    warranty_expires: Mapped[str | None] = mapped_column(String(60), nullable=True)
    owner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rack_position: Mapped[str | None] = mapped_column(String(120), nullable=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    interfaces = relationship("NetworkInterface", back_populates="device")


class NetworkInterface(Base):
    __tablename__ = "network_interfaces"
    __table_args__ = (
        UniqueConstraint("device_id", "name", name="uq_interfaces_device_name"),
        UniqueConstraint("mac_address", name="uq_interfaces_mac_address"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    mac_address: Mapped[str | None] = mapped_column(String(17), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    device = relationship("Device", back_populates="interfaces")
    ip_addresses = relationship("IpAddress", back_populates="interface")


class IpAddress(Base):
    __tablename__ = "ip_addresses"
    __table_args__ = (UniqueConstraint("address", name="uq_ip_addresses_address"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    address: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    assignment_type: Mapped[str] = mapped_column(String(32), nullable=False, default="static")
    network_id: Mapped[int | None] = mapped_column(ForeignKey("networks.id"), nullable=True)
    interface_id: Mapped[int | None] = mapped_column(
        ForeignKey("network_interfaces.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    network = relationship("Network", back_populates="ip_addresses")
    interface = relationship("NetworkInterface", back_populates="ip_addresses")


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    protocol: Mapped[str] = mapped_column(String(20), nullable=False, default="tcp")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
