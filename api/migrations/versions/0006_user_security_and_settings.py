"""user security, regional preferences, maintenance and update history

Revision ID: 0006_user_security_and_settings
Revises: 0005_security_hardening
Create Date: 2026-07-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_user_security_and_settings"
down_revision: str | None = "0005_security_hardening"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC")
        )
        batch_op.add_column(
            sa.Column("date_format", sa.String(length=16), nullable=False, server_default="locale")
        )
        batch_op.add_column(
            sa.Column("hour_format", sa.String(length=2), nullable=False, server_default="24")
        )
        batch_op.add_column(
            sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))

    op.create_table(
        "webauthn_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False, unique=True),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("transports", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_webauthn_credentials_user_id", "webauthn_credentials", ["user_id"])
    op.create_table(
        "webauthn_challenges",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("purpose", sa.String(length=16), nullable=False),
        sa.Column("challenge", sa.LargeBinary(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_webauthn_challenges_user_id", "webauthn_challenges", ["user_id"])
    op.create_index("ix_webauthn_challenges_expires_at", "webauthn_challenges", ["expires_at"])
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("maintenance_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("maintenance_message", sa.Text(), nullable=False),
        sa.Column(
            "updated_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(
        sa.text(
            "INSERT INTO system_settings "
            "(id, maintenance_enabled, maintenance_message, updated_at) "
            "VALUES (1, FALSE, 'AE NetScope is undergoing maintenance.', CURRENT_TIMESTAMP)"
        )
    )
    op.create_table(
        "update_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "requested_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("target_tag", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_update_history_requested_by_user_id", "update_history", ["requested_by_user_id"]
    )
    op.create_index("ix_update_history_created_at", "update_history", ["created_at"])


def downgrade() -> None:
    op.drop_table("update_history")
    op.drop_table("system_settings")
    op.drop_table("webauthn_challenges")
    op.drop_table("webauthn_credentials")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("totp_secret_encrypted")
        batch_op.drop_column("totp_enabled")
        batch_op.drop_column("hour_format")
        batch_op.drop_column("date_format")
        batch_op.drop_column("timezone")
