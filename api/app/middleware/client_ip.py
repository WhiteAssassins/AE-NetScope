"""Remember the client address of the current request for audit records."""

from starlette.types import ASGIApp, Receive, Scope, Send

from app.services.audit import request_client_ip


class ClientIpMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        # An in-process call that runs inside an outer request, such as the built-in MCP
        # endpoint calling the API, keeps the outer request's address.
        if scope["type"] != "http" or request_client_ip.get() is not None:
            return await self.app(scope, receive, send)
        client = scope.get("client")
        token = request_client_ip.set(client[0] if client else None)
        try:
            await self.app(scope, receive, send)
        finally:
            request_client_ip.reset(token)
