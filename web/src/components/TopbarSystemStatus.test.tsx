import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HealthStatus, UpdateStatusInfo, VersionInfo } from "../types";
import TopbarSystemStatus from "./TopbarSystemStatus";

const version: VersionInfo = {
  app_name: "AE NetScope",
  version: "0.1.8-alpha",
  release_channel: "alpha",
  repository_url: "https://github.com/WhiteAssassins/AE-NetScope",
  releases_url: "https://github.com/WhiteAssassins/AE-NetScope/releases",
  release_notes_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.8-alpha",
};

const health: HealthStatus = {
  status: "ready",
  service: "AE NetScope",
  environment: "local",
  version: "0.1.8-alpha",
  release_channel: "alpha",
  checked_at: "2026-07-20T00:00:00Z",
  checks: {},
};

const updateStatus: UpdateStatusInfo = {
  installed_version: "0.1.8-alpha",
  installed_channel: "alpha",
  target_channel: "prerelease",
  update_available: true,
  latest_release: null,
  latest_prerelease: null,
  selected_release: null,
  update_capability: {
    platform: "docker",
    automatic_updates_enabled: false,
    automatic_updates_supported: false,
    reason: null,
  },
};

describe("TopbarSystemStatus", () => {
  it("shows health, installed version, and the update indicator", async () => {
    const user = userEvent.setup();
    const openHealth = vi.fn();
    const openUpdates = vi.fn();
    render(
      <TopbarSystemStatus
        health={health}
        onOpenHealth={openHealth}
        onOpenUpdates={openUpdates}
        updateStatus={updateStatus}
        version={version}
      />,
    );

    expect(screen.getByText("v0.1.8-alpha")).toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "System ready" }));
    await user.click(
      screen.getByRole("button", { name: "Version v0.1.8-alpha, update available" }),
    );
    expect(openHealth).toHaveBeenCalledOnce();
    expect(openUpdates).toHaveBeenCalledOnce();
  });

  it("shows an unknown state safely while checks are loading", () => {
    render(
      <TopbarSystemStatus
        health={null}
        onOpenHealth={vi.fn()}
        onOpenUpdates={vi.fn()}
        updateStatus={null}
        version={null}
      />,
    );

    expect(screen.getByRole("button", { name: "System status unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Version unavailable")).toBeInTheDocument();
  });
});
