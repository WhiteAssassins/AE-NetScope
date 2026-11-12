import unicodedata
from typing import Literal, get_args

DeviceType = Literal[
    "workstation",
    "server",
    "switch",
    "router",
    "firewall",
    "access_point",
    "ip_camera",
    "nvr",
    "dvr",
    "nas",
    "san",
    "printer",
    "voip",
    "ups",
    "iot",
    "virtualization",
    "container",
    "sensor",
    "access_control",
    "other",
]

DEVICE_TYPES: tuple[str, ...] = get_args(DeviceType)

# Labels used before device types were stored as language-neutral keys, plus common
# English and Spanish names sent by API clients, imports and MCP integrations.
_ALIASES = {
    "workstation": ["equipo", "computer", "computadora", "pc", "desktop", "laptop", "portatil"],
    "server": ["servidor"],
    "access_point": ["access point", "ap", "punto de acceso", "wireless access point"],
    "ip_camera": ["camara ip", "camara", "camera", "ip camera"],
    "printer": ["impresora"],
    "virtualization": [
        "virtualizacion",
        "virtual machine",
        "vm",
        "hypervisor",
        "hipervisor",
        "maquina virtual",
    ],
    "container": ["contenedor", "docker"],
    "access_control": ["control de acceso", "access control"],
    "other": ["otro"],
}


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(ascii_value.lower().replace("_", " ").replace("-", " ").split())


_LOOKUP = {_normalize(key): key for key in DEVICE_TYPES}
_LOOKUP.update(
    {_normalize(alias): key for key, aliases in _ALIASES.items() for alias in aliases}
)


def normalize_device_type(value: str) -> str:
    """Return the stored key for a device type key, legacy label or known alias.

    Unknown values are returned unchanged so validation can report them.
    """
    return _LOOKUP.get(_normalize(value), value)


def device_type_or_other(value: str) -> str:
    normalized = normalize_device_type(value)
    return normalized if normalized in DEVICE_TYPES else "other"
