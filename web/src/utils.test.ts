import { describe, expect, it } from "vitest";
import { hasPermission, isHardwareDevice, stateLabel, stateTone, titleCase, typeTone } from "./utils";
import type { DeviceRecord } from "./types";

const device = (device_type: string, overrides: Partial<DeviceRecord> = {}): DeviceRecord => ({
  id: 1,
  name: "Device",
  device_type,
  status: "active",
  vendor: null,
  model: null,
  serial_number: null,
  asset_tag: null,
  operating_system: null,
  firmware_version: null,
  cpu: null,
  memory: null,
  storage: null,
  warranty_expires: null,
  owner: null,
  rack_position: null,
  location: null,
  notes: null,
  primary_ip: null,
  primary_mac: null,
  ...overrides,
});

describe("utils", () => {
  it("formats simple labels without changing unknown values", () => {
    expect(titleCase("router")).toBe("Router");
    expect(stateLabel("active")).toBe("Activa");
    expect(stateLabel("reserved")).toBe("Reservada");
    expect(stateLabel("unknown")).toBe("Unknown");
  });

  it("maps state values to stable visual tones", () => {
    expect(stateTone("active")).toBe("green");
    expect(stateTone("reserved")).toBe("orange");
    expect(stateTone("unassigned")).toBe("gray");
  });

  it("maps expanded device types to the expected visual tones", () => {
    expect(typeTone("Servidor")).toBe("server");
    expect(typeTone("Cámara IP")).toBe("camera");
    expect(typeTone("Virtualización")).toBe("storage");
    expect(typeTone("Firewall")).toBe("security");
    expect(typeTone("Equipo")).toBe("workstation");
    expect(typeTone("Switch")).toBe("network");
  });

  it("checks permissions exactly", () => {
    expect(hasPermission(["inventory:read", "devices:update"], "devices:update")).toBe(true);
    expect(hasPermission(["inventory:read"], "devices:update")).toBe(false);
  });

  it("classifies localized, aliased and custom hardware without treating virtual assets as physical", () => {
    expect(isHardwareDevice(device("Servidor"))).toBe(true);
    expect(isHardwareDevice(device("PHYSICAL SERVER"))).toBe(true);
    expect(isHardwareDevice(device("PoE security camera"))).toBe(true);
    expect(isHardwareDevice(device("Custom appliance", { serial_number: "SN-1" }))).toBe(true);
    expect(isHardwareDevice(device("virtual server", { cpu: "4 vCPU" }))).toBe(false);
    expect(isHardwareDevice(device("service"))).toBe(false);
  });
});
