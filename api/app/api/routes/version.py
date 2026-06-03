from fastapi import APIRouter

from app.core.config import settings
from app.core.version import (
    PROJECT_RELEASES_URL,
    PROJECT_REPOSITORY_URL,
    project_version,
    release_channel,
)

router = APIRouter()


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
