import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import SettingsView from "./SettingsView";

const currentUser: User = {
  id: 1,
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  permissions: ["inventory:read"],
  must_change_password: false,
};

const installedVersion = {
  app_name: "AE NetScope",
  version: "0.1.4-alpha",
  release_channel: "alpha",
  repository_url: "https://github.com/WhiteAssassins/AE-NetScope",
  releases_url: "https://github.com/WhiteAssassins/AE-NetScope/releases",
  release_notes_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.4-alpha",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderSettings(overrides: Partial<Parameters<typeof SettingsView>[0]> = {}) {
  return render(
    <SettingsView
      csrfToken="csrf-token"
      initialVersionInfo={installedVersion}
      onUserChanged={vi.fn()}
      user={currentUser}
      {...overrides}
    />,
  );
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
                tag_name: "v0.1.4-alpha",
                html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.4-alpha",
                name: "AE NetScope v0.1.4-alpha",
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
    renderSettings();

    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("admin@example.com")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("dashboard");
    expect(screen.getByLabelText(/tablas compactas/i)).not.toBeChecked();
    expect(screen.getByLabelText(/mostrar aviso/i)).toBeChecked();
    expect(screen.getByText("AE NetScope v0.1.4-alpha (alpha)")).toBeInTheDocument();
    expect(await screen.findByText("Actualizado")).toBeInTheDocument();
  });

  it("persists settings and dispatches the settings changed event", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener("ae-netscope-settings-changed", listener);

    renderSettings();

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

    renderSettings();

    expect(await screen.findByText("Actualización disponible")).toBeInTheDocument();
    expect(screen.getByText("v0.2.0-alpha - pre-release")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver releases" })).toHaveAttribute(
      "href",
      "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.2.0-alpha",
    );
  });

  it("changes the current user email with password confirmation", async () => {
    const user = userEvent.setup();
    const onUserChanged = vi.fn();
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("api.github.com")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/auth/email")) {
        return Promise.resolve(
          jsonResponse({
            user: { ...currentUser, email: "admin@aewhitedevs.com" },
          }),
        );
      }
      return Promise.resolve(jsonResponse(installedVersion));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSettings({ onUserChanged });

    const emailInput = screen.getByDisplayValue("admin@example.com");
    await user.clear(emailInput);
    await user.type(emailInput, "admin@aewhitedevs.com");
    await user.type(screen.getByPlaceholderText("Contraseña actual"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Cambiar correo" }));

    expect(await screen.findByText("Correo actualizado correctamente.")).toBeInTheDocument();
    expect(onUserChanged).toHaveBeenCalledWith(
      expect.objectContaining({ email: "admin@aewhitedevs.com" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/email"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
        body: JSON.stringify({
          current_password: "correct-password",
          new_email: "admin@aewhitedevs.com",
        }),
      }),
    );
  });
});
