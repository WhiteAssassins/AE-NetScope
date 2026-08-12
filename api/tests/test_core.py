from sqlalchemy import text
from sqlalchemy.engine import make_url

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
from app.db.session import engine
from app.main import create_app


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
        session_secret="production-session-secret-at-least-32-bytes",
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

    special_password_settings = Settings(
        app_env="production",
        session_secret="production-session-secret-at-least-32-bytes",
        postgres_host="db",
        postgres_user="ae_user",
        postgres_password="P@ss:word/with#chars",
    )
    parsed_url = make_url(special_password_settings.database_url)
    assert parsed_url.password == "P@ss:word/with#chars"
    assert parsed_url.host == "db"


def test_production_enables_secure_cookie_and_hsts_effectively() -> None:
    local_settings = Settings(app_env="local")
    production_settings = Settings(
        app_env="production",
        session_secret="production-session-secret-at-least-32-bytes",
    )
    production_http_preview_settings = Settings(
        app_env="production",
        session_secret="production-session-secret-at-least-32-bytes",
        session_cookie_secure=False,
        security_hsts_enabled=False,
    )

    assert local_settings.effective_session_cookie_secure is False
    assert local_settings.effective_hsts_enabled is False
    assert production_settings.effective_session_cookie_secure is True
    assert production_settings.effective_hsts_enabled is True
    assert production_http_preview_settings.effective_session_cookie_secure is False
    assert production_http_preview_settings.effective_hsts_enabled is False


async def test_application_sqlite_enforces_foreign_keys() -> None:
    if engine.url.get_backend_name() != "sqlite":
        return

    async with engine.connect() as connection:
        foreign_keys = await connection.scalar(text("PRAGMA foreign_keys"))

    assert foreign_keys == 1


def test_database_engine_hides_query_parameters_from_errors() -> None:
    assert engine.sync_engine.hide_parameters is True


def test_redis_url_supports_optional_password() -> None:
    without_password = Settings(redis_host="redis", redis_port=6379, redis_db=0)
    with_password = Settings(
        redis_host="redis",
        redis_port=6379,
        redis_db=1,
        redis_password="secret value",
    )

    assert without_password.redis_url == "redis://redis:6379/0"
    assert with_password.redis_url == "redis://default:secret%20value@redis:6379/1"


def test_empty_setup_token_is_normalized() -> None:
    assert Settings(initial_setup_token="").initial_setup_token is None


def test_managed_runtime_rejects_public_placeholder_secrets() -> None:
    insecure = Settings(
        app_env="docker",
        session_secret="change-me-at-least-32-random-bytes-local-only",
        postgres_password="change-me-local-only",
        redis_password="change-me-redis-local-only",
        redis_rate_limit_fail_open=True,
    )
    secure = Settings(
        app_env="docker",
        session_secret="session-secret-with-at-least-32-random-characters",
        postgres_password="database-password-with-randomness",
        redis_password="redis-password-with-randomness",
        redis_rate_limit_fail_open=False,
    )

    assert len(insecure.runtime_security_errors()) == 4
    assert secure.runtime_security_errors() == []


def test_truenas_http_runtime_configuration_remains_supported() -> None:
    truenas_settings = Settings(
        app_env="production",
        session_secret="truenas-session-secret-with-at-least-32-characters",
        postgres_password="truenas-database-password-with-randomness",
        redis_password="truenas-redis-password-with-randomness",
        session_cookie_secure=False,
        security_hsts_enabled=False,
    )

    assert truenas_settings.redis_rate_limit_fail_open is False
    assert truenas_settings.effective_session_cookie_secure is False
    assert truenas_settings.runtime_security_errors() == []


def test_existing_truenas_installation_with_short_internal_passwords_is_supported() -> None:
    truenas_settings = Settings(
        app_env="production",
        session_secret="truenas-session-secret-with-at-least-32-characters",
        postgres_password="dbpass",
        redis_password="redispass",
        session_cookie_secure=False,
        security_hsts_enabled=False,
    )

    assert truenas_settings.runtime_security_errors() == []


def test_backup_encryption_key_prefers_dedicated_key_and_supports_fallbacks() -> None:
    configured = Settings(
        session_secret="session-secret-with-at-least-32-random-characters",
        mfa_encryption_key="mfa-encryption-key-with-at-least-32-characters",
        backup_encryption_key="backup-encryption-key-with-at-least-32-characters",
        backup_decryption_fallback_keys="old-key-one,old-key-two",
    )

    assert configured.effective_backup_encryption_key.startswith("backup-encryption-key")
    assert configured.backup_decryption_keys == [
        "backup-encryption-key-with-at-least-32-characters",
        "old-key-one",
        "old-key-two",
    ]


def test_managed_deployments_do_not_expose_api_schema(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "app_env", "docker")
    managed_app = create_app()

    assert managed_app.docs_url is None
    assert managed_app.openapi_url is None
