"""add session activity timestamp

Revision ID: 0009_session_idle
Revises: 0008_search_indexing
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_session_idle"
down_revision: str | None = "0008_search_indexing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("user_sessions") as batch_op:
        batch_op.add_column(sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))

    op.execute(sa.text("UPDATE user_sessions SET last_seen_at = created_at"))

    with op.batch_alter_table("user_sessions") as batch_op:
        batch_op.alter_column("last_seen_at", nullable=False)
        batch_op.create_index("ix_user_sessions_last_seen_at", ["last_seen_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("user_sessions") as batch_op:
        batch_op.drop_index("ix_user_sessions_last_seen_at")
        batch_op.drop_column("last_seen_at")
