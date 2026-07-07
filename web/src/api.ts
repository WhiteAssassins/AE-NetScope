import type {
  DashboardSummary,
  DeviceRecord,
  InterfaceRecord,
  IpMacRecord,
  NetworkRecord,
  ServiceRecord,
  GitHubReleaseInfo,
  HealthStatus,
  UpdateStatusInfo,
  VersionInfo,
  VlanRecord,
} from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";
export const GITHUB_RELEASES_API_URL =
  "https://api.github.com/repos/WhiteAssassins/AE-NetScope/releases";

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

export async function fetchVersionInfo() {
  const response = await fetch(`${API_BASE_URL}/version`, { credentials: "include" });
  if (!response.ok) {
    throw new Error("version-unavailable");
  }
  return (await response.json()) as VersionInfo;
}

export async function fetchHealthStatus() {
  const response = await fetch(`${API_BASE_URL}/health/status`, { credentials: "include" });
  if (!response.ok) {
    throw new Error("health-unavailable");
  }
  return (await response.json()) as HealthStatus;
}

export async function fetchLatestGitHubRelease() {
  const response = await fetch(GITHUB_RELEASES_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error("latest-release-unavailable");
  }

  const releases = (await response.json()) as GitHubReleaseInfo[];
  return releases.find((release) => !release.draft) ?? null;
}

export async function fetchUpdateStatus() {
  const response = await fetch(`${API_BASE_URL}/version/updates`, { credentials: "include" });
  if (!response.ok) {
    throw new Error("update-status-unavailable");
  }
  return (await response.json()) as UpdateStatusInfo;
}

export async function startAutomaticUpdate(tagName: string | null, csrfToken: string) {
  const response = await fetch(`${API_BASE_URL}/version/update`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ tag_name: tagName }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "automatic-update-failed");
  }
  return response.json() as Promise<{ started: boolean; message: string; tag_name: string | null }>;
}
