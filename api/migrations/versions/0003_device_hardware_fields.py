"""device hardware fields

Revision ID: 0003_device_hardware_fields
Revises: 0002_inventory_core
Create Date: 2026-06-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_device_hardware_fields"
down_revision: str | None = "0002_inventory_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("serial_number", sa.String(length=120), nullable=True))
    op.add_column("devices", sa.Column("asset_tag", sa.String(length=120), nullable=True))
    op.add_column("devices", sa.Column("firmware_version", sa.String(length=120), nullable=True))
    op.add_column("devices", sa.Column("cpu", sa.String(length=160), nullable=True))
    op.add_column("devices", sa.Column("memory", sa.String(length=120), nullable=True))
    op.add_column("devices", sa.Column("storage", sa.String(length=160), nullable=True))
    op.add_column("devices", sa.Column("warranty_expires", sa.String(length=60), nullable=True))
    op.add_column("devices", sa.Column("owner", sa.String(length=120), nullable=True))
    op.add_column("devices", sa.Column("rack_position", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("devices", "rack_position")
    op.drop_column("devices", "owner")
    op.drop_column("devices", "warranty_expires")
    op.drop_column("devices", "storage")
    op.drop_column("devices", "memory")
    op.drop_column("devices", "cpu")
    op.drop_column("devices", "firmware_version")
    op.drop_column("devices", "asset_tag")
    op.drop_column("devices", "serial_number")
