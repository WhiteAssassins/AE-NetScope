import type {
  DashboardSummary,
  DeviceRecord,
  InterfaceRecord,
  IpMacRecord,
  InventoryQualityReport,
  NetworkRecord,
  RepositoryInfo,
  ServiceRecord,
  GitHubReleaseDetails,
  GitHubReleaseInfo,
  HealthStatus,
  UpdateStatusInfo,
  User,
  VersionInfo,
  VlanRecord,
  MaintenanceStatus,
  OwnSession,
  PasskeyCapability,
  PasskeyCredential,
  SearchIndexingPolicy,
  UpdateHistoryItem,
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
    qualityResponse,
  ] = await Promise.all([
    fetch(`${API_BASE_URL}/inventory/dashboard`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/devices`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/networks`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/vlans`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/services`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/ip-addresses`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/interfaces`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/quality`, { credentials: "include" }),
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
    quality: qualityResponse.ok
      ? ((await qualityResponse.json()) as InventoryQualityReport)
      : null,
  };
}

export async function fetchVersionInfo() {
  const response = await fetch(`${API_BASE_URL}/version`, { credentials: "include" });
  if (!response.ok) {
    throw new Error("version-unavailable");
  }
  return (await response.json()) as VersionInfo;
}

export async function fetchRepositoryInfo() {
  const response = await fetch(`${API_BASE_URL}/version/repository`);
  if (!response.ok) {
    throw new Error("repository-info-unavailable");
  }
  return (await response.json()) as RepositoryInfo;
}

export async function fetchHealthStatus() {
  const response = await fetch(`${API_BASE_URL}/health/status`, { credentials: "include" });
  if (response.ok) {
    return (await response.json()) as HealthStatus;
  }
  if (response.status >= 500) {
    const fallback = await fetch(`${API_BASE_URL}/health/summary`);
    if (fallback.ok) {
      return (await fallback.json()) as HealthStatus;
    }
  }
  throw new Error("health-unavailable");
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

export async function fetchReleaseHistory(limit = 5) {
  const params = new URLSearchParams({ channel: "all", limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/version/releases?${params}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("release-history-unavailable");
  }
  return (await response.json()) as GitHubReleaseDetails[];
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

export async function updatePreferredLanguage(language: string, csrfToken: string) {
  const response = await fetch(`${API_BASE_URL}/auth/preferences/language`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ language }),
  });
  if (!response.ok) {
    throw new Error("language-update-failed");
  }
  return (await response.json()) as { user: User };
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...init });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string | { message?: string };
    } | null;
    const detail = payload?.detail;
    throw new Error(
      typeof detail === "string" ? detail : detail?.message ?? "request-failed",
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function csrfJson(csrfToken: string, body?: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function updateRegionalPreferences(
  preferences: { timezone: string; date_format: "locale" | "ymd" | "dmy" | "mdy"; hour_format: "12" | "24" },
  csrfToken: string,
) {
  return apiJson<{ user: User }>("/auth/preferences/regional", {
    method: "PATCH",
    ...csrfJson(csrfToken, preferences),
  });
}

export function updateAccountPreferences(
  preferences: {
    language: string;
    timezone: string;
    date_format: "locale" | "ymd" | "dmy" | "mdy";
    hour_format: "12" | "24";
  },
  csrfToken: string,
) {
  return apiJson<{ user: User }>("/auth/preferences", {
    method: "PATCH",
    ...csrfJson(csrfToken, preferences),
  });
}

export function fetchOwnSessions() {
  return apiJson<OwnSession[]>("/auth/sessions");
}

export async function revokeOtherSessions(csrfToken: string) {
  await apiJson<void>("/auth/sessions/others", {
    method: "DELETE",
    ...csrfJson(csrfToken),
  });
}

export function beginTotpSetup(currentPassword: string, csrfToken: string) {
  return apiJson<{ secret: string; otpauth_uri: string }>("/auth/totp/setup", {
    method: "POST",
    ...csrfJson(csrfToken, { current_password: currentPassword }),
  });
}

export function confirmTotp(code: string, csrfToken: string) {
  return apiJson<{ user: User }>("/auth/totp/confirm", {
    method: "POST",
    ...csrfJson(csrfToken, { code }),
  });
}

export function disableTotp(currentPassword: string, code: string, csrfToken: string) {
  return apiJson<{ user: User }>("/auth/totp", {
    method: "DELETE",
    ...csrfJson(csrfToken, { current_password: currentPassword, code }),
  });
}

export function fetchPasskeyCapability() {
  return apiJson<PasskeyCapability>("/security/passkeys/capability");
}

export function fetchPasskeys() {
  return apiJson<PasskeyCredential[]>("/security/passkeys");
}

export function beginPasskeyRegistration(currentPassword: string, csrfToken: string) {
  return apiJson<{ challenge_id: string; options: Record<string, unknown> }>(
    "/security/passkeys/register/options",
    { method: "POST", ...csrfJson(csrfToken, { current_password: currentPassword }) },
  );
}

export function verifyPasskeyRegistration(
  challengeId: string,
  name: string,
  credential: unknown,
  csrfToken: string,
) {
  return apiJson<PasskeyCredential>("/security/passkeys/register/verify", {
    method: "POST",
    ...csrfJson(csrfToken, { challenge_id: challengeId, name, credential }),
  });
}

export async function deletePasskey(
  credentialId: number,
  currentPassword: string,
  csrfToken: string,
) {
  await apiJson<void>(`/security/passkeys/${credentialId}`, {
    method: "DELETE",
    ...csrfJson(csrfToken, { current_password: currentPassword }),
  });
}

export function beginPasskeyAuthentication(email: string) {
  return apiJson<{ challenge_id: string; options: Record<string, unknown> }>(
    "/security/passkeys/authenticate/options",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) },
  );
}

export function verifyPasskeyAuthentication(challengeId: string, credential: unknown) {
  return apiJson<{ user: User; csrf_token: string }>("/security/passkeys/authenticate/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_id: challengeId, credential }),
  });
}

export function fetchMaintenanceStatus() {
  return apiJson<MaintenanceStatus>("/security/maintenance");
}

export function updateMaintenanceStatus(
  maintenance: MaintenanceStatus,
  csrfToken: string,
) {
  return apiJson<MaintenanceStatus>("/security/maintenance", {
    method: "PATCH",
    ...csrfJson(csrfToken, maintenance),
  });
}

export function fetchSearchIndexingPolicy() {
  return apiJson<SearchIndexingPolicy>("/security/search-indexing");
}

export function updateSearchIndexingPolicy(
  policy: SearchIndexingPolicy,
  csrfToken: string,
) {
  return apiJson<SearchIndexingPolicy>("/security/search-indexing", {
    method: "PATCH",
    ...csrfJson(csrfToken, policy),
  });
}

export function fetchUpdateHistory() {
  return apiJson<UpdateHistoryItem[]>("/version/update-history");
}
