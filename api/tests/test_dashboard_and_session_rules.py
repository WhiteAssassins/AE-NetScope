import time
from pathlib import Path
from types import SimpleNamespace

from httpx import ASGITransport, AsyncClient
from starlette.responses import Response

from app.core.config import settings
from app.main import create_app
from app.middleware import maintenance_mode
from app.services.mfa import _totp_code
from tests.test_account_security import login, security_client  # noqa: F401
from tests.test_inventory import inventory_client  # noqa: F401
from tests.test_maintenance_mode import FakeSession, request


async def post(client, csrf, path, payload):
    return await client.post(f"/api/inventory/{path}", headers={"X-CSRF-Token": csrf}, json=payload)


async def test_unknown_api_paths_are_not_served_as_web_pages(tmp_path: Path, monkeypatch) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>root</html>", encoding="utf-8")
    monkeypatch.setattr(settings, "app_web_dist_dir", str(dist))

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        missing_api = await client.get("/api/does-not-exist")
        page = await client.get("/devices")

    assert missing_api.status_code == 404
    assert missing_api.json() == {"detail": "Not Found"}
    assert page.status_code == 200
    assert "root" in page.text


async def test_dashboard_lists_five_recent_devices_with_several_addresses(
    inventory_client,  # noqa: F811
) -> None:
    client, csrf = inventory_client
    for index in range(6):
        device = await post(client, csrf, "devices", {"name": f"D{index}", "device_type": "server"})
        for interface in range(3):
            await client.post(
                f"/api/inventory/devices/{device.json()['id']}/interfaces",
                headers={"X-CSRF-Token": csrf},
                json={"name": f"eth{interface}", "ip_address": f"10.0.{index}.{interface + 1}"},
            )

    recent = (await client.get("/api/inventory/dashboard")).json()["recent_devices"]

    assert [item["name"] for item in recent] == ["D5", "D4", "D3", "D2", "D1"]


async def test_dashboard_service_status_reports_the_most_relevant_state(
    inventory_client,  # noqa: F811
) -> None:
    client, csrf = inventory_client
    device = (await post(client, csrf, "devices", {"name": "DNS", "device_type": "server"})).json()
    # Alphabetical order would pick "unknown" and "warning" here.
    for name, status in (
        ("ssh", "inactive"),
        ("ssh", "unknown"),
        ("web", "warning"),
        ("web", "inactive"),
        ("ntp", "active"),
    ):
        await post(
            client, csrf, "services", {"device_id": device["id"], "name": name, "status": status}
        )

    services = (await client.get("/api/inventory/dashboard")).json()["services"]

    assert {item["name"]: item["status"] for item in services} == {
        "ntp": "active",
        "ssh": "inactive",
        "web": "warning",
    }


async def test_dashboard_busiest_subnet_considers_every_subnet(inventory_client) -> None:  # noqa: F811
    client, csrf = inventory_client
    for index in range(5):
        await post(client, csrf, "networks", {"cidr": f"10.{index}.0.0/24", "name": f"N{index}"})
    networks = (await client.get("/api/inventory/networks")).json()
    for host in range(3):
        await post(
            client,
            csrf,
            "ip-addresses",
            {"address": f"10.4.0.{host + 10}", "network_id": networks[4]["id"]},
        )

    dashboard = (await client.get("/api/inventory/dashboard")).json()

    assert len(dashboard["networks"]) == 4
    assert dashboard["busiest_network"]["cidr"] == "10.4.0.0/24"
    assert dashboard["busiest_network"]["ip_count"] == 3


async def test_blank_optional_details_are_stored_as_empty(inventory_client) -> None:  # noqa: F811
    client, csrf = inventory_client
    device = await post(
        client,
        csrf,
        "devices",
        {"name": "SRV", "device_type": "server", "vendor": "  ", "model": " R650 "},
    )
    vlan = await post(client, csrf, "vlans", {"vlan_id": 30, "name": "Lab", "description": "  "})

    detail = (await client.get(f"/api/inventory/devices/{device.json()['id']}")).json()
    quality = (await client.get("/api/inventory/quality")).json()

    assert detail["vendor"] is None
    assert detail["model"] == "R650"
    assert vlan.json()["description"] is None
    missing = next(
        item for item in quality["issues"] if item["code"] == "device_missing_documentation"
    )
    assert "vendor" in missing["context"]["fields"]


async def test_new_tabs_share_the_session_csrf_token(inventory_client) -> None:  # noqa: F811
    client, first_tab_csrf = inventory_client
    second_tab_csrf = (await client.get("/api/auth/csrf")).json()["csrf_token"]

    first = await post(client, first_tab_csrf, "vlans", {"vlan_id": 10, "name": "a"})
    second = await post(client, second_tab_csrf, "vlans", {"vlan_id": 11, "name": "b"})

    assert second_tab_csrf == first_tab_csrf
    assert (first.status_code, second.status_code) == (201, 201)


async def test_totp_codes_may_contain_spaces(security_client) -> None:  # noqa: F811
    csrf = (await login(security_client))["csrf_token"]
    headers = {"X-CSRF-Token": csrf}
    secret = (
        await security_client.post(
            "/api/auth/totp/setup", headers=headers, json={"current_password": "correct-password"}
        )
    ).json()["secret"]
    code = _totp_code(secret, int(time.time()) // 30)

    confirmed = await security_client.post(
        "/api/auth/totp/confirm", headers=headers, json={"code": f"{code[:3]} {code[3:]}"}
    )
    next_code = _totp_code(secret, int(time.time()) // 30 + 1)
    signed_in = await security_client.post(
        "/api/auth/login",
        json={
            "email": "security@example.com",
            "password": "correct-password",
            "totp_code": f" {next_code[:3]}-{next_code[3:]} ",
        },
    )

    assert confirmed.status_code == 200
    assert signed_in.status_code == 200


async def test_maintenance_keeps_session_state_readable(monkeypatch) -> None:
    state = SimpleNamespace(maintenance_enabled=True, maintenance_message="Maintenance")
    monkeypatch.setattr(maintenance_mode, "SessionLocal", lambda: FakeSession(state))

    async def regular_user(*_args):
        return None

    async def next_response(_request):
        return Response("ok")

    monkeypatch.setattr(maintenance_mode, "get_user_by_session_token", regular_user)

    for path in ("/api/auth/me", "/api/auth/csrf"):
        response = await maintenance_mode.maintenance_mode_middleware(request(path), next_response)
        assert response.status_code == 200


async def test_import_limits_report_whether_the_inventory_can_be_restored(
    inventory_client,  # noqa: F811
    monkeypatch,
) -> None:
    client, csrf = inventory_client
    await post(
        client, csrf, "devices", {"name": "BIG", "device_type": "server", "notes": "x" * 4000}
    )

    within_limit = (await client.get("/api/inventory/import/limits")).json()
    monkeypatch.setattr(settings, "max_import_json_bytes", 1024)
    over_limit = (await client.get("/api/inventory/import/limits")).json()

    assert within_limit["current_backup_restorable"] is True
    assert over_limit["current_backup_bytes"] > 1024
    assert over_limit == {
        "max_bytes": 1024,
        "current_backup_bytes": over_limit["current_backup_bytes"],
        "current_backup_restorable": False,
    }


async def test_passkey_sign_in_clears_failed_password_attempts(
    integration_api, monkeypatch
) -> None:
    from sqlalchemy import select
    from webauthn.helpers import bytes_to_base64url

    from app.api.routes import security as security_route
    from app.models.security import WebAuthnCredential
    from app.models.user import User

    client, _, factory = integration_api
    monkeypatch.setattr(settings, "webauthn_rp_id", "test")
    monkeypatch.setattr(settings, "webauthn_origin", "http://test")
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == "integration@example.com"))
        user.failed_login_count = 9
        session.add(
            WebAuthnCredential(
                user_id=user.id,
                credential_id=b"credential-id",
                public_key=b"public-key",
                sign_count=0,
                name="Laptop",
                transports="[]",
            )
        )
        await session.commit()
    monkeypatch.setattr(
        security_route,
        "verify_authentication_response",
        lambda **_kwargs: SimpleNamespace(new_sign_count=1),
    )

    options = await client.post(
        "/api/security/passkeys/authenticate/options", json={"email": "integration@example.com"}
    )
    verified = await client.post(
        "/api/security/passkeys/authenticate/verify",
        json={
            "challenge_id": options.json()["challenge_id"],
            "credential": {"id": bytes_to_base64url(b"credential-id")},
        },
    )

    assert verified.status_code == 200
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == "integration@example.com"))
    assert user.failed_login_count == 0
