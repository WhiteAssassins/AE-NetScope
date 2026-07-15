import json

from app.core.config import settings
from app.middleware.request_limits import RequestSizeLimitMiddleware


async def test_streamed_request_without_content_length_is_limited(monkeypatch) -> None:
    monkeypatch.setattr(settings, "max_request_body_bytes", 5)
    request_messages = iter(
        [
            {"type": "http.request", "body": b"123", "more_body": True},
            {"type": "http.request", "body": b"456", "more_body": False},
        ]
    )
    response_messages = []

    async def receive():
        return next(request_messages)

    async def send(message):
        response_messages.append(message)

    async def consuming_app(_scope, receive_body, send_response):
        while True:
            message = await receive_body()
            if not message.get("more_body", False):
                break
        await send_response({"type": "http.response.start", "status": 200, "headers": []})
        await send_response({"type": "http.response.body", "body": b"ok"})

    middleware = RequestSizeLimitMiddleware(consuming_app)
    await middleware(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [],
            "http_version": "1.1",
            "scheme": "http",
            "server": ("test", 80),
            "client": ("127.0.0.1", 50000),
            "root_path": "",
            "query_string": b"",
        },
        receive,
        send,
    )

    assert response_messages[0]["status"] == 413
    assert json.loads(response_messages[1]["body"])["detail"] == "Request body is too large."


async def test_import_uses_stricter_import_limit(monkeypatch) -> None:
    monkeypatch.setattr(settings, "max_request_body_bytes", 100)
    monkeypatch.setattr(settings, "max_import_json_bytes", 10)
    response_messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        response_messages.append(message)

    async def unused_app(_scope, _receive, _send):
        raise AssertionError("Oversized request must not reach the application.")

    middleware = RequestSizeLimitMiddleware(unused_app)
    await middleware(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/inventory/import.json",
            "headers": [(b"content-length", b"11")],
            "http_version": "1.1",
            "scheme": "http",
            "server": ("test", 80),
            "client": ("127.0.0.1", 50000),
            "root_path": "",
            "query_string": b"",
        },
        receive,
        send,
    )

    assert response_messages[0]["status"] == 413
    assert json.loads(response_messages[1]["body"])["detail"] == (
        "Inventory import JSON is too large."
    )
