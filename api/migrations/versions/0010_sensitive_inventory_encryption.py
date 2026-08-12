"""prepare sensitive fields for authenticated encryption

Revision ID: 0010_sensitive_data
Revises: 0009_session_idle
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.services.data_protection import (
    SENSITIVE_DATABASE_COLUMNS,
    decrypt_sensitive_text,
    is_encrypted_value,
)

revision: str = "0010_sensitive_data"
down_revision: str | None = "0009_session_idle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEVICE_TEXT_COLUMNS = {
    "vendor": 120,
    "model": 120,
    "serial_number": 120,
    "asset_tag": 120,
    "operating_system": 120,
    "firmware_version": 120,
    "cpu": 160,
    "memory": 120,
    "storage": 160,
    "warranty_expires": 60,
    "owner": 120,
    "rack_position": 120,
    "location": 120,
}


def upgrade() -> None:
    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.alter_column("message", existing_type=sa.String(length=500), type_=sa.Text())
        batch_op.alter_column("ip_address", existing_type=sa.String(length=64), type_=sa.Text())

    with op.batch_alter_table("user_sessions") as batch_op:
        batch_op.alter_column("user_agent", existing_type=sa.String(length=512), type_=sa.Text())
        batch_op.alter_column("ip_address", existing_type=sa.String(length=64), type_=sa.Text())

    with op.batch_alter_table("networks") as batch_op:
        batch_op.alter_column("gateway", existing_type=sa.String(length=64), type_=sa.Text())
        batch_op.alter_column("location", existing_type=sa.String(length=120), type_=sa.Text())

    with op.batch_alter_table("devices") as batch_op:
        for column_name, original_length in DEVICE_TEXT_COLUMNS.items():
            batch_op.alter_column(
                column_name,
                existing_type=sa.String(length=original_length),
                type_=sa.Text(),
            )


def downgrade() -> None:
    connection = op.get_bind()
    for table_name, column_names in SENSITIVE_DATABASE_COLUMNS.items():
        for column_name in column_names:
            rows = connection.execute(
                sa.text(
                    f"SELECT id, {column_name} AS protected_value "  # noqa: S608
                    f"FROM {table_name} WHERE {column_name} IS NOT NULL"
                )
            ).mappings()
            for row in rows:
                current_value = str(row["protected_value"])
                if not is_encrypted_value(current_value):
                    continue
                connection.execute(
                    sa.text(
                        f"UPDATE {table_name} SET {column_name} = :plaintext "  # noqa: S608
                        "WHERE id = :record_id"
                    ),
                    {
                        "plaintext": decrypt_sensitive_text(current_value),
                        "record_id": row["id"],
                    },
                )

    with op.batch_alter_table("devices") as batch_op:
        for column_name, original_length in DEVICE_TEXT_COLUMNS.items():
            batch_op.alter_column(
                column_name,
                existing_type=sa.Text(),
                type_=sa.String(length=original_length),
            )

    with op.batch_alter_table("networks") as batch_op:
        batch_op.alter_column("gateway", existing_type=sa.Text(), type_=sa.String(length=64))
        batch_op.alter_column("location", existing_type=sa.Text(), type_=sa.String(length=120))

    with op.batch_alter_table("user_sessions") as batch_op:
        batch_op.alter_column("user_agent", existing_type=sa.Text(), type_=sa.String(length=512))
        batch_op.alter_column("ip_address", existing_type=sa.Text(), type_=sa.String(length=64))

    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.alter_column("message", existing_type=sa.Text(), type_=sa.String(length=500))
        batch_op.alter_column("ip_address", existing_type=sa.Text(), type_=sa.String(length=64))
