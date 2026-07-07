import json
import tomllib
from pathlib import Path


def normalize_python_version(value: str) -> str:
    return value.replace("a0", "-alpha")


def test_project_versions_are_aligned() -> None:
    root = Path(__file__).resolve().parents[2]
    public_version = (root / "VERSION").read_text(encoding="utf-8").strip()
    package_json = json.loads((root / "package.json").read_text(encoding="utf-8"))
    web_package_json = json.loads((root / "web" / "package.json").read_text(encoding="utf-8"))
    api_project = tomllib.loads((root / "api" / "pyproject.toml").read_text(encoding="utf-8"))

    assert package_json["version"] == public_version
    assert web_package_json["version"] == public_version
    assert normalize_python_version(api_project["project"]["version"]) == public_version
