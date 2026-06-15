import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "../api";
import ImportExportView from "./ImportExportView";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const counts = {
  devices: 2,
  interfaces: 2,
  ip_addresses: 3,
  networks: 1,
  services: 1,
  vlans: 1,
};

describe("ImportExportView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens CSV exports through the API", async () => {
    const user = userEvent.setup();
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    render(
      <ImportExportView
        csrfToken="csrf"
        onImported={vi.fn()}
        permissions={["inventory:read", "settings:manage"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dispositivos" }));

    expect(openMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/inventory/export/devices.csv`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("previews and confirms JSON restore explicitly", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/inventory/import/preview")) {
        return Promise.resolve(
          jsonResponse({
            valid: true,
            mode: "replace",
            counts,
            current_counts: { ...counts, devices: 0, ip_addresses: 0, services: 0 },
            warnings: [],
            errors: [],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          status: "imported",
          counts,
          previous_backup: { format: "ae-netscope.inventory.v1", devices: [] },
          previous_backup_filename: "ae-netscope-before-restore-20260615120000.json",
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const { container } = render(
      <ImportExportView
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

    expect(await screen.findByText("Preview de importación")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reemplazar inventario/i }));

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/inventory/import.json`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
      }),
    );
  });
});
