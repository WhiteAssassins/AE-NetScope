import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UpdateView from "./UpdateView";

const installedVersion = {
  app_name: "AE NetScope",
  version: "0.1.6-alpha",
  release_channel: "alpha",
  repository_url: "https://github.com/WhiteAssassins/AE-NetScope",
  releases_url: "https://github.com/WhiteAssassins/AE-NetScope/releases",
  release_notes_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.6-alpha",
};

const updateStatus = {
  installed_version: "0.1.6-alpha",
  installed_channel: "alpha",
  target_channel: "prerelease",
  update_available: false,
  latest_release: {
    tag_name: "v0.1.4",
    html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.4",
    name: "AE NetScope v0.1.4",
    prerelease: false,
    draft: false,
    published_at: "2026-06-01T00:00:00Z",
  },
  latest_prerelease: {
    tag_name: "v0.1.6-alpha",
    html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.6-alpha",
    name: "AE NetScope v0.1.6-alpha",
    prerelease: true,
    draft: false,
    published_at: "2026-06-03T00:00:00Z",
  },
  selected_release: {
    tag_name: "v0.1.6-alpha",
    html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.6-alpha",
    name: "AE NetScope v0.1.6-alpha",
    prerelease: true,
    draft: false,
    published_at: "2026-06-03T00:00:00Z",
  },
  update_capability: {
    platform: "docker",
    automatic_updates_enabled: false,
    automatic_updates_supported: false,
    reason: "Set AE_NETSCOPE_AUTO_UPDATE_ENABLED=true and AE_NETSCOPE_AUTO_UPDATE_COMMAND to enable this.",
  },
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(url: string | URL | Request) {
  if (typeof url === "string") {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  if ("url" in url) {
    return url.url;
  }
  return String(url);
}

describe("UpdateView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        if (requestUrl(url).includes("/version/updates")) {
          return Promise.resolve(jsonResponse(updateStatus));
        }
        return Promise.resolve(jsonResponse(installedVersion));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows current installed version, release channels, and upgrade checklist", async () => {
    render(
      <UpdateView
        csrfToken="csrf"
        initialVersionInfo={installedVersion}
        permissions={["settings:manage"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Updates" })).toBeInTheDocument();
    expect(screen.getByText("v0.1.6-alpha")).toBeInTheDocument();
    expect(await screen.findByText("Up to date")).toBeInTheDocument();
    expect(screen.getByText(/stable release/i)).toBeInTheDocument();
    expect(screen.getAllByText(/prerelease/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/PostgreSQL backup/i)).toBeInTheDocument();
  });

  it("loads and filters recent changelogs only when requested", async () => {
    const user = userEvent.setup();
    const releases = [
      {
        ...updateStatus.latest_prerelease,
        body: "Added safer updates.\n<script>not executable</script>",
        body_truncated: false,
      },
      {
        ...updateStatus.latest_release,
        body: "Stable maintenance release.",
        body_truncated: false,
      },
    ];
    const fetchMock = vi.fn((url: string | URL | Request) => {
      const urlText = requestUrl(url);
      if (urlText.includes("/version/updates")) {
        return Promise.resolve(jsonResponse(updateStatus));
      }
      if (urlText.includes("/version/releases")) {
        return Promise.resolve(jsonResponse(releases));
      }
      return Promise.resolve(jsonResponse(installedVersion));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UpdateView
        csrfToken="csrf"
        initialVersionInfo={installedVersion}
        permissions={["settings:manage"]}
      />,
    );

    expect(await screen.findByText("Up to date")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => requestUrl(url).includes("/version/releases")),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: /view recent changes/i }));

    expect(await screen.findByText("Added safer updates.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Stable maintenance release.")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        requestUrl(url).includes("/version/releases?channel=all&limit=8"),
      ),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Stable" }));
    expect(screen.getByText("Stable maintenance release.")).toBeInTheDocument();
    expect(screen.queryByText("Added safer updates.", { exact: false })).not.toBeInTheDocument();
  });

  it("can retry loading release notes after a GitHub failure", async () => {
    const user = userEvent.setup();
    let releaseAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlText = requestUrl(url);
        if (urlText.includes("/version/updates")) {
          return Promise.resolve(jsonResponse(updateStatus));
        }
        if (urlText.includes("/version/releases")) {
          releaseAttempts += 1;
          return Promise.resolve(
            releaseAttempts === 1
              ? jsonResponse({}, 503)
              : jsonResponse([
                  {
                    ...updateStatus.latest_prerelease,
                    body: "Recovered changelog.",
                    body_truncated: false,
                  },
                ]),
          );
        }
        return Promise.resolve(jsonResponse(installedVersion));
      }),
    );

    render(
      <UpdateView
        csrfToken="csrf"
        initialVersionInfo={installedVersion}
        permissions={["settings:manage"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /view recent changes/i }));
    expect(await screen.findByText(/could not be loaded from GitHub/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Recovered changelog.")).toBeInTheDocument();
  });

  it("shows update available and can start automatic docker update when configured", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlText = requestUrl(url);
      if (urlText.includes("/version/updates")) {
        return Promise.resolve(
          jsonResponse({
            ...updateStatus,
            update_available: true,
            latest_prerelease: {
              ...updateStatus.latest_prerelease,
              tag_name: "v0.1.8-alpha",
              html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.8-alpha",
            },
            selected_release: {
              ...updateStatus.selected_release,
              tag_name: "v0.1.8-alpha",
              html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.8-alpha",
            },
            update_capability: {
              platform: "docker",
              automatic_updates_enabled: true,
              automatic_updates_supported: true,
              reason: null,
            },
          }),
        );
      }
      if (urlText.includes("/version/update")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual(
          expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
        );
        return Promise.resolve(
          jsonResponse({
            started: true,
            message: "Update command started.",
            tag_name: "v0.1.8-alpha",
          }),
        );
      }
      return Promise.resolve(jsonResponse(installedVersion));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UpdateView
        csrfToken="csrf-token"
        initialVersionInfo={installedVersion}
        permissions={["settings:manage"]}
      />,
    );

    expect(
      await screen.findByText((content) => content.includes("Update") && content.includes("available")),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /update automatically/i }));

    expect(
      await screen.findByText("The update command was started. AE NetScope may restart."),
    ).toBeInTheDocument();
  });

  it("explains that TrueNAS updates must use the TrueNAS interface", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        if (requestUrl(url).includes("/version/updates")) {
          return Promise.resolve(
            jsonResponse({
              ...updateStatus,
              update_available: true,
              update_capability: {
                platform: "truenas",
                automatic_updates_enabled: false,
                automatic_updates_supported: false,
                reason: "TrueNAS installations must be updated from the TrueNAS Apps interface.",
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse(installedVersion));
      }),
    );

    render(
      <UpdateView
        csrfToken="csrf"
        initialVersionInfo={installedVersion}
        permissions={["settings:manage"]}
      />,
    );

    expect(
      await screen.findByText("TrueNAS installations must be updated from the TrueNAS Apps interface."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update automatically/i })).toBeDisabled();
  });
});
