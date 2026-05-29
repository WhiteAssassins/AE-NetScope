"""inventory core schema

Revision ID: 0002_inventory_core
Revises: 0001_initial_auth
Create Date: 2026-05-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_inventory_core"
down_revision: str | None = "0001_initial_auth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vlans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vlan_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vlan_id", name="uq_vlans_vlan_id"),
    )
    op.create_index(op.f("ix_vlans_vlan_id"), "vlans", ["vlan_id"], unique=False)

    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("device_type", sa.String(length=60), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("vendor", sa.String(length=120), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("operating_system", sa.String(length=120), nullable=True),
        sa.Column("location", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_devices_name"),
    )
    op.create_index(op.f("ix_devices_name"), "devices", ["name"], unique=False)

    op.create_table(
        "networks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cidr", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("gateway", sa.String(length=64), nullable=True),
        sa.Column("location", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("vlan_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["vlan_id"], ["vlans.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cidr", name="uq_networks_cidr"),
    )
    op.create_index(op.f("ix_networks_cidr"), "networks", ["cidr"], unique=False)

    op.create_table(
        "network_interfaces",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("mac_address", sa.String(length=17), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_id", "name", name="uq_interfaces_device_name"),
        sa.UniqueConstraint("mac_address", name="uq_interfaces_mac_address"),
    )
    op.create_index(
        op.f("ix_network_interfaces_mac_address"),
        "network_interfaces",
        ["mac_address"],
        unique=False,
    )

    op.create_table(
        "ip_addresses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("address", sa.String(length=64), nullable=False),
        sa.Column("assignment_type", sa.String(length=32), nullable=False),
        sa.Column("network_id", sa.Integer(), nullable=True),
        sa.Column("interface_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["interface_id"], ["network_interfaces.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("address", name="uq_ip_addresses_address"),
    )
    op.create_index(op.f("ix_ip_addresses_address"), "ip_addresses", ["address"], unique=False)

    op.create_table(
        "services",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("protocol", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("services")
    op.drop_index(op.f("ix_ip_addresses_address"), table_name="ip_addresses")
    op.drop_table("ip_addresses")
    op.drop_index(op.f("ix_network_interfaces_mac_address"), table_name="network_interfaces")
    op.drop_table("network_interfaces")
    op.drop_index(op.f("ix_networks_cidr"), table_name="networks")
    op.drop_table("networks")
    op.drop_index(op.f("ix_devices_name"), table_name="devices")
    op.drop_table("devices")
    op.drop_index(op.f("ix_vlans_vlan_id"), table_name="vlans")
    op.drop_table("vlans")
