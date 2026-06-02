import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DeviceRecord } from "../types";
import HardwareView from "./HardwareView";

const baseDevice: DeviceRecord = {
  id: 1,
  name: "CAM-DOOR-01",
  device_type: "Cámara IP",
  status: "active",
  vendor: "Axis",
  model: "P3265",
  serial_number: "CAM-SN-001",
  asset_tag: "AE-CAM-001",
  operating_system: null,
  firmware_version: "11.8",
  cpu: "ARM",
  memory: "1 GB",
  storage: "128 GB SD",
  warranty_expires: "2099-12-31",
  owner: "Security",
  rack_position: "Door 1",
  location: "Main entrance",
  notes: null,
  primary_ip: "10.0.5.20",
  primary_mac: "00:11:22:33:44:55",
};

describe("HardwareView", () => {
  it("renders hardware summary and physical asset details", () => {
    render(<HardwareView devices={[baseDevice]} onOpenDevice={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Hardware" })).toBeInTheDocument();
    expect(screen.getByText("Activos físicos")).toBeInTheDocument();
    expect(screen.getByText("CAM-DOOR-01")).toBeInTheDocument();
    expect(screen.getByText("CAM-SN-001")).toBeInTheDocument();
    expect(screen.getByText("AE-CAM-001")).toBeInTheDocument();
    expect(screen.getByText("Garantía OK")).toBeInTheDocument();
  });

  it("filters by missing serial and opens the real device", async () => {
    const user = userEvent.setup();
    const onOpenDevice = vi.fn();
    const missingSerialDevice = {
      ...baseDevice,
      id: 2,
      name: "SW-LAB-01",
      device_type: "Switch",
      serial_number: null,
      asset_tag: null,
    };

    render(<HardwareView devices={[baseDevice, missingSerialDevice]} onOpenDevice={onOpenDevice} />);

    await user.selectOptions(screen.getByRole("combobox"), "missing-serial");

    expect(screen.queryByText("CAM-DOOR-01")).not.toBeInTheDocument();
    expect(screen.getByText("SW-LAB-01")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abrir dispositivo" }));
    expect(onOpenDevice).toHaveBeenCalledWith(2);
  });

  it("searches hardware by owner, rack and CPU fields", async () => {
    const user = userEvent.setup();
    render(<HardwareView devices={[baseDevice]} onOpenDevice={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/buscar por serial/i), "security");
    expect(screen.getByText("CAM-DOOR-01")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/buscar por serial/i));
    await user.type(screen.getByPlaceholderText(/buscar por serial/i), "arm");
    expect(screen.getByText("CAM-DOOR-01")).toBeInTheDocument();
  });
});
