import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceRecord, IpMacRecord, NetworkRecord } from "../types";
import DevicesView from "./DevicesView";
import IpMacsView from "./IpMacsView";
import NetworksView from "./NetworksView";
import ServicesView from "./ServicesView";

const network: NetworkRecord = {
  id: 1,
  cidr: "10.0.0.0/24",
  name: "Core",
  gateway: null,
  location: null,
  status: "active",
  vlan_id: null,
  vlan: null,
  ip_count: 1,
  usable_hosts: 254,
  utilization_percent: 0.4,
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const server: DeviceRecord = {
  id: 7,
  name: "SRV-07",
  device_type: "server",
  status: "active",
  vendor: "Dell",
  model: "R650",
  serial_number: "SN-07",
  asset_tag: null,
  operating_system: null,
  firmware_version: null,
  cpu: null,
  memory: null,
  storage: null,
  warranty_expires: null,
  owner: null,
  rack_position: null,
  location: "MDF",
  notes: null,
  primary_ip: "10.0.0.7",
  primary_mac: null,
};

function ip(id: number, address: string, state: string): IpMacRecord {
  return {
    id,
    address,
    assignment_type: "static",
    network_id: 1,
    interface_id: id,
    interface_name: "eth0",
    mac_address: null,
    device_id: id,
    device_name: `DEV-${id}`,
    network_cidr: "10.0.0.0/24",
    vlan_id: null,
    vlan_name: null,
    state,
  };
}

describe("inventory forms", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains why a subnet change was rejected and limits its name", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              detail:
                "1 assigned IP address(es) would fall outside the new network CIDR. Reassign or remove them first.",
            }),
            { status: 422, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
    render(
      <NetworksView
        csrfToken="csrf"
        networks={[network]}
        onChanged={vi.fn(() => Promise.resolve())}
        permissions={["networks:update"]}
        vlans={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "10.0.0.0/24" }));
    expect(screen.getByDisplayValue("Core")).toHaveAttribute("maxLength", "120");
    await user.click(screen.getByRole("button", { name: "Save subnet" }));

    expect(
      await screen.findByText(
        "Some assigned IP addresses would fall outside the new CIDR. Reassign or remove them first.",
      ),
    ).toBeInTheDocument();
  });

  it("filters addresses of deactivated devices as inactive", async () => {
    const user = userEvent.setup();
    render(
      <IpMacsView
        csrfToken="csrf"
        interfaces={[]}
        ipMacs={[ip(1, "10.0.0.5", "active"), ip(2, "10.0.0.6", "inactive")]}
        networks={[network]}
        onChanged={vi.fn(() => Promise.resolve())}
        permissions={[]}
      />,
    );

    await user.selectOptions(screen.getAllByRole("combobox")[0], "inactive");

    expect(screen.getByText("10.0.0.6")).toBeInTheDocument();
    expect(screen.queryByText("10.0.0.5")).not.toBeInTheDocument();
  });

  it("creates, edits and deletes subnets and filters them", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((_input: string, init?: RequestInit) =>
      Promise.resolve(jsonResponse(init?.method === "DELETE" ? null : network, init?.method === "DELETE" ? 204 : 200)),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <NetworksView
        csrfToken="csrf"
        networks={[network, { ...network, id: 2, cidr: "10.9.0.0/24", name: "Lab", status: "reserved" }]}
        onChanged={onChanged}
        permissions={["networks:create", "networks:update", "networks:delete"]}
        vlans={[]}
      />,
    );

    await user.type(screen.getByPlaceholderText(/search by cidr/i), "lab");
    expect(screen.queryByRole("button", { name: "10.0.0.0/24" })).not.toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText(/search by cidr/i));

    await user.click(screen.getByRole("button", { name: "New subnet" }));
    await user.type(screen.getByPlaceholderText("10.0.3.0/24"), "10.5.0.0/24");
    await user.type(screen.getAllByLabelText("Name")[0], "Servers");
    await user.click(screen.getByRole("button", { name: "Create subnet" }));
    expect(await screen.findByText("Subnet created.")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      cidr: "10.5.0.0/24",
      name: "Servers",
    });

    await user.click(screen.getByRole("button", { name: "10.9.0.0/24" }));
    await user.click(screen.getByRole("button", { name: "Delete subnet" }));
    expect(await screen.findByText("Subnet deleted.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("registers, edits and deletes IP addresses", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((_input: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "DELETE" ? new Response(null, { status: 204 }) : jsonResponse(ip(3, "10.0.0.9", "active")),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <IpMacsView
        csrfToken="csrf"
        interfaces={[]}
        ipMacs={[ip(1, "10.0.0.5", "active")]}
        networks={[network]}
        onChanged={onChanged}
        permissions={["ip_addresses:create", "ip_addresses:update", "ip_addresses:delete"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New IP" }));
    await user.type(screen.getByPlaceholderText("10.0.0.25"), "10.0.0.9");
    await user.click(screen.getByRole("button", { name: "Register IP" }));
    expect(await screen.findByText("IP registered.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "10.0.0.5" }));
    await user.click(screen.getByRole("button", { name: "Save IP" }));
    expect(await screen.findByText("IP updated.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "10.0.0.5" }));
    await user.click(screen.getByRole("button", { name: "Delete IP" }));
    expect(await screen.findByText("IP deleted.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "PATCH", "DELETE"]);
  });

  it("creates a device with its first interface and adds another", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      if (init?.method === "POST" && input.endsWith("/inventory/devices")) {
        return Promise.resolve(jsonResponse(server, 201));
      }
      if (init?.method === "POST") return Promise.resolve(jsonResponse({ id: 9 }, 201));
      return Promise.resolve(jsonResponse({ ...server, interfaces: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DevicesView
        csrfToken="csrf"
        devices={[server]}
        networks={[network]}
        onCreated={onCreated}
        permissions={["devices:create", "devices:update"]}
      />,
    );

    await user.type(screen.getByPlaceholderText(/search by name/i), "dell");
    expect(screen.getByText("1 device")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New device" }));
    await user.type(screen.getAllByLabelText("Name")[0], "SW-NEW");
    await user.type(screen.getByLabelText("IP"), "10.0.0.20");
    await user.selectOptions(screen.getAllByLabelText("Subnets")[0], "1");
    await user.click(screen.getByRole("button", { name: "Create device" }));
    expect(await screen.findByText("Device created.")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      name: "SW-NEW",
      interface: { name: "eth0", ip_address: "10.0.0.20", network_id: 1 },
    });

    await user.click(screen.getByRole("button", { name: "SRV-07" }));
    await screen.findByRole("heading", { name: "SRV-07" });
    await user.click(screen.getByRole("button", { name: "Add interface" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
  });

  it("keeps an unlisted service protocol and filters unknown services", async () => {
    const user = userEvent.setup();
    const service = (id: number, protocol: string, status: string) => ({
      id,
      device_id: 7,
      device_name: "SRV-07",
      device_type: "server",
      name: `svc-${id}`,
      port: 9000 + id,
      protocol,
      status,
      primary_ip: null,
    });
    render(
      <ServicesView
        csrfToken="csrf"
        devices={[server]}
        onChanged={vi.fn(() => Promise.resolve())}
        permissions={["services:update"]}
        services={[service(1, "sctp", "active"), service(2, "tcp", "unknown")]}
      />,
    );

    await user.selectOptions(screen.getAllByRole("combobox")[0], "unknown");
    expect(screen.queryByRole("button", { name: "svc-1" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getAllByRole("combobox")[0], "all");

    await user.click(screen.getByRole("button", { name: "svc-1" }));
    expect(screen.getByDisplayValue("SCTP")).toBeInTheDocument();
  });

  it("creates, edits, searches and deletes services", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((_input: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "DELETE" ? new Response(null, { status: 204 }) : jsonResponse({ id: 1 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const existing = {
      id: 1,
      device_id: 7,
      device_name: "SRV-07",
      device_type: "server",
      name: "https",
      port: 443,
      protocol: "tcp",
      status: "active",
      primary_ip: "10.0.0.7",
    };
    render(
      <ServicesView
        csrfToken="csrf"
        devices={[server]}
        onChanged={onChanged}
        permissions={["services:create", "services:update", "services:delete"]}
        services={[existing, { ...existing, id: 2, name: "dns", port: 53, protocol: "udp" }]}
      />,
    );

    await user.type(screen.getByPlaceholderText(/search by service/i), "udp");
    expect(screen.queryByRole("button", { name: "https" })).not.toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText(/search by service/i));

    await user.click(screen.getByRole("button", { name: "New service" }));
    await user.selectOptions(screen.getByLabelText("Device"), "7");
    await user.type(screen.getByLabelText("Service"), "ssh");
    await user.type(screen.getByLabelText("Port"), "22");
    await user.click(screen.getByRole("button", { name: "Create service" }));
    expect(await screen.findByText("Service created.")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      device_id: 7,
      name: "ssh",
      port: 22,
      protocol: "tcp",
    });

    await user.click(screen.getByRole("button", { name: "https" }));
    await user.selectOptions(screen.getByLabelText("Protocol"), "udp");
    await user.selectOptions(screen.getAllByLabelText("Status").at(-1)!, "warning");
    await user.click(screen.getByRole("button", { name: "Save service" }));
    expect(await screen.findByText("Service updated.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "https" }));
    await user.click(screen.getByRole("button", { name: "Delete service" }));
    expect(await screen.findByText("Service deleted.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "PATCH", "DELETE"]);
    expect(onChanged).toHaveBeenCalledTimes(3);
  });

  it("applies a navigation focus once, and again only for a new navigation", async () => {
    const user = userEvent.setup();
    const second = { ...network, id: 2, cidr: "10.9.0.0/24", name: "Lab" };
    const props = {
      csrfToken: "csrf",
      onChanged: vi.fn(() => Promise.resolve()),
      permissions: ["networks:update"],
      vlans: [],
    };
    const { rerender } = render(
      <NetworksView {...props} focusNetworkId={1} focusRequest={1} networks={[network, second]} />,
    );
    expect(await screen.findByDisplayValue("Core")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search by cidr/i));
    await user.click(screen.getByRole("button", { name: "10.9.0.0/24" }));
    // The list refreshes after saving another record; the earlier focus is not reapplied.
    rerender(
      <NetworksView {...props} focusNetworkId={1} focusRequest={1} networks={[network, { ...second }]} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByDisplayValue("Lab")).toBeInTheDocument();

    rerender(
      <NetworksView {...props} focusNetworkId={1} focusRequest={2} networks={[network, second]} />,
    );
    expect(await screen.findByDisplayValue("Core")).toBeInTheDocument();
  });

  it("keeps the unknown status of subnets and services in their forms", async () => {
    const user = userEvent.setup();
    render(
      <NetworksView
        csrfToken="csrf"
        networks={[{ ...network, status: "unknown" }]}
        onChanged={vi.fn(() => Promise.resolve())}
        permissions={["networks:update"]}
        vlans={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "10.0.0.0/24" }));

    expect(screen.getAllByDisplayValue("Unknown").length).toBeGreaterThan(0);
  });

  it("asks for an address when a subnet is chosen for a new device", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DevicesView
        csrfToken="csrf"
        devices={[]}
        networks={[network]}
        onCreated={vi.fn(() => Promise.resolve())}
        permissions={["devices:create"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New device" }));
    await user.type(screen.getAllByLabelText("Name")[0], "SW-NEW");
    await user.selectOptions(screen.getAllByLabelText("Subnets")[0], "1");
    await user.click(screen.getByRole("button", { name: "Create device" }));

    expect(
      screen.getByText("Enter an IP address for the selected subnet, or choose no subnet."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
