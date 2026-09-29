import json
import os
import subprocess
import sys

import pytest

from app.core.config import Settings


@pytest.mark.parametrize("https_mode", [False, True])
def test_catalog_runtime_requires_no_integration_configuration(https_mode):
    settings = Settings(
        _env_file=None,
        app_env="production",
        app_name="AE NetScope",
        app_web_dist_dir="/app/web",
        session_secret="catalog-session-secret-with-at-least-32-characters",
        postgres_host="postgres",
        postgres_password="catalog-database-password",
        redis_host="redis",
        redis_password="catalog-redis-password",
        session_cookie_secure=https_mode,
        security_hsts_enabled=https_mode,
    )
    assert settings.runtime_security_errors() == []
    assert settings.database_url.startswith("postgresql+asyncpg://")
    assert settings.effective_session_cookie_secure is https_mode
    assert settings.effective_hsts_enabled is https_mode
    assert settings.redis_rate_limit_fail_open is False
    assert settings.auto_update_enabled is False


def test_api_import_and_health_routes_do_not_require_gateway_sdk():
    program = """
import importlib.abc
import json
import sys

class RejectGatewaySDK(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == "mcp" or fullname.startswith("mcp."):
            raise ImportError("Gateway SDK is not installed in the application image")
        return None

sys.meta_path.insert(0, RejectGatewaySDK())
from app.main import app
print(json.dumps(list(app.openapi()["paths"])))
"""
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in {"NETSCOPE_API_URL", "NETSCOPE_API_TOKEN", "DATABASE_URL"}
    }
    environment.update(
        {
            "APP_ENV": "production",
            "APP_WEB_DIST_DIR": "",
            "SESSION_SECRET": "catalog-session-secret-with-at-least-32-characters",
            "POSTGRES_PASSWORD": "catalog-database-password",
            "REDIS_PASSWORD": "catalog-redis-password",
        }
    )
    result = subprocess.run(
        [sys.executable, "-c", program],
        env=environment,
        capture_output=True,
        text=True,
        check=True,
        timeout=20,
    )
    routes = json.loads(result.stdout)
    assert "/api/health/live" in routes
    assert "/api/health/ready" in routes
    assert "/api/integrations/tokens" in routes
    assert "/mcp" not in routes
