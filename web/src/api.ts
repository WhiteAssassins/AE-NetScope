import type {
  DashboardSummary,
  DeviceRecord,
  InterfaceRecord,
  IpMacRecord,
  NetworkRecord,
  ServiceRecord,
  VlanRecord,
} from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

export async function fetchInventoryData() {
  const [
    dashboardResponse,
    devicesResponse,
    networksResponse,
    vlansResponse,
    servicesResponse,
    ipMacsResponse,
    interfacesResponse,
  ] = await Promise.all([
    fetch(`${API_BASE_URL}/inventory/dashboard`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/devices`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/networks`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/vlans`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/services`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/ip-addresses`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/interfaces`, { credentials: "include" }),
  ]);

  if (dashboardResponse.status === 401 || devicesResponse.status === 401) {
    throw new Error("unauthorized");
  }

  return {
    dashboard: dashboardResponse.ok
      ? ((await dashboardResponse.json()) as DashboardSummary)
      : null,
    devices: devicesResponse.ok ? ((await devicesResponse.json()) as DeviceRecord[]) : [],
    networks: networksResponse.ok ? ((await networksResponse.json()) as NetworkRecord[]) : [],
    vlans: vlansResponse.ok ? ((await vlansResponse.json()) as VlanRecord[]) : [],
    services: servicesResponse.ok ? ((await servicesResponse.json()) as ServiceRecord[]) : [],
    ipMacs: ipMacsResponse.ok ? ((await ipMacsResponse.json()) as IpMacRecord[]) : [],
    interfaces: interfacesResponse.ok
      ? ((await interfacesResponse.json()) as InterfaceRecord[])
      : [],
  };
}
