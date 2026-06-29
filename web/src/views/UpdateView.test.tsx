import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UpdateView from "./UpdateView";

const installedVersion = {
  app_name: "AE NetScope",
  version: "0.1.5-alpha",
  release_channel: "alpha",
  repository_url: "https://github.com/WhiteAssassins/AE-NetScope",
  releases_url: "https://github.com/WhiteAssassins/AE-NetScope/releases",
  release_notes_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.5-alpha",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("UpdateView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("api.github.com")) {
          return Promise.resolve(
            jsonResponse([
              {
                tag_name: "v0.1.5-alpha",
                html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.5-alpha",
                name: "AE NetScope v0.1.5-alpha",
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

  it("shows current installed version and upgrade checklist", async () => {
    render(<UpdateView initialVersionInfo={installedVersion} />);

    expect(screen.getByRole("heading", { name: "Actualizaciones" })).toBeInTheDocument();
    expect(screen.getByText("v0.1.5-alpha")).toBeInTheDocument();
    expect(await screen.findByText("Actualizado")).toBeInTheDocument();
    expect(screen.getByText("Ejecutar migraciones de base de datos después de actualizar.")).toBeInTheDocument();
  });

  it("shows update available after manual check", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("api.github.com")) {
          return Promise.resolve(
            jsonResponse([
              {
                tag_name: "v0.1.6-alpha",
                html_url: "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.6-alpha",
                name: "AE NetScope v0.1.6-alpha",
                prerelease: true,
                draft: false,
                published_at: "2026-06-14T00:00:00Z",
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse(installedVersion));
      }),
    );

    render(<UpdateView initialVersionInfo={installedVersion} />);
    await user.click(screen.getByRole("button", { name: /buscar actualización/i }));

    expect(await screen.findByText("Actualización disponible")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir release/i })).toHaveAttribute(
      "href",
      "https://github.com/WhiteAssassins/AE-NetScope/releases/tag/v0.1.6-alpha",
    );
  });
});
