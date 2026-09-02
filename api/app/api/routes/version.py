import asyncio
import json
import re
import shlex
import subprocess
import urllib.request
from time import monotonic
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep, require_csrf, require_permission
from app.core.config import settings
from app.core.rate_limit import rate_limit
from app.core.version import (
    PROJECT_RELEASES_URL,
    PROJECT_REPOSITORY_URL,
    project_version,
    release_channel,
)
from app.db.session import SessionLocal
from app.models.security import UpdateHistory
from app.models.user import User
from app.schemas.security import UpdateHistoryResponse
from app.schemas.version import (
    ReleaseDetails,
    RepositoryInfo,
    UpdateCapability,
    UpdateRequest,
    UpdateStartResponse,
    UpdateStatusResponse,
)

router = APIRouter()
GITHUB_RELEASES_API_URL = "https://api.github.com/repos/WhiteAssassins/AE-NetScope/releases"
RELEASE_TAG_PATTERN = re.compile(r"^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$")
RELEASE_CACHE_TTL_SECONDS = 600
MAX_RELEASE_BODY_CHARACTERS = 20_000
MAX_GITHUB_RESPONSE_BYTES = 1_000_000
MAX_RELEASE_OBJECTS = 20
GITHUB_ERROR_CACHE_TTL_SECONDS = 30
REPOSITORY_CACHE_TTL_SECONDS = 3600
GITHUB_REPOSITORY_API_URL = "https://api.github.com/repos/WhiteAssassins/AE-NetScope"
_release_cache: tuple[float, list[ReleaseDetails]] | None = None
_repository_cache: tuple[float, RepositoryInfo] | None = None
_release_error_until = 0.0
_repository_error_until = 0.0
_release_refresh_task: asyncio.Task[list[ReleaseDetails]] | None = None
_repository_refresh_task: asyncio.Task[RepositoryInfo] | None = None
_update_monitor_tasks: set[asyncio.Task[None]] = set()


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


@router.get(
    "/version/repository",
    response_model=RepositoryInfo,
    dependencies=[Depends(rate_limit("version.repository", limit=30))],
)
async def repository_info() -> RepositoryInfo:
    try:
        return await fetch_repository_info_cached()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub repository information is temporarily unavailable.",
        ) from exc


@router.get(
    "/version/updates",
    response_model=UpdateStatusResponse,
    dependencies=[Depends(rate_limit("version.updates", limit=30))],
)
async def update_status() -> UpdateStatusResponse:
    current_version = project_version()
    current_channel = release_channel(current_version)
    release_error: str | None = None
    try:
        releases = await fetch_github_releases_cached()
    except Exception:
        releases = []
        release_error = "GitHub releases could not be checked right now."

    latest_release = latest_versioned_release(releases, prerelease=False)
    latest_prerelease = latest_versioned_release(releases, prerelease=True)
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


@router.get(
    "/version/releases",
    response_model=list[ReleaseDetails],
    dependencies=[Depends(rate_limit("version.releases", limit=30))],
)
async def release_history(
    channel: Literal["all", "stable", "prerelease"] = "all",
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
) -> list[ReleaseDetails]:
    try:
        releases = await fetch_github_releases_cached()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub release notes are temporarily unavailable.",
        ) from exc

    visible_releases = [release for release in releases if not release.draft]
    if channel == "stable":
        visible_releases = [release for release in visible_releases if not release.prerelease]
    elif channel == "prerelease":
        visible_releases = [release for release in visible_releases if release.prerelease]
    return visible_releases[:limit]


@router.post(
    "/version/update",
    response_model=UpdateStartResponse,
    dependencies=[Depends(require_csrf), Depends(require_permission("settings:manage"))],
)
async def start_update(
    payload: UpdateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> UpdateStartResponse:
    capability = update_capability()
    if not capability.automatic_updates_supported:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=capability.reason)
    if not settings.auto_update_enabled or not settings.auto_update_command:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Automatic updates are not configured for this installation.",
        )

    command = settings.auto_update_command
    tag_name: str | None = None
    # Validate whenever the field was supplied. A blank value must not fall through
    # to the unsubstituted command, which would launch it with a literal {tag}.
    if payload.tag_name is not None:
        tag_name = payload.tag_name.strip()
        if not is_valid_release_tag(tag_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid release tag.",
            )
        command = command.replace("{tag}", tag_name)

    command_args = shlex.split(command)
    if not command_args:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Automatic update command is empty.",
        )

    target_tag = tag_name or "configured-target"
    try:
        process = subprocess.Popen(command_args, shell=False, cwd="/app")  # noqa: S603
    except OSError as exc:
        session.add(
            UpdateHistory(
                requested_by_user_id=current_user.id,
                target_tag=target_tag,
                status="failed",
                message=f"Update command could not be started: {exc.__class__.__name__}",
            )
        )
        await session.commit()
        raise HTTPException(status_code=500, detail="Update command could not be started.") from exc
    history = UpdateHistory(
        requested_by_user_id=current_user.id,
        target_tag=target_tag,
        status="started",
        message="The configured update command was started.",
    )
    session.add(history)
    await session.commit()
    if history.id is not None:
        task = asyncio.create_task(monitor_update_process(process, history.id))
        _update_monitor_tasks.add(task)
        task.add_done_callback(_update_monitor_tasks.discard)
    return UpdateStartResponse(
        started=True,
        message="Update command started. The app may restart when the container is replaced.",
        tag_name=tag_name,
    )


async def monitor_update_process(process: subprocess.Popen, history_id: int) -> None:
    try:
        return_code = await asyncio.to_thread(process.wait)
        async with SessionLocal() as session:
            history = await session.get(UpdateHistory, history_id)
            if history is None:
                return
            history.status = "succeeded" if return_code == 0 else "failed"
            history.message = (
                "The update command completed successfully."
                if return_code == 0
                else f"The update command exited with status {return_code}."
            )
            await session.commit()
    except Exception:
        # A replacement container reconciles interrupted rows during its next startup.
        return


@router.get(
    "/version/update-history",
    response_model=list[UpdateHistoryResponse],
    dependencies=[Depends(require_permission("settings:manage"))],
)
async def update_history(session: SessionDep) -> list[UpdateHistoryResponse]:
    rows = (
        await session.execute(
            select(UpdateHistory, User)
            .outerjoin(User, User.id == UpdateHistory.requested_by_user_id)
            .order_by(UpdateHistory.created_at.desc(), UpdateHistory.id.desc())
            .limit(50)
        )
    ).all()
    return [
        UpdateHistoryResponse(
            id=item.id,
            requested_by_user_id=item.requested_by_user_id,
            requested_by=user.email if user else None,
            target_tag=item.target_tag,
            status=item.status,
            message=item.message,
            created_at=item.created_at,
        )
        for item, user in rows
    ]


async def fetch_github_releases_cached() -> list[ReleaseDetails]:
    global _release_cache, _release_error_until, _release_refresh_task
    now = monotonic()
    if _release_cache and now - _release_cache[0] < RELEASE_CACHE_TTL_SECONDS:
        return _release_cache[1]
    if now < _release_error_until:
        raise RuntimeError("GitHub release refresh is temporarily unavailable.")

    task = _release_refresh_task
    if task is None or task.done():
        task = asyncio.create_task(asyncio.to_thread(fetch_github_releases))
        _release_refresh_task = task
    try:
        releases = await asyncio.shield(task)
    except Exception:
        if _release_refresh_task is task:
            _release_refresh_task = None
        _release_error_until = monotonic() + GITHUB_ERROR_CACHE_TTL_SECONDS
        raise
    _release_cache = (now, releases)
    _release_error_until = 0.0
    if _release_refresh_task is task:
        _release_refresh_task = None
    return releases


def clear_release_cache() -> None:
    global _release_cache, _release_error_until, _release_refresh_task
    _release_cache = None
    _release_error_until = 0.0
    _release_refresh_task = None


def fetch_github_releases() -> list[ReleaseDetails]:
    request = urllib.request.Request(
        GITHUB_RELEASES_API_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "AE-NetScope",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = _read_json_response(response)
    if not isinstance(payload, list):
        raise ValueError("GitHub releases response must be a list.")
    releases: list[ReleaseDetails] = []
    for item in payload[:MAX_RELEASE_OBJECTS]:
        if not isinstance(item, dict):
            continue
        body = item.get("body")
        body_truncated = isinstance(body, str) and len(body) > MAX_RELEASE_BODY_CHARACTERS
        if body_truncated:
            body = body[:MAX_RELEASE_BODY_CHARACTERS]
        releases.append(
            ReleaseDetails.model_validate(
                {**item, "body": body, "body_truncated": body_truncated}
            )
        )
    return releases


async def fetch_repository_info_cached() -> RepositoryInfo:
    global _repository_cache, _repository_error_until, _repository_refresh_task
    now = monotonic()
    if _repository_cache and now - _repository_cache[0] < REPOSITORY_CACHE_TTL_SECONDS:
        return _repository_cache[1]
    if now < _repository_error_until:
        raise RuntimeError("GitHub repository refresh is temporarily unavailable.")

    task = _repository_refresh_task
    if task is None or task.done():
        task = asyncio.create_task(asyncio.to_thread(fetch_repository_info))
        _repository_refresh_task = task
    try:
        repository = await asyncio.shield(task)
    except Exception:
        if _repository_refresh_task is task:
            _repository_refresh_task = None
        _repository_error_until = monotonic() + GITHUB_ERROR_CACHE_TTL_SECONDS
        raise
    _repository_cache = (now, repository)
    _repository_error_until = 0.0
    if _repository_refresh_task is task:
        _repository_refresh_task = None
    return repository


def clear_repository_cache() -> None:
    global _repository_cache, _repository_error_until, _repository_refresh_task
    _repository_cache = None
    _repository_error_until = 0.0
    _repository_refresh_task = None


def fetch_repository_info() -> RepositoryInfo:
    request = urllib.request.Request(
        GITHUB_REPOSITORY_API_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "AE-NetScope",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = _read_json_response(response)
    if not isinstance(payload, dict):
        raise ValueError("GitHub repository response must be an object.")
    return RepositoryInfo.model_validate(payload)


def _read_json_response(response) -> object:
    payload = response.read(MAX_GITHUB_RESPONSE_BYTES + 1)
    if len(payload) > MAX_GITHUB_RESPONSE_BYTES:
        raise ValueError("GitHub response exceeded the configured size limit.")
    return json.loads(payload.decode("utf-8"))


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


def version_sort_key(
    value: str,
) -> tuple[int, int, int, int, tuple[tuple[int, int | str], ...]] | None:
    normalized = normalize_version(value)
    match = re.fullmatch(
        r"(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)(?:-(?P<pre>[A-Za-z0-9][A-Za-z0-9.-]*))?",
        normalized,
    )
    if not match:
        return None
    prerelease = match.group("pre") or ""
    stable_rank = 1 if not prerelease else 0
    prerelease_key = tuple(
        (0, int(identifier)) if identifier.isdigit() else (1, identifier.casefold())
        for identifier in prerelease.split(".")
        if identifier
    )
    return (
        int(match.group("major")),
        int(match.group("minor")),
        int(match.group("patch")),
        stable_rank,
        prerelease_key,
    )


def latest_versioned_release(
    releases: list[ReleaseDetails],
    *,
    prerelease: bool,
) -> ReleaseDetails | None:
    candidates = [
        (key, release)
        for release in releases
        if not release.draft and release.prerelease is prerelease
        if (key := version_sort_key(release.tag_name)) is not None
    ]
    return max(candidates, key=lambda candidate: candidate[0])[1] if candidates else None
