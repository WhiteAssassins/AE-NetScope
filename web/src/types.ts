export type User = {
  id: number;
  email: string;
  username: string;
  role: string;
  permissions: string[];
  must_change_password: boolean;
  preferred_language: string;
  timezone?: string;
  date_format?: "locale" | "ymd" | "dmy" | "mdy";
  hour_format?: "12" | "24";
  totp_enabled?: boolean;
};

export type OwnSession = {
  id: number;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  is_current: boolean;
};

export type PasskeyCredential = {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
};

export type PasskeyCapability = { enabled: boolean; reason: string | null };
export type MaintenanceStatus = { enabled: boolean; message: string };
export type SearchIndexingPolicy = { allow_indexing: boolean };
export type UpdateHistoryItem = {
  id: number;
  requested_by_user_id: number | null;
  requested_by: string | null;
  target_tag: string;
  status: string;
  message: string | null;
  created_at: string;
};

export type ManagedUser = {
  id: number;
  email: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  must_change_password: boolean;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  active_session_count: number;
  totp_enabled: boolean;
  passkey_count: number;
};

export type UserRole = ManagedUser["role"];

export type ManagedUserSession = {
  id: number;
  user_id: number;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  is_current: boolean;
};

export type AuditEvent = {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  actor_email: string | null;
  event_type: string;
  message: string;
  ip_address: string | null;
  created_at: string;
};

export type DashboardSummary = {
  stats: {
    devices: number;
    ip_addresses: number;
    networks: number;
    vlans: number;
    services: number;
    notes: number;
  };
  recent_devices: Array<{
    id: number;
    name: string;
    device_type: string;
    primary_ip: string | null;
    primary_mac: string | null;
    status: string;
    last_change: string;
  }>;
  services: Array<{ name: string; device_count: number; status: string }>;
  networks: Array<{
    cidr: string;
    name: string;
    device_count: number;
    ip_count: number;
    usable_hosts: number;
    utilization_percent: number;
    vlan: VlanRecord | null;
  }>;
};

export type DeviceRecord = {
  id: number;
  name: string;
  device_type: string;
  status: string;
  vendor: string | null;
  model: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  operating_system: string | null;
  firmware_version: string | null;
  cpu: string | null;
  memory: string | null;
  storage: string | null;
  warranty_expires: string | null;
  owner: string | null;
  rack_position: string | null;
  location: string | null;
  notes: string | null;
  primary_ip: string | null;
  primary_mac: string | null;
};

export type DeviceDetail = DeviceRecord & {
  interfaces: Array<{
    id: number;
    name: string;
    mac_address: string | null;
    ip_addresses: Array<{
      id: number;
      address: string;
      assignment_type: string;
      network_id: number | null;
    }>;
  }>;
};

export type NetworkRecord = {
  id: number;
  cidr: string;
  name: string;
  gateway: string | null;
  location: string | null;
  status: string;
  vlan_id: number | null;
  vlan: VlanRecord | null;
  ip_count: number;
  usable_hosts: number;
  utilization_percent: number;
};

export type VlanRecord = {
  id: number;
  vlan_id: number;
  name: string;
  description: string | null;
  network_count: number;
  ip_count: number;
  usable_hosts: number;
  utilization_percent: number;
};

export type InterfaceRecord = {
  id: number;
  name: string;
  mac_address: string | null;
  device_id: number;
  device_name: string;
};

export type InventoryQualitySeverity = "critical" | "warning" | "info";

export type InventoryQualityIssue = {
  code: string;
  severity: InventoryQualitySeverity;
  resource_type: "device" | "ip_address" | "network" | "vlan";
  resource_id: number;
  resource_name: string;
  context: Record<string, string | number>;
};

export type InventoryQualityReport = {
  score: number;
  status: "empty" | "critical" | "attention" | "good" | "excellent";
  records_reviewed: number;
  checks_completed: number;
  checks_passed: number;
  issue_counts: Record<InventoryQualitySeverity, number>;
  issues_total: number;
  issues_truncated: boolean;
  issues: InventoryQualityIssue[];
  relationships: {
    device_ip_links: number;
    ip_network_links: number;
    network_vlan_links: number;
    disconnected_devices: number;
    unassigned_ips: number;
  };
};

export type IpMacRecord = {
  id: number;
  address: string;
  assignment_type: string;
  network_id: number | null;
  interface_id: number | null;
  interface_name: string | null;
  mac_address: string | null;
  device_id: number | null;
  device_name: string | null;
  network_cidr: string | null;
  vlan_id: number | null;
  vlan_name: string | null;
  state: string;
};

export type ServiceRecord = {
  id: number;
  device_id: number;
  device_name: string;
  device_type: string;
  name: string;
  port: number | null;
  protocol: string;
  status: string;
  primary_ip: string | null;
};

export type VersionInfo = {
  app_name: string;
  version: string;
  release_channel: string;
  repository_url: string;
  releases_url: string;
  release_notes_url: string;
};

export type RepositoryInfo = {
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
};

export type GitHubReleaseInfo = {
  tag_name: string;
  html_url: string;
  name: string | null;
  prerelease: boolean;
  draft: boolean;
  published_at: string | null;
};

export type GitHubReleaseDetails = GitHubReleaseInfo & {
  body: string | null;
  body_truncated: boolean;
};

export type UpdateCapability = {
  platform: string;
  automatic_updates_enabled: boolean;
  automatic_updates_supported: boolean;
  reason: string | null;
};

export type UpdateStatusInfo = {
  installed_version: string;
  installed_channel: string;
  target_channel: string;
  update_available: boolean;
  latest_release: GitHubReleaseInfo | null;
  latest_prerelease: GitHubReleaseInfo | null;
  selected_release: GitHubReleaseInfo | null;
  update_capability: UpdateCapability;
};

export type HealthCheckStatus = {
  status: "ok" | "error";
  required: boolean;
  message: string;
  message_code?: string;
  latency_ms?: number | null;
};

export type HealthStatus = {
  status: "ready" | "degraded";
  service: string;
  environment: string;
  version: string;
  release_channel: string;
  checked_at: string;
  duration_ms?: number;
  checks: Record<string, HealthCheckStatus>;
};

export type ViewName =
  | "dashboard"
  | "devices"
  | "ipMacs"
  | "networks"
  | "topology"
  | "quality"
  | "vlans"
  | "services"
  | "hardware"
  | "notes"
  | "audit"
  | "backups"
  | "importExport"
  | "roles"
  | "users"
  | "profile"
  | "health"
  | "updates"
  | "settings"
  | "about"
  | "support";
