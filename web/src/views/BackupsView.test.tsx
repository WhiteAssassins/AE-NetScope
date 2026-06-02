import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "../api";
import BackupsView from "./BackupsView";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BackupsView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("blocks the page when the user cannot read inventory", () => {
    render(<BackupsView csrfToken="csrf" onImported={vi.fn()} permissions={[]} />);

    expect(screen.getByRole("heading", { name: "Respaldos" })).toBeInTheDocument();
    expect(screen.getByText("No tienes permisos para leer el inventario.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar backup/i })).not.toBeInTheDocument();
  });

  it("downloads the JSON backup from the official API endpoint", async () => {
    const user = userEvent.setup();
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    render(
      <BackupsView
        csrfToken="csrf"
        onImported={vi.fn()}
        permissions={["inventory:read", "settings:manage"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /descargar backup/i }));

    expect(openMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/inventory/export.json`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("disables restore for non-admin inventory readers", () => {
    render(
      <BackupsView csrfToken="csrf" onImported={vi.fn()} permissions={["inventory:read"]} />,
    );

    expect(screen.getByRole("button", { name: /subir backup/i })).toBeDisabled();
  });

  it("restores a valid backup and refreshes inventory", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          counts: { devices: 1, ip_addresses: 2, networks: 1, services: 3 },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const { container } = render(
      <BackupsView
        csrfToken="csrf-token"
        onImported={onImported}
        permissions={["inventory:read", "settings:manage"]}
      />,
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    await user.upload(
      input as HTMLInputElement,
      new File([JSON.stringify({ format: "ae-netscope.inventory.v1" })], "backup.json", {
        type: "application/json",
      }),
    );

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/inventory/import.json`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
      }),
    );
    expect(
      screen.getByText("Backup restaurado: 1 dispositivos, 2 IPs, 1 subredes y 3 servicios."),
    ).toBeInTheDocument();
  });
});
