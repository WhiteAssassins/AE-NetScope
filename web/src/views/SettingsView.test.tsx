import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsView from "./SettingsView";

const installedVersion = {
  app_name: "AE NetScope",
  version: "0.1.0-alpha",
  release_channel: "alpha",
  repository_url: "https://github.com/WhiteAssassins/AE-NetScope",
  releases_url: "https://github.com/WhiteAssassins/AE-NetScope/releases",
  release_notes_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.0-alpha",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SettingsView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("api.github.com")) {
          return Promise.resolve(
            jsonResponse([
              {
                tag_name: "v0.1.0-alpha",
                html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.0-alpha",
                name: "AE NetScope v0.1.0-alpha",
                prerelease: true,
                draft: false,
                published_at: "2026-06-03T00:00:00Z",
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse(installedVersion));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads default local settings", async () => {
    render(<SettingsView initialVersionInfo={installedVersion} />);

    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("dashboard");
    expect(screen.getByLabelText(/tablas compactas/i)).not.toBeChecked();
    expect(screen.getByLabelText(/mostrar aviso/i)).toBeChecked();
    expect(screen.getByText("AE NetScope v0.1.0-alpha (alpha)")).toBeInTheDocument();
    expect(await screen.findByText("Actualizado")).toBeInTheDocument();
  });

  it("persists settings and dispatches the settings changed event", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener("ae-netscope-settings-changed", listener);

    render(<SettingsView initialVersionInfo={installedVersion} />);

    await user.selectOptions(screen.getByRole("combobox"), "devices");
    await user.click(screen.getByLabelText(/tablas compactas/i));
    await user.click(screen.getByRole("button", { name: /guardar ajustes/i }));

    expect(JSON.parse(window.localStorage.getItem("ae-netscope-settings") ?? "{}")).toMatchObject({
      defaultView: "devices",
      compactTables: true,
      showPreviewNotice: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ajustes guardados en este navegador.")).toBeInTheDocument();

    window.removeEventListener("ae-netscope-settings-changed", listener);
  });

  it("shows when a newer GitHub release exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("api.github.com")) {
          return Promise.resolve(
            jsonResponse([
              {
                tag_name: "v0.2.0-alpha",
                html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.2.0-alpha",
                name: "AE NetScope v0.2.0-alpha",
                prerelease: true,
                draft: false,
                published_at: "2026-06-10T00:00:00Z",
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse(installedVersion));
      }),
    );

    render(<SettingsView initialVersionInfo={installedVersion} />);

    expect(await screen.findByText("Actualización disponible")).toBeInTheDocument();
    expect(screen.getByText("v0.2.0-alpha - pre-release")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver releases" })).toHaveAttribute(
      "href",
      "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.2.0-alpha",
    );
  });
});
