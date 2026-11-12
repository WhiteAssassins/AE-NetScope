import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import {
  deviceTypeLabel,
  hasPermission,
  isHardwareDevice,
  stateLabel,
  stateTone,
  titleCase,
  typeTone,
} from "./utils";
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
    expect(typeTone("server")).toBe("server");
    expect(typeTone("ip_camera")).toBe("camera");
    expect(typeTone("virtualization")).toBe("storage");
    expect(typeTone("firewall")).toBe("security");
    expect(typeTone("workstation")).toBe("workstation");
    expect(typeTone("switch")).toBe("network");
  });

  it("checks permissions exactly", () => {
    expect(hasPermission(["inventory:read", "devices:update"], "devices:update")).toBe(true);
    expect(hasPermission(["inventory:read"], "devices:update")).toBe(false);
  });

  it("classifies localized, aliased and custom hardware without treating virtual assets as physical", () => {
    expect(isHardwareDevice(device("server"))).toBe(true);
    expect(isHardwareDevice(device("PHYSICAL SERVER"))).toBe(true);
    expect(isHardwareDevice(device("PoE security camera"))).toBe(true);
    expect(isHardwareDevice(device("Custom appliance", { serial_number: "SN-1" }))).toBe(true);
    expect(isHardwareDevice(device("virtual server", { cpu: "4 vCPU" }))).toBe(false);
    expect(isHardwareDevice(device("service"))).toBe(false);
    expect(isHardwareDevice(device("access_point"))).toBe(true);
    expect(isHardwareDevice(device("ip_camera"))).toBe(true);
    expect(isHardwareDevice(device("virtualization", { cpu: "4 vCPU" }))).toBe(false);
    expect(isHardwareDevice(device("container", { memory: "2 GB" }))).toBe(false);
  });

  it("labels device type keys and keeps unknown values readable", () => {
    const t = ((key: string, options?: { defaultValue?: string }) =>
      key === "values.deviceTypes.access_point" ? "Access point" : options?.defaultValue ?? key) as unknown as TFunction;
    expect(deviceTypeLabel("access_point", t)).toBe("Access point");
    expect(deviceTypeLabel("Custom", t)).toBe("Custom");
  });
});
