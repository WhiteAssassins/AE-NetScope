import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AuditEvent, DashboardSummary, User } from "../types";
import DashboardView from "./DashboardView";

vi.mock("recharts", () => ({
  Cell: () => null,
  Pie: ({ children }: { children?: ReactNode }) => <g>{children}</g>,
  PieChart: ({ children }: { children?: ReactNode }) => <svg>{children}</svg>,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const user: User = {
  id: 1,
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  permissions: ["inventory:read"],
  must_change_password: false,
  preferred_language: "en",
};

const dashboard: DashboardSummary = {
  stats: {
    devices: 2,
    ip_addresses: 3,
    networks: 1,
    vlans: 1,
    services: 1,
    notes: 1,
  },
  recent_devices: [
    {
      id: 10,
      name: "SW-Core-01",
      device_type: "Switch",
      primary_ip: "10.0.0.2",
      primary_mac: "00:11:22:33:44:55",
      status: "active",
      last_change: "Hace 1 hora",
    },
  ],
  services: [{ name: "SSH", device_count: 2, status: "active" }],
  networks: [
    {
      cidr: "10.0.0.0/24",
      name: "Core network",
      device_count: 2,
      ip_count: 3,
      usable_hosts: 254,
      utilization_percent: 1.2,
      vlan: {
        id: 1,
        vlan_id: 10,
        name: "Core",
        description: null,
        network_count: 1,
        ip_count: 3,
        usable_hosts: 254,
        utilization_percent: 1.2,
      },
    },
  ],
};

const auditEvents: AuditEvent[] = [
  {
    id: 1,
    actor_user_id: 1,
    actor_username: "admin",
    actor_email: "admin@example.com",
    event_type: "auth.login_success",
    message: "Login succeeded for admin@example.com",
    ip_address: "127.0.0.1",
    created_at: "2026-07-01T10:00:00Z",
  },
];

function renderDashboard(overrides: Partial<Parameters<typeof DashboardView>[0]> = {}) {
  const props = {
    auditEvents,
    dashboard,
    lastUpdatedAt: new Date("2026-07-01T10:00:00Z"),
    onOpenAudit: vi.fn(),
    onOpenAuditEvent: vi.fn(),
    onOpenDevice: vi.fn(),
    onOpenDevices: vi.fn(),
    onOpenIpMacs: vi.fn(),
    onOpenNetworks: vi.fn(),
    onOpenTopology: vi.fn(),
    onOpenServices: vi.fn(),
    onOpenVlans: vi.fn(),
    onRefresh: vi.fn(),
    showPreviewNotice: true,
    user,
    ...overrides,
  };
  render(<DashboardView {...props} />);
  return props;
}

describe("DashboardView", () => {
  it("renders inventory summary, recent devices, and recent audit events", () => {
    renderDashboard();

    expect(screen.getByRole("heading", { name: "Bienvenido, admin" })).toBeInTheDocument();
    expect(screen.getByText("Early Public Preview")).toBeInTheDocument();
    expect(screen.getByText("SW-Core-01")).toBeInTheDocument();
    expect(screen.getAllByText("10.0.0.0/24").length).toBeGreaterThan(0);
    expect(screen.getByText("Login succeeded for admin@example.com")).toBeInTheDocument();
  });

  it("calls navigation and refresh handlers from dashboard controls", async () => {
    const testUser = userEvent.setup();
    const props = renderDashboard();

    await testUser.click(screen.getByRole("button", { name: "SW-Core-01" }));
    await testUser.click(screen.getByRole("button", { name: /Abrir topolog/i }));
    await testUser.click(screen.getByRole("button", { name: /actualizaci/i }));
    await testUser.click(screen.getByRole("button", { name: "Login succeeded for admin@example.com" }));

    expect(props.onOpenDevice).toHaveBeenCalledWith(10);
    expect(props.onOpenTopology).toHaveBeenCalled();
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onOpenAuditEvent).toHaveBeenCalledWith(auditEvents[0]);
  });

  it("renders empty dashboard states without preview notice", () => {
    renderDashboard({
      auditEvents: [],
      dashboard: null,
      lastUpdatedAt: null,
      showPreviewNotice: false,
    });

    expect(screen.queryByText("Early Public Preview")).not.toBeInTheDocument();
    expect(screen.getByText("No hay subredes registradas.")).toBeInTheDocument();
    expect(screen.getByText("No hay cambios recientes para mostrar.")).toBeInTheDocument();
    expect(screen.getByText(/Sin datos/)).toBeInTheDocument();
  });
});
