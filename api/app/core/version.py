from functools import lru_cache
from pathlib import Path

PROJECT_REPOSITORY_URL = "https://github.com/WhiteAssassins/AE-NetScope"
PROJECT_RELEASES_URL = f"{PROJECT_REPOSITORY_URL}/releases"


@lru_cache
def project_version() -> str:
    version_file = Path(__file__).resolve().parents[3] / "VERSION"
    try:
        return version_file.read_text(encoding="utf-8").strip()
    except OSError:
        return "0.0.0-unknown"


def release_channel(version: str | None = None) -> str:
    value = version or project_version()
    if "alpha" in value:
        return "alpha"
    if "beta" in value:
        return "beta"
    if "rc" in value:
        return "rc"
    return "stable"
