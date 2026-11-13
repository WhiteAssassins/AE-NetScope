"""Normalize IP address assignment types to the supported values."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_assignment_type_values"
down_revision: str | None = "0014_embedded_mcp_server"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SUPPORTED = {"static", "dhcp", "reserved"}


def upgrade() -> None:
    bind = op.get_bind()
    values = bind.execute(
        sa.text("SELECT DISTINCT assignment_type FROM ip_addresses")
    ).scalars().all()
    for value in values:
        normalized = (value or "").strip().lower()
        replacement = normalized if normalized in SUPPORTED else "static"
        if replacement != value:
            bind.execute(
                sa.text(
                    "UPDATE ip_addresses SET assignment_type = :new "
                    "WHERE assignment_type = :old"
                ),
                {"new": replacement, "old": value},
            )


def downgrade() -> None:
    # The original spelling of normalized values is not recorded.
    pass
