import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UpdateStatusInfo, VersionInfo } from "../types";
import AboutView from "./AboutView";

const versionInfo: VersionInfo = {
  app_name: "AE NetScope",
  version: "0.1.8-alpha",
  release_channel: "alpha",
  repository_url: "https://github.com/WhiteAssassins/AE-NetScope",
  releases_url: "https://github.com/WhiteAssassins/AE-NetScope/releases",
  release_notes_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.8-alpha",
};

const updateStatus: UpdateStatusInfo = {
  installed_version: "0.1.8-alpha",
  installed_channel: "alpha",
  target_channel: "prerelease",
  update_available: false,
  latest_release: null,
  latest_prerelease: null,
  selected_release: null,
  update_capability: {
    platform: "docker",
    automatic_updates_enabled: false,
    automatic_updates_supported: true,
    reason: null,
  },
};

describe("AboutView", () => {
  it("shows project identity, installed version, ownership, and official links", () => {
    render(
      <AboutView
        onOpenSupport={vi.fn()}
        onOpenUpdates={vi.fn()}
        updateStatus={updateStatus}
        versionInfo={versionInfo}
      />,
    );

    expect(screen.getByRole("heading", { name: "AE NetScope" })).toBeInTheDocument();
    expect(screen.getByText("v0.1.8-alpha")).toBeInTheDocument();
    expect(screen.getByText("Christopher David Alberto Roque")).toBeInTheDocument();
    expect(screen.getByText("MIT License")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhiteAssassins/i })).toHaveAttribute(
      "href",
      "https://github.com/WhiteAssassins",
    );
    expect(screen.getByRole("link", { name: /Source repository/i })).toHaveAttribute(
      "href",
      "https://github.com/WhiteAssassins/AE-NetScope",
    );
  });

  it("opens updates and support through the internal navigation callbacks", () => {
    const onOpenSupport = vi.fn();
    const onOpenUpdates = vi.fn();
    render(
      <AboutView
        onOpenSupport={onOpenSupport}
        onOpenUpdates={onOpenUpdates}
        updateStatus={updateStatus}
        versionInfo={versionInfo}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View updates" }));
    fireEvent.click(screen.getByRole("button", { name: "Open support" }));

    expect(onOpenUpdates).toHaveBeenCalledOnce();
    expect(onOpenSupport).toHaveBeenCalledOnce();
  });
});
