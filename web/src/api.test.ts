import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE_URL,
  GITHUB_RELEASES_API_URL,
  fetchInventoryData,
  fetchHealthStatus,
  fetchLatestGitHubRelease,
  fetchUpdateStatus,
  fetchVersionInfo,
  startAutomaticUpdate,
} from "./api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches every inventory resource with credentials", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/dashboard")) return Promise.resolve(jsonResponse({ stats: {} }));
      if (url.endsWith("/devices")) return Promise.resolve(jsonResponse([{ id: 1, name: "SW" }]));
      if (url.endsWith("/networks")) return Promise.resolve(jsonResponse([{ id: 2 }]));
      if (url.endsWith("/vlans")) return Promise.resolve(jsonResponse([{ id: 3 }]));
      if (url.endsWith("/services")) return Promise.resolve(jsonResponse([{ id: 4 }]));
      if (url.endsWith("/ip-addresses")) return Promise.resolve(jsonResponse([{ id: 5 }]));
      if (url.endsWith("/interfaces")) return Promise.resolve(jsonResponse([{ id: 6 }]));
      return Promise.resolve(jsonResponse({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchInventoryData();

    expect(data.dashboard).toEqual({ stats: {} });
    expect(data.devices).toEqual([{ id: 1, name: "SW" }]);
    expect(data.networks).toEqual([{ id: 2 }]);
    expect(data.vlans).toEqual([{ id: 3 }]);
    expect(data.services).toEqual([{ id: 4 }]);
    expect(data.ipMacs).toEqual([{ id: 5 }]);
    expect(data.interfaces).toEqual([{ id: 6 }]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/inventory/dashboard`, {
      credentials: "include",
    });
  });

  it("throws unauthorized when the session is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/dashboard")) return Promise.resolve(jsonResponse({}, 401));
        return Promise.resolve(jsonResponse([]));
      }),
    );

    await expect(fetchInventoryData()).rejects.toThrow("unauthorized");
  });

  it("returns empty lists when optional inventory resources fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/dashboard")) return Promise.resolve(jsonResponse({ stats: {} }));
        if (url.endsWith("/devices")) return Promise.resolve(jsonResponse([]));
        return Promise.resolve(jsonResponse({ error: "fail" }, 500));
      }),
    );

    const data = await fetchInventoryData();

    expect(data.devices).toEqual([]);
    expect(data.networks).toEqual([]);
    expect(data.vlans).toEqual([]);
    expect(data.services).toEqual([]);
    expect(data.ipMacs).toEqual([]);
    expect(data.interfaces).toEqual([]);
  });

  it("fetches installed version information from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            app_name: "AE NetScope",
            version: "0.1.6-alpha",
            release_channel: "alpha",
            repository_url: "https://github.com/WhiteAssassins/AE-NetScope",
            releases_url: "https://github.com/WhiteAssassins/AE-NetScope/releases",
            release_notes_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.6-alpha",
          }),
        ),
      ),
    );

    await expect(fetchVersionInfo()).resolves.toMatchObject({
      app_name: "AE NetScope",
      version: "0.1.6-alpha",
      release_channel: "alpha",
    });
  });

  it("fetches detailed health status from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            status: "ready",
            service: "AE NetScope",
            environment: "local",
            version: "0.1.6-alpha",
            release_channel: "alpha",
            checked_at: "2026-06-03T00:00:00Z",
            checks: {
              api: { status: "ok", required: true, message: "API process is responding." },
              database: { status: "ok", required: true, message: "Database responded." },
              redis: { status: "ok", required: true, message: "Redis ping succeeded." },
            },
          }),
        ),
      ),
    );

    await expect(fetchHealthStatus()).resolves.toMatchObject({
      status: "ready",
      version: "0.1.6-alpha",
      checks: expect.objectContaining({
        database: expect.objectContaining({ status: "ok" }),
      }),
    });
  });

  it("returns the first non-draft GitHub release", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse([
            { tag_name: "v0.2.0-alpha", draft: true },
            {
              tag_name: "v0.1.6-alpha",
              html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.6-alpha",
              name: "AE NetScope v0.1.6-alpha",
              prerelease: true,
              draft: false,
              published_at: "2026-06-03T00:00:00Z",
            },
          ]),
        ),
      ),
    );

    await expect(fetchLatestGitHubRelease()).resolves.toMatchObject({
      tag_name: "v0.1.6-alpha",
      prerelease: true,
    });
    expect(fetch).toHaveBeenCalledWith(GITHUB_RELEASES_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
  });

  it("fetches update status with credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            installed_version: "0.1.6-alpha",
            installed_channel: "alpha",
            target_channel: "prerelease",
            update_available: false,
            latest_release: null,
            latest_prerelease: null,
            selected_release: null,
            update_capability: {
              platform: "docker",
              automatic_updates_enabled: false,
              automatic_updates_supported: false,
              reason: "Not configured.",
            },
          }),
        ),
      ),
    );

    await expect(fetchUpdateStatus()).resolves.toMatchObject({
      installed_version: "0.1.6-alpha",
      update_available: false,
    });
    expect(fetch).toHaveBeenCalledWith(`${API_BASE_URL}/version/updates`, {
      credentials: "include",
    });
  });

  it("throws update status error when the endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, 503))));

    await expect(fetchUpdateStatus()).rejects.toThrow("update-status-unavailable");
  });

  it("starts automatic updates with csrf and selected tag", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            started: true,
            message: "Update command started.",
            tag_name: "v0.1.7-alpha",
          }),
        ),
      ),
    );

    await expect(startAutomaticUpdate("v0.1.7-alpha", "csrf-token")).resolves.toMatchObject({
      started: true,
      tag_name: "v0.1.7-alpha",
    });
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/version/update`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-token",
        }),
        body: JSON.stringify({ tag_name: "v0.1.7-alpha" }),
      }),
    );
  });

  it("uses server detail when automatic update fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ detail: "Automatic updates disabled." }, 409))),
    );

    await expect(startAutomaticUpdate("v0.1.7-alpha", "csrf-token")).rejects.toThrow(
      "Automatic updates disabled.",
    );
  });
});
