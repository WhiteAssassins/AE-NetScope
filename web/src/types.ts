export type User = {
  id: number;
  email: string;
  username: string;
  role: string;
  permissions: string[];
  must_change_password: boolean;
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
  networks: Array<{ cidr: string; device_count: number }>;
};

export type DeviceRecord = {
  id: number;
  name: string;
  device_type: string;
  status: string;
  vendor: string | null;
  model: string | null;
  operating_system: string | null;
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

export type ViewName =
  | "dashboard"
  | "devices"
  | "ipMacs"
  | "networks"
  | "vlans"
  | "services"
  | "audit"
  | "users";
