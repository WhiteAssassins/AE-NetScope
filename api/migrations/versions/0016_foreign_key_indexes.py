"""Index the columns that inventory and audit queries join and filter on.

PostgreSQL does not index foreign key columns automatically, so subnet address counts,
device services and actor filters otherwise read whole tables.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0016_foreign_key_indexes"
down_revision: str | None = "0015_assignment_type_values"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEXES = (
    ("ix_ip_addresses_network_id", "ip_addresses", "network_id"),
    ("ix_ip_addresses_interface_id", "ip_addresses", "interface_id"),
    ("ix_services_device_id", "services", "device_id"),
    ("ix_networks_vlan_id", "networks", "vlan_id"),
    ("ix_audit_events_actor_user_id", "audit_events", "actor_user_id"),
)


def upgrade() -> None:
    for name, table, column in INDEXES:
        op.create_index(name, table, [column])


def downgrade() -> None:
    for name, table, _column in reversed(INDEXES):
        op.drop_index(name, table_name=table)
