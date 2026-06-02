import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceRecord } from "../types";
import NotesView from "./NotesView";

const devices: DeviceRecord[] = [
  {
    id: 1,
    name: "SRV-APP-01",
    device_type: "Servidor",
    status: "active",
    vendor: "Dell",
    model: "R740",
    serial_number: "SN-01",
    asset_tag: "AE-01",
    operating_system: "Debian",
    firmware_version: "1.0",
    cpu: "Xeon",
    memory: "64 GB",
    storage: "2 TB",
    warranty_expires: null,
    owner: "Infra",
    rack_position: "A1",
    location: "MDF",
    notes: "Tiene OSPF configurado",
    primary_ip: "10.0.0.10",
    primary_mac: "00:11:22:33:44:55",
  },
  {
    id: 2,
    name: "CAM-DOOR-01",
    device_type: "Cámara IP",
    status: "active",
    vendor: "Axis",
    model: "P3265",
    serial_number: null,
    asset_tag: null,
    operating_system: null,
    firmware_version: null,
    cpu: null,
    memory: null,
    storage: null,
    warranty_expires: null,
    owner: "Security",
    rack_position: "Door",
    location: "Entrada",
    notes: null,
    primary_ip: "10.0.5.20",
    primary_mac: "00:aa:bb:cc:dd:ee",
  },
];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("NotesView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows note counters and filters devices without notes", async () => {
    const user = userEvent.setup();
    render(
      <NotesView
        csrfToken="csrf"
        devices={devices}
        onChanged={vi.fn()}
        onOpenDevice={vi.fn()}
        permissions={["inventory:read", "devices:update"]}
      />,
    );

    expect(screen.getAllByText("Con notas")).toHaveLength(2);
    expect(screen.getAllByText("Sin notas")).toHaveLength(2);
    expect(screen.getByText("SRV-APP-01")).toBeInTheDocument();
    expect(screen.queryByText("CAM-DOOR-01")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "without-notes");
    expect(screen.getByText("CAM-DOOR-01")).toBeInTheDocument();
    expect(screen.queryByText("SRV-APP-01")).not.toBeInTheDocument();
  });

  it("opens a real device from the notes list", async () => {
    const user = userEvent.setup();
    const onOpenDevice = vi.fn();

    render(
      <NotesView
        csrfToken="csrf"
        devices={devices}
        onChanged={vi.fn()}
        onOpenDevice={onOpenDevice}
        permissions={["inventory:read", "devices:update"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Abrir dispositivo" }));
    expect(onOpenDevice).toHaveBeenCalledWith(1);
  });

  it("saves notes with CSRF and refreshes inventory", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NotesView
        csrfToken="csrf-token"
        devices={devices}
        onChanged={onChanged}
        onOpenDevice={vi.fn()}
        permissions={["inventory:read", "devices:update"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /SRV-APP-01/i }));
    await user.clear(screen.getByLabelText("Nota técnica"));
    await user.type(screen.getByLabelText("Nota técnica"), "Nueva nota técnica");
    await user.click(screen.getByRole("button", { name: "Guardar nota" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/inventory/devices/1"),
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
        body: JSON.stringify({ notes: "Nueva nota técnica" }),
      }),
    );
    expect(screen.getByText("Nota actualizada: SRV-APP-01")).toBeInTheDocument();
  });

  it("keeps the editor read-only without update permission", async () => {
    const user = userEvent.setup();

    render(
      <NotesView
        csrfToken="csrf"
        devices={devices}
        onChanged={vi.fn()}
        onOpenDevice={vi.fn()}
        permissions={["inventory:read"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /SRV-APP-01/i }));

    expect(screen.getByLabelText("Nota técnica")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar nota" })).toBeDisabled();
  });
});
