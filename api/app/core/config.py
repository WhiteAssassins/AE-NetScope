from functools import cached_property
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "local"
    app_name: str = "AE NetScope"

    api_cors_origins: str = "http://127.0.0.1:5173"

    database_url_override: str | None = Field(default=None, alias="DATABASE_URL", repr=False)
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    postgres_db: str = "ae_netscope"
    postgres_user: str = "ae_netscope"
    postgres_password: str = Field(default="change-me", repr=False)

    redis_host: str = "127.0.0.1"
    redis_port: int = 6379
    redis_db: int = 0
    redis_rate_limit_fail_open: bool = True

    max_import_json_bytes: int = 2_000_000

    session_secret: str = Field(default="change-me", repr=False)
    session_cookie_name: str = "ae_netscope_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "strict"
    session_ttl_seconds: int = 28800

    security_headers_enabled: bool = True
    security_hsts_enabled: bool = False
    security_hsts_max_age: int = 31536000

    password_hash_algorithm: str = "argon2id"
    auth_rate_limit_per_minute: int = 5
    auth_failed_login_limit: int = 10
    auth_lockout_minutes: int = 15

    crypto_policy_version: int = 1
    pqc_readiness_mode: str = "crypto-agile"

    @cached_property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.api_cors_origins.split(",") if origin.strip()]

    @cached_property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override

        if self.app_env == "local":
            database_path = Path(__file__).resolve().parents[2] / "var" / "ae_netscope.local.db"
            database_path.parent.mkdir(exist_ok=True)
            return f"sqlite+aiosqlite:///{database_path.as_posix()}"

        return (
            "postgresql+asyncpg://"
            f"{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @cached_property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @cached_property
    def effective_session_cookie_secure(self) -> bool:
        return self.session_cookie_secure or self.app_env == "production"

    @cached_property
    def effective_hsts_enabled(self) -> bool:
        return self.security_hsts_enabled or self.app_env == "production"


settings = Settings()
