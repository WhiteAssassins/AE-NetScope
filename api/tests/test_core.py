from app.core.config import Settings
from app.core.permissions import permissions_for_role, role_has_permission
from app.core.security import (
    generate_csrf_token,
    generate_password,
    generate_session_token,
    hash_csrf_token,
    hash_password,
    hash_session_token,
    verify_password,
)


def test_role_permissions_are_explicit_and_order_independent() -> None:
    admin_permissions = permissions_for_role("admin")
    operator_permissions = permissions_for_role("operator")
    viewer_permissions = permissions_for_role("viewer")

    assert "users:manage" in admin_permissions
    assert "devices:delete" in admin_permissions
    assert "devices:update" in operator_permissions
    assert "devices:delete" not in operator_permissions
    assert viewer_permissions == {"inventory:read"}
    assert permissions_for_role("unknown") == set()


def test_role_has_permission_uses_exact_permission_names() -> None:
    assert role_has_permission("admin", "users:manage") is True
    assert role_has_permission("viewer", "inventory:read") is True
    assert role_has_permission("viewer", "inventory") is False
    assert role_has_permission("unknown", "inventory:read") is False


def test_password_hashing_and_generated_passwords() -> None:
    password_hash = hash_password("correct-password")

    assert password_hash != "correct-password"
    assert verify_password("correct-password", password_hash) is True
    assert verify_password("wrong-password", password_hash) is False
    assert len(generate_password()) == 24
    assert len(generate_password(32)) == 32


def test_session_and_csrf_tokens_are_random_and_hashed() -> None:
    session_token = generate_session_token()
    other_session_token = generate_session_token()
    csrf_token = generate_csrf_token()

    assert session_token != other_session_token
    assert len(session_token) >= 48
    assert len(csrf_token) >= 32
    assert hash_session_token(session_token) != session_token
    assert hash_csrf_token(csrf_token) != csrf_token
    assert len(hash_session_token(session_token)) == 64
    assert len(hash_csrf_token(csrf_token)) == 64


def test_local_database_uses_sqlite_and_production_uses_postgres() -> None:
    local_settings = Settings(app_env="local")
    production_settings = Settings(
        app_env="production",
        postgres_host="db",
        postgres_port=5432,
        postgres_db="ae_netscope",
        postgres_user="ae_user",
        postgres_password="secret",
    )

    assert local_settings.database_url.startswith("sqlite+aiosqlite:///")
    assert production_settings.database_url == (
        "postgresql+asyncpg://ae_user:secret@db:5432/ae_netscope"
    )
