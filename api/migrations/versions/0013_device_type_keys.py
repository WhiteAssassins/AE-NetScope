"""Store device types as language-neutral keys."""

import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_device_type_keys"
down_revision: str | None = "0012_integration_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copy of the mapping at the time of this migration.
DEVICE_TYPE_KEYS = {
    "workstation": ["equipo", "computer", "computadora", "pc", "desktop", "laptop", "portatil"],
    "server": ["servidor"],
    "switch": [],
    "router": [],
    "firewall": [],
    "access_point": ["access point", "ap", "punto de acceso", "wireless access point"],
    "ip_camera": ["camara ip", "camara", "camera", "ip camera"],
    "nvr": [],
    "dvr": [],
    "nas": [],
    "san": [],
    "printer": ["impresora"],
    "voip": [],
    "ups": [],
    "iot": [],
    "virtualization": [
        "virtualizacion",
        "virtual machine",
        "vm",
        "hypervisor",
        "hipervisor",
        "maquina virtual",
    ],
    "container": ["contenedor", "docker"],
    "sensor": [],
    "access_control": ["control de acceso", "access control"],
    "other": ["otro"],
}

LEGACY_LABELS = {
    "workstation": "Equipo",
    "server": "Servidor",
    "switch": "Switch",
    "router": "Router",
    "firewall": "Firewall",
    "access_point": "Access Point",
    "ip_camera": "Cámara IP",
    "nvr": "NVR",
    "dvr": "DVR",
    "nas": "NAS",
    "san": "SAN",
    "printer": "Impresora",
    "voip": "VoIP",
    "ups": "UPS",
    "iot": "IoT",
    "virtualization": "Virtualización",
    "container": "Contenedor",
    "sensor": "Sensor",
    "access_control": "Control de acceso",
    "other": "Otro",
}


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(ascii_value.lower().replace("_", " ").replace("-", " ").split())


LOOKUP = {_normalize(key): key for key in DEVICE_TYPE_KEYS}
LOOKUP.update(
    {_normalize(alias): key for key, aliases in DEVICE_TYPE_KEYS.items() for alias in aliases}
)


def _rewrite(mapping) -> None:
    bind = op.get_bind()
    values = bind.execute(sa.text("SELECT DISTINCT device_type FROM devices")).scalars().all()
    for value in values:
        replacement = mapping(value)
        if replacement != value:
            bind.execute(
                sa.text("UPDATE devices SET device_type = :new WHERE device_type = :old"),
                {"new": replacement, "old": value},
            )


def upgrade() -> None:
    _rewrite(lambda value: LOOKUP.get(_normalize(value or ""), "other"))


def downgrade() -> None:
    _rewrite(lambda value: LEGACY_LABELS.get(value, value))
