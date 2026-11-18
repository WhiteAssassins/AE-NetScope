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
        permissions={["inventory:read", "inventory:export", "settings:manage"]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Export CSV" }));
    await user.click(screen.getByRole("button", { name: "Devices" }));

    expect(openMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/inventory/export/devices.csv`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("disables exports for roles without the export permission", async () => {
    const user = userEvent.setup();
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    render(
      <ImportExportView csrfToken="csrf" onImported={vi.fn()} permissions={["inventory:read"]} />,
    );

    expect(screen.getByRole("button", { name: "Download backup" })).toBeDisabled();
    expect(screen.getByText("You do not have permission to export inventory.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Export CSV" }));
    expect(screen.getByRole("button", { name: "Devices" })).toBeDisabled();
    expect(openMock).not.toHaveBeenCalled();
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
    await user.click(screen.getByRole("tab", { name: "Restore" }));
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    await user.upload(
      input as HTMLInputElement,
      new File([JSON.stringify({ format: "ae-netscope.inventory.v1" })], "backup.json", {
        type: "application/json",
      }),
    );

    expect(await screen.findByText("Restore preview")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /replace inventory/i }));

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

  it("does not report valid JSON as malformed when the preview API is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, 503))));

    const { container } = render(
      <ImportExportView
        csrfToken="csrf-token"
        onImported={vi.fn()}
        permissions={["inventory:read", "settings:manage"]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Restore" }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      new File([JSON.stringify({ format: "ae-netscope.inventory.v1" })], "backup.json", {
        type: "application/json",
      }),
    );

    expect(
      await screen.findByText(/backup preview service is unavailable/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/does not appear to be valid/i)).not.toBeInTheDocument();
  });

  it("warns when a backup is larger than this installation can restore", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith("/inventory/import/limits")
          ? jsonResponse({ max_bytes: 1_000_000, current_backup_bytes: 1_500_000, current_backup_restorable: false })
          : jsonResponse({}),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <ImportExportView
        csrfToken="csrf-token"
        onImported={vi.fn()}
        permissions={["inventory:read", "inventory:export", "settings:manage"]}
      />,
    );

    expect(
      await screen.findByText(/larger than the 1 MB this installation can restore/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Restore" }));
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["x".repeat(1_000_001)], "backup.json", { type: "application/json" }),
    );

    expect(await screen.findByText(/larger than the 1 MB this installation accepts/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/import/preview"))).toBe(false);
  });

  it("explains a backup rejected by the API for its size", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/inventory/import/limits")
            ? jsonResponse({}, 500)
            : jsonResponse({ detail: "Inventory import JSON is too large." }, 413),
        ),
      ),
    );
    const { container } = render(
      <ImportExportView
        csrfToken="csrf-token"
        onImported={vi.fn()}
        permissions={["inventory:read", "settings:manage"]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Restore" }));
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File([JSON.stringify({ format: "ae-netscope.inventory.v1" })], "backup.json", {
        type: "application/json",
      }),
    );

    expect(await screen.findByText(/this installation accepts/i)).toBeInTheDocument();
  });

  it("says the inventory was not changed when a restore is rejected", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/import/preview")) {
          return Promise.resolve(
            jsonResponse({
              valid: true,
              mode: "replace",
              counts: { vlans: 0, networks: 0, devices: 1, interfaces: 0, ip_addresses: 0, services: 0 },
              current_counts: { vlans: 0, networks: 0, devices: 1, interfaces: 0, ip_addresses: 0, services: 0 },
              warnings: [],
              errors: [],
            }),
          );
        }
        if (url.endsWith("/import.json")) {
          return Promise.resolve(jsonResponse({ detail: "Backup contains duplicate inventory records." }, 409));
        }
        return Promise.resolve(jsonResponse({}, 500));
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(
      <ImportExportView csrfToken="csrf-token" onImported={vi.fn()} permissions={["inventory:read", "settings:manage"]} />,
    );
    await user.click(screen.getByRole("tab", { name: "Restore" }));
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File([JSON.stringify({ format: "ae-netscope.inventory.v1" })], "backup.json", { type: "application/json" }),
    );
    await user.click(await screen.findByRole("button", { name: "Replace inventory" }));

    expect(
      await screen.findByText("The backup contains duplicate records. The inventory was not changed."),
    ).toBeInTheDocument();
  });
});
