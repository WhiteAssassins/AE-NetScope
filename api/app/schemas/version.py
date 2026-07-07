from pydantic import BaseModel


class ReleaseInfo(BaseModel):
    tag_name: str
    html_url: str
    name: str | None = None
    prerelease: bool
    draft: bool
    published_at: str | None = None


class UpdateCapability(BaseModel):
    platform: str
    automatic_updates_enabled: bool
    automatic_updates_supported: bool
    reason: str | None = None


class UpdateStatusResponse(BaseModel):
    installed_version: str
    installed_channel: str
    target_channel: str
    update_available: bool
    latest_release: ReleaseInfo | None = None
    latest_prerelease: ReleaseInfo | None = None
    selected_release: ReleaseInfo | None = None
    update_capability: UpdateCapability


class UpdateRequest(BaseModel):
    tag_name: str | None = None


class UpdateStartResponse(BaseModel):
    started: bool
    message: str
    tag_name: str | None = None
