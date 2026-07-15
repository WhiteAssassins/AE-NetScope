"""security and integrity hardening

Revision ID: 0005_security_hardening
Revises: 0004_user_preferred_language
Create Date: 2026-07-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_security_hardening"
down_revision: str | None = "0004_user_preferred_language"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("setup_completed", sa.Boolean(), nullable=False),
        sa.Column("admin_guard", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO app_state (id, setup_completed, admin_guard)
            SELECT 1,
                   CASE WHEN EXISTS (SELECT 1 FROM users) THEN TRUE ELSE FALSE END,
                   0
            """
        )
    )
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_index("ix_user_sessions_expires_at", table_name="user_sessions")
    op.drop_table("app_state")
