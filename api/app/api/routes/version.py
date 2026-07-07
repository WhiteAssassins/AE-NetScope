import asyncio
import json
import re
import shlex
import subprocess
import urllib.request
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_csrf, require_permission
from app.core.config import settings
from app.core.version import (
    PROJECT_RELEASES_URL,
    PROJECT_REPOSITORY_URL,
    project_version,
    release_channel,
)
from app.schemas.version import (
    ReleaseInfo,
    UpdateCapability,
    UpdateRequest,
    UpdateStartResponse,
    UpdateStatusResponse,
)

router = APIRouter()
GITHUB_RELEASES_API_URL = "https://api.github.com/repos/WhiteAssassins/AE-NetScope/releases"
RELEASE_TAG_PATTERN = re.compile(r"^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$")
RELEASE_CACHE_TTL_SECONDS = 600
_release_cache: tuple[float, list[ReleaseInfo]] | None = None


@router.get("/version")
async def version() -> dict[str, str]:
    current_version = project_version()
    return {
        "app_name": settings.app_name,
        "version": current_version,
        "release_channel": release_channel(current_version),
        "repository_url": PROJECT_REPOSITORY_URL,
        "releases_url": PROJECT_RELEASES_URL,
        "release_notes_url": f"{PROJECT_RELEASES_URL}/tag/v{current_version}",
    }


@router.get("/version/updates", response_model=UpdateStatusResponse)
async def update_status() -> UpdateStatusResponse:
    current_version = project_version()
    current_channel = release_channel(current_version)
    release_error: str | None = None
    try:
        releases = await asyncio.to_thread(fetch_github_releases_cached)
    except Exception:
        releases = []
        release_error = "GitHub releases could not be checked right now."

    latest_release = next(
        (release for release in releases if not release.draft and not release.prerelease),
        None,
    )
    latest_prerelease = next(
        (release for release in releases if not release.draft and release.prerelease),
        None,
    )
    selected_release = latest_prerelease if current_channel != "stable" else latest_release
    if selected_release is None:
        selected_release = latest_release or latest_prerelease

    return UpdateStatusResponse(
        installed_version=current_version,
        installed_channel=current_channel,
        target_channel="prerelease" if current_channel != "stable" else "release",
        update_available=bool(
            selected_release and is_release_newer(selected_release.tag_name, current_version)
        ),
        latest_release=latest_release,
        latest_prerelease=latest_prerelease,
        selected_release=selected_release,
        update_capability=update_capability(release_error),
    )


@router.post(
    "/version/update",
    response_model=UpdateStartResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("settings:manage"))],
)
async def start_update(payload: UpdateRequest) -> UpdateStartResponse:
    capability = update_capability()
    if not capability.automatic_updates_supported:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=capability.reason)
    if not settings.auto_update_enabled or not settings.auto_update_command:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Automatic updates are not configured for this installation.",
        )

    command = settings.auto_update_command
    if payload.tag_name:
        if not is_valid_release_tag(payload.tag_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid release tag.",
            )
        command = command.replace("{tag}", payload.tag_name)

    command_args = shlex.split(command)
    if not command_args:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Automatic update command is empty.",
        )

    subprocess.Popen(command_args, shell=False, cwd="/app")  # noqa: S603
    return UpdateStartResponse(
        started=True,
        message="Update command started. The app may restart when the container is replaced.",
        tag_name=payload.tag_name,
    )


def fetch_github_releases_cached() -> list[ReleaseInfo]:
    global _release_cache
    now = monotonic()
    if _release_cache and now - _release_cache[0] < RELEASE_CACHE_TTL_SECONDS:
        return _release_cache[1]

    releases = fetch_github_releases()
    _release_cache = (now, releases)
    return releases


def clear_release_cache() -> None:
    global _release_cache
    _release_cache = None


def fetch_github_releases() -> list[ReleaseInfo]:
    request = urllib.request.Request(
        GITHUB_RELEASES_API_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "AE-NetScope",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return [ReleaseInfo.model_validate(item) for item in payload]


def update_capability(reason_prefix: str | None = None) -> UpdateCapability:
    platform = settings.deployment_platform.lower()
    if platform == "truenas":
        return UpdateCapability(
            platform=platform,
            automatic_updates_enabled=False,
            automatic_updates_supported=False,
            reason=combine_reasons(
                reason_prefix,
                "TrueNAS installations must be updated from the TrueNAS Apps interface.",
            ),
        )
    if platform not in {"docker", "docker-compose"}:
        return UpdateCapability(
            platform=platform,
            automatic_updates_enabled=settings.auto_update_enabled,
            automatic_updates_supported=False,
            reason=combine_reasons(
                reason_prefix,
                "Automatic updates are only supported for explicitly configured Docker installs.",
            ),
        )
    if not settings.auto_update_enabled or not settings.auto_update_command:
        return UpdateCapability(
            platform=platform,
            automatic_updates_enabled=settings.auto_update_enabled,
            automatic_updates_supported=False,
            reason=combine_reasons(
                reason_prefix,
                "Set AE_NETSCOPE_AUTO_UPDATE_ENABLED=true and "
                "AE_NETSCOPE_AUTO_UPDATE_COMMAND to enable this.",
            ),
        )
    return UpdateCapability(
        platform=platform,
        automatic_updates_enabled=True,
        automatic_updates_supported=True,
        reason=reason_prefix,
    )


def combine_reasons(*reasons: str | None) -> str | None:
    active_reasons = [reason for reason in reasons if reason]
    return " ".join(active_reasons) if active_reasons else None


def normalize_version(value: str) -> str:
    return value.strip().removeprefix("v").removeprefix("V")


def is_valid_release_tag(value: str) -> bool:
    return bool(RELEASE_TAG_PATTERN.fullmatch(value.strip()))


def is_release_newer(candidate: str, installed: str) -> bool:
    candidate_key = version_sort_key(candidate)
    installed_key = version_sort_key(installed)
    if candidate_key and installed_key:
        return candidate_key > installed_key
    return normalize_version(candidate) != normalize_version(installed)


def version_sort_key(value: str) -> tuple[int, int, int, int, str] | None:
    normalized = normalize_version(value)
    match = re.fullmatch(
        r"(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)(?:-(?P<pre>[A-Za-z0-9][A-Za-z0-9.-]*))?",
        normalized,
    )
    if not match:
        return None
    prerelease = match.group("pre") or ""
    stable_rank = 1 if not prerelease else 0
    return (
        int(match.group("major")),
        int(match.group("minor")),
        int(match.group("patch")),
        stable_rank,
        prerelease,
    )
