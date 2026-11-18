import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DeviceRecord } from "../types";
import HardwareView from "./HardwareView";

const baseDevice: DeviceRecord = {
  id: 1,
  name: "CAM-DOOR-01",
  device_type: "ip_camera",
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
    expect(screen.getByText("Physical assets")).toBeInTheDocument();
    expect(screen.getByText("CAM-DOOR-01")).toBeInTheDocument();
    expect(screen.getByText("CAM-SN-001")).toBeInTheDocument();
    expect(screen.getByText("AE-CAM-001")).toBeInTheDocument();
    expect(screen.getByText("Warranty OK")).toBeInTheDocument();
  });

  it("marks expired warranties apart from those expiring soon", () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    render(
      <HardwareView
        devices={[
          { ...baseDevice, id: 2, name: "OLD", warranty_expires: "2020-01-01" },
          { ...baseDevice, id: 3, name: "SOON", warranty_expires: soon },
        ]}
        onOpenDevice={vi.fn()}
      />,
    );

    const pill = (name: string) =>
      within(screen.getByRole("heading", { name }).closest("article") as HTMLElement)
        .getAllByText(/warranty/i)[0];
    expect(pill("OLD")).toHaveClass("red");
    expect(pill("SOON")).toHaveClass("orange");
  });

  it("treats printers, phones, sensors and access control as physical assets", () => {
    const bare = { ...baseDevice, vendor: null, model: null, serial_number: null, asset_tag: null,
      cpu: null, memory: null, storage: null, warranty_expires: null, rack_position: null,
      firmware_version: null };
    render(
      <HardwareView
        devices={[
          { ...bare, id: 2, name: "PRN-01", device_type: "printer" },
          { ...bare, id: 3, name: "PHONE-01", device_type: "voip" },
          { ...bare, id: 4, name: "TEMP-01", device_type: "sensor" },
          { ...bare, id: 5, name: "DOOR-01", device_type: "access_control" },
          { ...bare, id: 6, name: "VM-01", device_type: "virtualization" },
        ]}
        onOpenDevice={vi.fn()}
      />,
    );

    for (const name of ["PRN-01", "PHONE-01", "TEMP-01", "DOOR-01"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "VM-01" })).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Open device" }));
    expect(onOpenDevice).toHaveBeenCalledWith(2);
  });

  it("searches hardware by owner, rack and CPU fields", async () => {
    const user = userEvent.setup();
    render(<HardwareView devices={[baseDevice]} onOpenDevice={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/search by serial/i), "security");
    expect(screen.getByText("CAM-DOOR-01")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search by serial/i));
    await user.type(screen.getByPlaceholderText(/search by serial/i), "arm");
    expect(screen.getByText("CAM-DOOR-01")).toBeInTheDocument();
  });

  it("searches hardware by the displayed device type label", async () => {
    const user = userEvent.setup();
    render(<HardwareView devices={[baseDevice]} onOpenDevice={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/search by serial/i), "ip camera");
    expect(screen.getByText("CAM-DOOR-01")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search by serial/i));
    await user.type(screen.getByPlaceholderText(/search by serial/i), "printer");
    expect(screen.queryByText("CAM-DOOR-01")).not.toBeInTheDocument();
  });

  it("keeps a warranty valid through its local expiry date", () => {
    const today = new Date();
    const localDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    render(
      <HardwareView
        devices={[{ ...baseDevice, warranty_expires: localDate }]}
        onOpenDevice={vi.fn()}
      />,
    );

    const card = screen.getByText("CAM-DOOR-01").closest("article") as HTMLElement;
    expect(within(card).getByText("Warranty expiring soon")).toBeInTheDocument();
    expect(within(card).queryByText("Warranty expired")).not.toBeInTheDocument();
  });

  it("includes English, mixed-case and custom physical device types", () => {
    const englishServer = { ...baseDevice, id: 2, name: "SRV-EN-01", device_type: "physical server" };
    const mixedCaseRouter = { ...baseDevice, id: 3, name: "RTR-01", device_type: "rOuTeR" };
    const customCamera = { ...baseDevice, id: 4, name: "CAM-POE-01", device_type: "PoE security camera" };
    const customAsset = { ...baseDevice, id: 5, name: "APPLIANCE-01", device_type: "Custom appliance" };
    const virtualServer = { ...baseDevice, id: 6, name: "VM-01", device_type: "virtual server" };

    render(
      <HardwareView
        devices={[englishServer, mixedCaseRouter, customCamera, customAsset, virtualServer]}
        onOpenDevice={vi.fn()}
      />,
    );

    expect(screen.getByText("SRV-EN-01")).toBeInTheDocument();
    expect(screen.getByText("RTR-01")).toBeInTheDocument();
    expect(screen.getByText("CAM-POE-01")).toBeInTheDocument();
    expect(screen.getByText("APPLIANCE-01")).toBeInTheDocument();
    expect(screen.queryByText("VM-01")).not.toBeInTheDocument();
  });
});
