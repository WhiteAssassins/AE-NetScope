import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DeviceRecord, IpMacRecord, NetworkRecord } from "../types";
import TopologyView from "./TopologyView";

const devices: DeviceRecord[] = [
  {
    id: 10,
    name: "SW-Core-01",
    device_type: "Switch",
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
    primary_ip: "10.0.0.2",
    primary_mac: "00:11:22:33:44:55",
  },
];

const networks: NetworkRecord[] = [
  {
    id: 1,
    cidr: "10.0.0.0/24",
    name: "Core network",
    gateway: "10.0.0.1",
    location: "MDF",
    status: "active",
    vlan_id: 1,
    ip_count: 1,
    usable_hosts: 254,
    utilization_percent: 0.4,
    vlan: {
      id: 1,
      vlan_id: 10,
      name: "Core",
      description: null,
      network_count: 1,
      ip_count: 1,
      usable_hosts: 254,
      utilization_percent: 0.4,
    },
  },
  {
    id: 2,
    cidr: "10.0.1.0/24",
    name: "Server network",
    gateway: null,
    location: null,
    status: "active",
    vlan_id: null,
    vlan: null,
    ip_count: 0,
    usable_hosts: 254,
    utilization_percent: 0,
  },
];

const ipMacs: IpMacRecord[] = [
  {
    id: 100,
    address: "10.0.0.2",
    assignment_type: "static",
    network_id: 1,
    interface_id: 20,
    interface_name: "eth0",
    mac_address: "00:11:22:33:44:55",
    device_id: 10,
    device_name: "SW-Core-01",
    network_cidr: "10.0.0.0/24",
    vlan_id: 10,
    vlan_name: "Core",
    state: "active",
  },
  {
    id: 101,
    address: "192.168.50.10",
    assignment_type: "reserved",
    network_id: null,
    interface_id: null,
    interface_name: null,
    mac_address: null,
    device_id: null,
    device_name: null,
    network_cidr: null,
    vlan_id: null,
    vlan_name: null,
    state: "reserved",
  },
];

function renderTopology(overrides: Partial<Parameters<typeof TopologyView>[0]> = {}) {
  const props = {
    devices,
    ipMacs,
    networks,
    onOpenDevice: vi.fn(),
    onOpenIp: vi.fn(),
    onOpenNetwork: vi.fn(),
    onOpenVlan: vi.fn(),
    ...overrides,
  };
  render(<TopologyView {...props} />);
  return props;
}

describe("TopologyView", () => {
  it("renders topology stats, networks, devices, IPs, and unassigned IP notice", () => {
    renderTopology();

    expect(screen.getByRole("heading", { name: "Topología" })).toBeInTheDocument();
    expect(screen.getByText("Core network")).toBeInTheDocument();
    expect(screen.getAllByText("SW-Core-01").length).toBeGreaterThan(0);
    expect(screen.getByText("10.0.0.2")).toBeInTheDocument();
    expect(screen.getByText("IPs sin subred")).toBeInTheDocument();
  });

  it("expands and collapses network details", async () => {
    const testUser = userEvent.setup();
    renderTopology();

    await testUser.click(screen.getByRole("button", { name: "Colapsar" }));
    expect(screen.queryByText("SW-Core-01")).not.toBeInTheDocument();

    await testUser.click(screen.getByRole("button", { name: "Expandir todo" }));
    expect(screen.getAllByText("SW-Core-01").length).toBeGreaterThan(0);
  });

  it("opens real inventory targets from topology controls", async () => {
    const testUser = userEvent.setup();
    const props = renderTopology();

    await testUser.click(screen.getByRole("button", { name: /1\/254 IPs/i }));
    await testUser.click(screen.getByRole("button", { name: /VLAN 10/i }));
    const deviceButton = screen
      .getAllByText("SW-Core-01")
      .find((element) => element.closest("button")?.className === "topology-device")
      ?.closest("button");
    const ipButton = screen.getByText("10.0.0.2").closest("button");

    expect(deviceButton).toBeTruthy();
    expect(ipButton).toBeTruthy();

    await testUser.click(deviceButton!);
    await testUser.click(ipButton!);

    expect(props.onOpenNetwork).toHaveBeenCalledWith(1);
    expect(props.onOpenVlan).toHaveBeenCalledWith(1);
    expect(props.onOpenDevice).toHaveBeenCalledWith(10);
    expect(props.onOpenIp).toHaveBeenCalledWith(100);
  });

  it("renders an empty topology state", () => {
    renderTopology({ devices: [], ipMacs: [], networks: [] });

    expect(screen.getByText("No hay subredes para dibujar todavía.")).toBeInTheDocument();
    expect(screen.queryByText("IPs sin subred")).not.toBeInTheDocument();
  });
});
