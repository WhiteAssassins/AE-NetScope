"""Add the built-in MCP server switch."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_embedded_mcp_server"
down_revision: str | None = "0013_device_type_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("system_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "mcp_server_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("system_settings") as batch_op:
        batch_op.drop_column("mcp_server_enabled")
