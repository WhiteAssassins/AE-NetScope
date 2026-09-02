import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE_URL,
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  beginTotpSetup,
  confirmTotp,
  deletePasskey,
  disableTotp,
  fetchInventoryData,
  fetchHealthStatus,
  fetchMaintenanceStatus,
  fetchOwnSessions,
  fetchPasskeyCapability,
  fetchPasskeys,
  fetchReleaseHistory,
  fetchRepositoryInfo,
  fetchSearchIndexingPolicy,
  fetchUpdateHistory,
  fetchUpdateStatus,
  fetchVersionInfo,
  revokeOtherSessions,
  startAutomaticUpdate,
  updateAccountPreferences,
  updateMaintenanceStatus,
  updateRegionalPreferences,
  updateSearchIndexingPolicy,
  updatePreferredLanguage,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
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
      if (url.endsWith("/quality")) return Promise.resolve(jsonResponse({ score: 100 }));
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
    expect(data.quality).toEqual({ score: 100 });
    expect(fetchMock).toHaveBeenCalledTimes(8);
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
    expect(data.quality).toBeNull();
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

  it("fetches cached GitHub repository information from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            html_url: "https://github.com/WhiteAssassins/AE-NetScope",
            stargazers_count: 42,
            forks_count: 7,
            open_issues_count: 3,
          }),
        ),
      ),
    );

    await expect(fetchRepositoryInfo()).resolves.toMatchObject({
      stargazers_count: 42,
      forks_count: 7,
    });
    expect(fetch).toHaveBeenCalledWith(`${API_BASE_URL}/version/repository`);
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

  it("falls back to the public health summary when the database blocks authentication", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "degraded",
          checks: { database: { status: "error", required: true } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHealthStatus()).resolves.toMatchObject({
      status: "degraded",
      checks: { database: { status: "error" } },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/health/summary`);
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

  it("fetches release notes only through the backend history endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse([
            {
              tag_name: "v0.1.8-alpha",
              html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.8-alpha",
              name: "AE NetScope v0.1.8-alpha",
              prerelease: true,
              draft: false,
              published_at: "2026-07-01T00:00:00Z",
              body: "Release changes",
              body_truncated: false,
            },
          ]),
        ),
      ),
    );

    await expect(fetchReleaseHistory(8)).resolves.toEqual([
      expect.objectContaining({ tag_name: "v0.1.8-alpha", body: "Release changes" }),
    ]);
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/version/releases?channel=all&limit=8`,
      { credentials: "include" },
    );
  });

  it("reports unavailable release history", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, 503))));

    await expect(fetchReleaseHistory()).rejects.toThrow("release-history-unavailable");
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
            tag_name: "v0.1.9-alpha",
          }),
        ),
      ),
    );

    await expect(startAutomaticUpdate("v0.1.9-alpha", "csrf-token")).resolves.toMatchObject({
      started: true,
      tag_name: "v0.1.9-alpha",
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
        body: JSON.stringify({ tag_name: "v0.1.9-alpha" }),
      }),
    );
  });

  it("uses server detail when automatic update fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ detail: "Automatic updates disabled." }, 409))),
    );

    await expect(startAutomaticUpdate("v0.1.9-alpha", "csrf-token")).rejects.toThrow(
      "Automatic updates disabled.",
    );
  });

  it("persists the preferred language with csrf protection", async () => {
    const user = {
      id: 1,
      email: "admin@example.com",
      username: "admin",
      role: "admin",
      permissions: [],
      must_change_password: false,
      preferred_language: "es",
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ user }))));

    await expect(updatePreferredLanguage("es", "csrf-token")).resolves.toEqual({ user });
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/preferences/language`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
        body: JSON.stringify({ language: "es" }),
      }),
    );
  });

  it("loads and updates the search indexing policy", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ allow_indexing: false }))
      .mockResolvedValueOnce(jsonResponse({ allow_indexing: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSearchIndexingPolicy()).resolves.toEqual({ allow_indexing: false });
    await expect(
      updateSearchIndexingPolicy({ allow_indexing: true }, "csrf-token"),
    ).resolves.toEqual({ allow_indexing: true });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_BASE_URL}/security/search-indexing`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
        body: JSON.stringify({ allow_indexing: true }),
      }),
    );
  });

  it("uses the authenticated account and TOTP endpoints", async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/sessions/others") && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(jsonResponse({ user: { id: 1 }, secret: "secret", otpauth_uri: "uri" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateRegionalPreferences(
      { timezone: "UTC", date_format: "ymd", hour_format: "24" },
      "csrf",
    );
    await updateAccountPreferences(
      { language: "en", timezone: "UTC", date_format: "locale", hour_format: "12" },
      "csrf",
    );
    await fetchOwnSessions();
    await revokeOtherSessions("csrf");
    await beginTotpSetup("password", "csrf");
    await confirmTotp("123456", "csrf");
    await disableTotp("password", "123456", "csrf");

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/preferences/regional`,
      expect.objectContaining({ method: "PATCH", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/sessions/others`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/totp`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("uses every passkey endpoint with the expected methods", async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/security/passkeys/7") && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(jsonResponse({ challenge_id: "challenge", options: {}, id: 7 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPasskeyCapability();
    await fetchPasskeys();
    await beginPasskeyRegistration("password", "csrf");
    await verifyPasskeyRegistration("challenge", "Laptop", { id: "key" }, "csrf");
    await deletePasskey(7, "password", "csrf");
    await beginPasskeyAuthentication("admin@example.com");
    await verifyPasskeyAuthentication("challenge", { id: "key" });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/security/passkeys/register/verify`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/security/passkeys/7`,
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ current_password: "password" }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/security/passkeys/authenticate/verify`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("loads and updates maintenance state and update history", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ enabled: false, message: "", items: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchMaintenanceStatus();
    await updateMaintenanceStatus({ enabled: true, message: "Maintenance" }, "csrf");
    await fetchUpdateHistory();

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/security/maintenance`,
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/security/maintenance`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/version/update-history`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("surfaces structured and fallback API errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ detail: { message: "Policy denied" } }, 403))
      .mockResolvedValueOnce(new Response("not-json", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMaintenanceStatus()).rejects.toThrow("Policy denied");
    await expect(fetchPasskeys()).rejects.toThrow("request-failed");
  });
});
