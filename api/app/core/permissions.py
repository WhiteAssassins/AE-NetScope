ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {
        "users:manage",
        "inventory:read",
        "inventory:write",
        "settings:manage",
        "audit:read",
    },
    "operator": {
        "inventory:read",
        "inventory:write",
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
