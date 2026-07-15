from functools import cached_property
from pathlib import Path
from urllib.parse import quote

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "local"
    app_name: str = "AE NetScope"
    app_web_dist_dir: str | None = None
    deployment_platform: str = "local"

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
    redis_password: str | None = Field(default=None, repr=False)
    redis_rate_limit_fail_open: bool = True

    max_import_json_bytes: int = Field(default=2_000_000, ge=1_024, le=100_000_000)
    max_request_body_bytes: int = Field(default=1_000_000, ge=1_024, le=100_000_000)

    session_secret: str = Field(default="change-me", repr=False)
    initial_setup_token: str | None = Field(
        default=None,
        min_length=16,
        max_length=1_024,
        repr=False,
    )
    session_cookie_name: str = "ae_netscope_session"
    session_cookie_secure: bool | None = None
    session_cookie_samesite: str = "strict"
    session_ttl_seconds: int = 28800

    security_headers_enabled: bool = True
    security_hsts_enabled: bool | None = None
    security_hsts_max_age: int = 31536000

    auth_rate_limit_per_minute: int = 5
    auth_failed_login_limit: int = 10
    auth_lockout_minutes: int = 15

    auto_update_enabled: bool = False
    auto_update_command: str | None = Field(default=None, repr=False)

    session_record_retention_days: int = Field(default=30, ge=0, le=3_650)
    audit_retention_days: int = Field(default=365, ge=0, le=36_500)

    @field_validator("initial_setup_token", mode="before")
    @classmethod
    def normalize_optional_setup_token(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

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

        return URL.create(
            "postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        ).render_as_string(hide_password=False)

    @cached_property
    def redis_url(self) -> str:
        if self.redis_password:
            password = quote(self.redis_password, safe="")
            return f"redis://default:{password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @cached_property
    def effective_session_cookie_secure(self) -> bool:
        if self.session_cookie_secure is not None:
            return self.session_cookie_secure
        return self.app_env == "production"

    @property
    def effective_initial_setup_token(self) -> str | None:
        if self.initial_setup_token:
            return self.initial_setup_token.strip()

        session_secret = self.session_secret.strip()
        unsafe_placeholder = session_secret == "change-me" or session_secret.startswith(
            "change-me-"
        )
        if self.app_env != "local" and len(session_secret) >= 32 and not unsafe_placeholder:
            return session_secret
        return None

    @cached_property
    def effective_hsts_enabled(self) -> bool:
        if self.security_hsts_enabled is not None:
            return self.security_hsts_enabled
        return self.app_env == "production"


settings = Settings()
