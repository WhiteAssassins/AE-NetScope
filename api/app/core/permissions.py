ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {
        "users:manage",
        "inventory:read",
        "inventory:export",
        "devices:create",
        "devices:update",
        "devices:delete",
        "ip_addresses:create",
        "ip_addresses:update",
        "ip_addresses:delete",
        "networks:create",
        "networks:update",
        "networks:delete",
        "vlans:create",
        "vlans:update",
        "vlans:delete",
        "services:create",
        "services:update",
        "services:delete",
        "settings:manage",
        "audit:read",
    },
    "operator": {
        "inventory:read",
        "inventory:export",
        "devices:create",
        "devices:update",
        "ip_addresses:create",
        "ip_addresses:update",
        "networks:create",
        "networks:update",
        "vlans:create",
        "vlans:update",
        "services:create",
        "services:update",
        "audit:read",
    },
    "viewer": {
        "inventory:read",
    },
}


def permissions_for_role(role: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role, set())


def role_has_permission(role: str, permission: str) -> bool:
    return permission in permissions_for_role(role)
