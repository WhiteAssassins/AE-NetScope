import {
  Bell,
  Box,
  Cable,
  ChevronDown,
  CircleHelp,
  Clock3,
  DatabaseBackup,
  FileText,
  HardDrive,
  Home,
  Import,
  Layers3,
  LogOut,
  Menu,
  Monitor,
  Network,
  RefreshCcw,
  Route,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Tag,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import "./App.css";

type NavItem = { label: string; icon: LucideIcon; active?: boolean };
type User = {
  id: number;
  email: string;
  username: string;
  role: string;
  permissions: string[];
  must_change_password: boolean;
};
type DashboardSummary = {
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
type DeviceRecord = {
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
type DeviceDetail = DeviceRecord & {
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
type NetworkRecord = {
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
type VlanRecord = {
  id: number;
  vlan_id: number;
  name: string;
  description: string | null;
};
type InterfaceRecord = {
  id: number;
  name: string;
  mac_address: string | null;
  device_id: number;
  device_name: string;
};
type IpMacRecord = {
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
type ViewName = "dashboard" | "devices" | "ipMacs" | "networks";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

async function fetchInventoryData() {
  const [
    dashboardResponse,
    devicesResponse,
    networksResponse,
    vlansResponse,
    ipMacsResponse,
    interfacesResponse,
  ] = await Promise.all([
    fetch(`${API_BASE_URL}/inventory/dashboard`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/devices`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/networks`, { credentials: "include" }),
    fetch(`${API_BASE_URL}/inventory/vlans`, { credentials: "include" }),
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
    ipMacs: ipMacsResponse.ok ? ((await ipMacsResponse.json()) as IpMacRecord[]) : [],
    interfaces: interfacesResponse.ok
      ? ((await interfacesResponse.json()) as InterfaceRecord[])
      : [],
  };
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "",
    items: [{ label: "Dashboard", icon: Home, active: true }],
  },
  {
    label: "Inventario",
    items: [
      { label: "Dispositivos", icon: Monitor },
      { label: "IPs y MACs", icon: Network },
      { label: "Subredes", icon: Route },
      { label: "VLANs", icon: Cable },
      { label: "Servicios", icon: ShieldCheck },
      { label: "Hardware", icon: HardDrive },
      { label: "Notas técnicas", icon: FileText },
    ],
  },
  {
    label: "Historial",
    items: [{ label: "Cambios", icon: Clock3 }],
  },
  {
    label: "Herramientas",
    items: [
      { label: "Importar / Exportar", icon: Import },
      { label: "Respaldos", icon: DatabaseBackup },
    ],
  },
  {
    label: "Configuración",
    items: [
      { label: "Usuarios", icon: UsersRound },
      { label: "Roles y permisos", icon: ShieldCheck },
      { label: "Ajustes", icon: Settings },
    ],
  },
];

const changes = [
  {
    title: "Dispositivo agregado: SRV-APP-02",
    subtitle: "Por admin",
    time: "Hace 1 hora",
    icon: PlusIcon,
    tone: "green",
  },
  {
    title: "IP actualizada: 10.0.1.25",
    subtitle: "En SW-Core-01",
    time: "Hace 2 horas",
    icon: EditIcon,
    tone: "blue",
  },
  {
    title: "VLAN creada: VLAN 30 - Invitados",
    subtitle: "Por admin",
    time: "Hace 5 horas",
    icon: Tag,
    tone: "orange",
  },
  {
    title: "Nota técnica actualizada: Configuración OSPF",
    subtitle: "Por admin",
    time: "Ayer 21:30",
    icon: FileText,
    tone: "violet",
  },
  {
    title: "Dispositivo eliminado: PC-OLD-03",
    subtitle: "Por admin",
    time: "Ayer 19:10",
    icon: Trash2,
    tone: "red",
  },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [networks, setNetworks] = useState<NetworkRecord[]>([]);
  const [vlans, setVlans] = useState<VlanRecord[]>([]);
  const [ipMacs, setIpMacs] = useState<IpMacRecord[]>([]);
  const [interfaces, setInterfaces] = useState<InterfaceRecord[]>([]);
  const [view, setView] = useState<ViewName>("dashboard");
  const [csrfToken, setCsrfToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          setUser(null);
          if (response.status === 401) {
            setSessionMessage("La sesion expiro. Inicia sesion nuevamente.");
          }
          return;
        }

        const data = (await response.json()) as { user: User };
        setUser(data.user);
        const csrfResponse = await fetch(`${API_BASE_URL}/auth/csrf`, {
          credentials: "include",
        });
        if (csrfResponse.ok) {
          const csrfData = (await csrfResponse.json()) as { csrf_token: string };
          setCsrfToken(csrfData.csrf_token);
        }
        if (!data.user.must_change_password) {
          const inventoryData = await fetchInventoryData();
          setDashboard(inventoryData.dashboard);
          setDevices(inventoryData.devices);
          setNetworks(inventoryData.networks);
          setVlans(inventoryData.vlans);
          setIpMacs(inventoryData.ipMacs);
          setInterfaces(inventoryData.interfaces);
        }
      })
      .catch((error) => {
        setUser(null);
        if (error instanceof Error && error.message === "unauthorized") {
          setSessionMessage("La sesion expiro. Inicia sesion nuevamente.");
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function handleLogout() {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrfToken },
    });
    setUser(null);
    setCsrfToken("");
  }

  async function refreshInventory() {
    try {
      const inventoryData = await fetchInventoryData();
      setDashboard(inventoryData.dashboard);
      setDevices(inventoryData.devices);
      setNetworks(inventoryData.networks);
      setVlans(inventoryData.vlans);
      setIpMacs(inventoryData.ipMacs);
      setInterfaces(inventoryData.interfaces);
    } catch (error) {
      if (error instanceof Error && error.message === "unauthorized") {
        setUser(null);
        setSessionMessage("La sesion expiro. Inicia sesion nuevamente.");
      }
    }
  }

  if (isLoading) {
    return <div className="auth-loading">AE NetScope</div>;
  }

  if (!user) {
    return (
      <LoginScreen
        message={sessionMessage}
        onLogin={(nextUser, nextCsrfToken) => {
          setUser(nextUser);
          setCsrfToken(nextCsrfToken);
          setSessionMessage("");
          if (!nextUser.must_change_password) {
            refreshInventory().catch(() => undefined);
          }
        }}
      />
    );
  }

  if (user.must_change_password) {
    return (
      <ChangePasswordScreen
        csrfToken={csrfToken}
        onPasswordChanged={(nextUser) => {
          setUser(nextUser);
          refreshInventory().catch(() => undefined);
        }}
      />
    );
  }

  const stats = buildStats(dashboard);
  const chartData = buildChartData(dashboard);
  const totalElements = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="AE NetScope">
          <span className="brand-mark">
            <Network size={29} strokeWidth={1.8} />
          </span>
          <span>AE NetScope</span>
        </a>

        <nav className="nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label || "main"}>
              {group.label && <p className="nav-label">{group.label}</p>}
              {group.items.map((item) => (
                <button
                  className={
                    isActiveNav(item.label, view)
                      ? "nav-item active button-reset"
                      : "nav-item button-reset"
                  }
                  key={item.label}
                  onClick={() => {
                    if (item.label === "Dashboard") {
                      setView("dashboard");
                    }
                    if (item.label === "Dispositivos") {
                      setView("devices");
                    }
                    if (item.label === "IPs y MACs") {
                      setView("ipMacs");
                    }
                    if (item.label === "Subredes") {
                      setView("networks");
                    }
                  }}
                >
                  <item.icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout button-reset" onClick={handleLogout}>
            <LogOut size={18} strokeWidth={1.8} />
            <span>Cerrar sesión</span>
          </button>
          <a className="help-card" href="#">
            <CircleHelp size={20} strokeWidth={1.8} />
            <span>
              ¿Necesitas ayuda?
              <strong>Contáctanos</strong>
            </span>
          </a>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button" aria-label="Abrir menú">
            <Menu size={24} strokeWidth={1.7} />
          </button>
          <label className="search-box">
            <Search size={20} strokeWidth={1.8} />
            <input placeholder="Buscar en AE NetScope..." />
            <kbd>⌘ K</kbd>
          </label>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notificaciones">
              <Bell size={22} strokeWidth={1.7} />
            </button>
            <button className="icon-button" aria-label="Ayuda">
              <CircleHelp size={22} strokeWidth={1.7} />
            </button>
            <button className="avatar" aria-label={`Perfil de ${user.username}`}>
              {user.username.slice(0, 2).toUpperCase()}
            </button>
            <button className="user-menu">
              {user.username} <ChevronDown size={17} />
            </button>
          </div>
        </header>

        <section className="content">
          {view === "dashboard" ? (
            <>
              <div className="page-title">
                <h1>Bienvenido, {user.username}</h1>
                <p>Resumen general de tu red</p>
              </div>

              <section className="stats-grid" aria-label="Resumen del inventario">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <div className={`stat-icon ${stat.tone}`}>
                  <stat.icon size={25} strokeWidth={1.8} />
                </div>
                <div>
                  <p>{stat.label}</p>
                  <strong>{stat.value}</strong>
                  <a href="#">Ver todos</a>
                </div>
              </article>
            ))}
              </section>

              <section className="dashboard-grid">
            <Card className="recent-devices span-7" title="Dispositivos recientes">
              <button className="card-link top-link text-button" onClick={() => setView("devices")}>
                Ver todos
              </button>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>IP principal</th>
                      <th>MAC</th>
                      <th>Estado</th>
                      <th>Último cambio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.recent_devices ?? []).map((device) => (
                      <tr key={device.id}>
                        <td>
                          <a className="device-name" href="#">
                            {device.name}
                          </a>
                        </td>
                        <td>
                          <span className={`pill ${typeTone(device.device_type)}`}>
                            {device.device_type}
                          </span>
                        </td>
                        <td>{device.primary_ip ?? "-"}</td>
                        <td>{device.primary_mac ?? "-"}</td>
                        <td>
                          <span className="status-dot" /> {titleCase(device.status)}
                        </td>
                        <td>{device.last_change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="network-summary span-5" title="Resumen de la red">
              <div className="summary-layout">
                <div className="donut">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        innerRadius={72}
                        outerRadius={102}
                        paddingAngle={1}
                        startAngle={90}
                        endAngle={450}
                      >
                        {chartData.map((entry) => (
                          <Cell fill={entry.color} key={entry.name} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <strong>{totalElements}</strong>
                    <span>Elementos</span>
                  </div>
                </div>
                <div className="legend">
                  {chartData.map((entry) => (
                    <div className="legend-row" key={entry.name}>
                      <span style={{ background: entry.color }} />
                      <p>{entry.name}</p>
                      <strong>
                        {entry.value} ({totalElements ? ((entry.value / totalElements) * 100).toFixed(1) : "0.0"}%)
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="updated">
                <RefreshCcw size={18} strokeWidth={1.7} />
                Última actualización: Hace 5 minutos
              </div>
            </Card>

            <Card className="span-4" title="Mapa de subredes">
              <div className="subnet-map">
                <div className="root-node">Inventario</div>
                <div className="connector" />
                <div className="branch">
                  {(dashboard?.networks ?? []).map((network) => (
                    <div className="subnet-node" key={network.cidr}>
                      <strong>{network.cidr}</strong>
                      <span>{network.device_count} dispositivos</span>
                    </div>
                  ))}
                </div>
              </div>
              <a className="card-link lower-link" href="#">
                Ver todas las subredes
              </a>
            </Card>

            <Card className="span-3" title="Servicios activos">
              <div className="service-list">
                {(dashboard?.services ?? []).map((service) => (
                  <div className="service-row" key={service.name}>
                    <Server size={18} strokeWidth={1.7} />
                    <strong>{service.name}</strong>
                    <span>{service.device_count} dispositivos</span>
                    <em className={`mini-pill ${service.status === "active" ? "green" : "gray"}`}>
                      {titleCase(service.status)}
                    </em>
                  </div>
                ))}
              </div>
              <a className="card-link lower-link" href="#">
                Ver todos los servicios
              </a>
            </Card>

            <Card className="span-5" title="Últimos cambios">
              <div className="change-list">
                {changes.map((change) => (
                  <div className="change-row" key={change.title}>
                    <span className={`change-icon ${change.tone}`}>
                      <change.icon size={17} strokeWidth={2} />
                    </span>
                    <p>
                      <a href="#">{change.title}</a>
                      <small>{change.subtitle}</small>
                    </p>
                    <time>{change.time}</time>
                  </div>
                ))}
              </div>
              <a className="card-link lower-link" href="#">
                Ver todo el historial de cambios
              </a>
            </Card>
              </section>
            </>
          ) : view === "devices" ? (
            <DevicesView
              csrfToken={csrfToken}
              devices={devices}
              networks={networks}
              onCreated={refreshInventory}
            />
          ) : view === "ipMacs" ? (
            <IpMacsView
              csrfToken={csrfToken}
              interfaces={interfaces}
              ipMacs={ipMacs}
              networks={networks}
              onChanged={refreshInventory}
            />
          ) : (
            <NetworksView
              csrfToken={csrfToken}
              networks={networks}
              onChanged={refreshInventory}
              vlans={vlans}
            />
          )}
        </section>

        <footer className="footer">
          <span>AE NetScope v1.0.0</span>
          <div>
            <a href="#">
              <FileText size={17} /> Documentación
            </a>
            <a href="#">
              <CircleHelp size={17} /> Soporte
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function DevicesView({
  csrfToken,
  devices,
  networks,
  onCreated,
}: {
  csrfToken: string;
  devices: DeviceRecord[];
  networks: NetworkRecord[];
  onCreated: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    device_type: "Equipo",
    vendor: "",
    model: "",
    operating_system: "",
    location: "",
    notes: "",
    interface_name: "eth0",
    mac_address: "",
    ip_address: "",
    network_id: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    device_type: "Equipo",
    status: "active",
    vendor: "",
    model: "",
    operating_system: "",
    location: "",
    notes: "",
  });
  const [interfaceForm, setInterfaceForm] = useState({
    name: "eth1",
    mac_address: "",
    ip_address: "",
    network_id: "",
  });

  const normalizedQuery = query.trim().toLowerCase();
  const filteredDevices = devices.filter((device) => {
    if (!normalizedQuery) {
      return true;
    }
    return [
      device.name,
      device.device_type,
      device.status,
      device.vendor,
      device.model,
      device.operating_system,
      device.location,
      device.primary_ip,
      device.primary_mac,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateEditField(field: keyof typeof editForm, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function updateInterfaceField(field: keyof typeof interfaceForm, value: string) {
    setInterfaceForm((current) => ({ ...current, [field]: value }));
  }

  async function loadDeviceDetail(deviceId: number) {
    setDetailError("");
    const response = await fetch(`${API_BASE_URL}/inventory/devices/${deviceId}`, {
      credentials: "include",
    });
    if (!response.ok) {
      setDetailError("No se pudo cargar el dispositivo.");
      return;
    }
    const device = (await response.json()) as DeviceDetail;
    setSelectedDevice(device);
    setEditForm({
      name: device.name,
      device_type: device.device_type,
      status: device.status,
      vendor: device.vendor ?? "",
      model: device.model ?? "",
      operating_system: device.operating_system ?? "",
      location: device.location ?? "",
      notes: device.notes ?? "",
    });
  }

  async function saveDeviceChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDevice) {
      return;
    }
    setDetailError("");

    const response = await fetch(`${API_BASE_URL}/inventory/devices/${selectedDevice.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        name: editForm.name,
        device_type: editForm.device_type,
        status: editForm.status,
        vendor: editForm.vendor || null,
        model: editForm.model || null,
        operating_system: editForm.operating_system || null,
        location: editForm.location || null,
        notes: editForm.notes || null,
      }),
    });
    if (!response.ok) {
      setDetailError("No se pudo guardar. Revisa nombres duplicados o campos invalidos.");
      return;
    }
    setSelectedDevice((await response.json()) as DeviceDetail);
    await onCreated();
  }

  async function addInterface(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDevice) {
      return;
    }
    setDetailError("");

    const response = await fetch(
      `${API_BASE_URL}/inventory/devices/${selectedDevice.id}/interfaces`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          name: interfaceForm.name,
          mac_address: interfaceForm.mac_address || null,
          ip_address: interfaceForm.ip_address || null,
          network_id: interfaceForm.network_id ? Number(interfaceForm.network_id) : null,
        }),
      },
    );
    if (!response.ok) {
      setDetailError("No se pudo agregar la interfaz. Revisa duplicados o formato.");
      return;
    }
    setInterfaceForm({ name: "eth1", mac_address: "", ip_address: "", network_id: "" });
    await loadDeviceDetail(selectedDevice.id);
    await onCreated();
  }

  async function deactivateSelectedDevice() {
    if (!selectedDevice) {
      return;
    }
    setDetailError("");
    const response = await fetch(
      `${API_BASE_URL}/inventory/devices/${selectedDevice.id}/deactivate`,
      {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      },
    );
    if (!response.ok) {
      setDetailError("No se pudo desactivar el dispositivo.");
      return;
    }
    setSelectedDevice((await response.json()) as DeviceDetail);
    await onCreated();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    const payload = {
      name: form.name,
      device_type: form.device_type,
      vendor: form.vendor || null,
      model: form.model || null,
      operating_system: form.operating_system || null,
      location: form.location || null,
      notes: form.notes || null,
      interface:
        form.mac_address || form.ip_address
          ? {
              name: form.interface_name || "eth0",
              mac_address: form.mac_address || null,
              ip_address: form.ip_address || null,
              network_id: form.network_id ? Number(form.network_id) : null,
            }
          : null,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/inventory/devices`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError("No se pudo crear el dispositivo. Revisa campos duplicados o invalidos.");
        return;
      }

      setMessage("Dispositivo creado.");
      setForm({
        name: "",
        device_type: "Equipo",
        vendor: "",
        model: "",
        operating_system: "",
        location: "",
        notes: "",
        interface_name: "eth0",
        mac_address: "",
        ip_address: "",
        network_id: "",
      });
      await onCreated();
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteSelectedIp() {
    if (!selectedIp) {
      return;
    }
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/inventory/ip-addresses/${selectedIp.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });

      if (!response.ok) {
        setError("No se pudo eliminar la IP.");
        return;
      }

      setMessage("IP eliminada.");
      resetForm();
      setShowForm(false);
      await onChanged();
    } catch {
      setError("No se pudo conectar con la API.");
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Dispositivos</h1>
          <p>Inventario operativo de hosts, equipos de red y servidores.</p>
        </div>
        <button className="primary-action" onClick={() => setShowForm((value) => !value)}>
          <PlusIcon size={18} strokeWidth={2} />
          {showForm ? "Ocultar formulario" : "Nuevo dispositivo"}
        </button>
      </div>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, IP, MAC, tipo..."
                value={query}
              />
            </label>
            <span>{filteredDevices.length} dispositivos</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>IP principal</th>
                  <th>MAC</th>
                  <th>Fabricante</th>
                  <th>Ubicacion</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <button
                        className="device-name row-action"
                        onClick={() => loadDeviceDetail(device.id)}
                      >
                        {device.name}
                      </button>
                    </td>
                    <td>
                      <span className={`pill ${typeTone(device.device_type)}`}>
                        {device.device_type}
                      </span>
                    </td>
                    <td>{device.primary_ip ?? "-"}</td>
                    <td>{device.primary_mac ?? "-"}</td>
                    <td>{device.vendor ?? "-"}</td>
                    <td>{device.location ?? "-"}</td>
                    <td>
                      <span className="status-dot" /> {titleCase(device.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {showForm && (
          <article className="panel device-form-panel">
            <h2>Nuevo dispositivo</h2>
            <form className="inventory-form" onSubmit={handleSubmit}>
              <label>
                Nombre
                <input
                  onChange={(event) => updateField("name", event.target.value)}
                  required
                  value={form.name}
                />
              </label>
              <label>
                Tipo
                <select
                  onChange={(event) => updateField("device_type", event.target.value)}
                  value={form.device_type}
                >
                  <option>Equipo</option>
                  <option>Servidor</option>
                  <option>Switch</option>
                  <option>Router</option>
                  <option>Access Point</option>
                  <option>Impresora</option>
                  <option>Otro</option>
                </select>
              </label>
              <label>
                Fabricante
                <input
                  onChange={(event) => updateField("vendor", event.target.value)}
                  value={form.vendor}
                />
              </label>
              <label>
                Modelo
                <input
                  onChange={(event) => updateField("model", event.target.value)}
                  value={form.model}
                />
              </label>
              <label>
                Sistema operativo
                <input
                  onChange={(event) => updateField("operating_system", event.target.value)}
                  value={form.operating_system}
                />
              </label>
              <label>
                Ubicacion
                <input
                  onChange={(event) => updateField("location", event.target.value)}
                  value={form.location}
                />
              </label>
              <label>
                Interfaz
                <input
                  onChange={(event) => updateField("interface_name", event.target.value)}
                  value={form.interface_name}
                />
              </label>
              <label>
                MAC
                <input
                  onChange={(event) => updateField("mac_address", event.target.value)}
                  placeholder="00:11:22:33:44:aa"
                  value={form.mac_address}
                />
              </label>
              <label>
                IP
                <input
                  onChange={(event) => updateField("ip_address", event.target.value)}
                  placeholder="10.0.0.10"
                  value={form.ip_address}
                />
              </label>
              <label>
                Subred
                <select
                  onChange={(event) => updateField("network_id", event.target.value)}
                  value={form.network_id}
                >
                  <option value="">Sin subred</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.cidr} - {network.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-wide">
                Notas
                <textarea
                  onChange={(event) => updateField("notes", event.target.value)}
                  value={form.notes}
                />
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Guardando..." : "Crear dispositivo"}
              </button>
            </form>
          </article>
        )}

        {selectedDevice && (
          <article className="panel device-detail-panel">
            <div className="detail-heading">
              <div>
                <h2>{selectedDevice.name}</h2>
                <p>{selectedDevice.primary_ip ?? "Sin IP principal"}</p>
              </div>
              <button className="text-button" onClick={() => setSelectedDevice(null)}>
                Cerrar
              </button>
            </div>

            {detailError && <p className="login-error">{detailError}</p>}

            <form className="inventory-form" onSubmit={saveDeviceChanges}>
              <label>
                Nombre
                <input
                  onChange={(event) => updateEditField("name", event.target.value)}
                  required
                  value={editForm.name}
                />
              </label>
              <label>
                Tipo
                <select
                  onChange={(event) => updateEditField("device_type", event.target.value)}
                  value={editForm.device_type}
                >
                  <option>Equipo</option>
                  <option>Servidor</option>
                  <option>Switch</option>
                  <option>Router</option>
                  <option>Access Point</option>
                  <option>Impresora</option>
                  <option>Otro</option>
                </select>
              </label>
              <label>
                Estado
                <select
                  onChange={(event) => updateEditField("status", event.target.value)}
                  value={editForm.status}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="reserved">Reservado</option>
                  <option value="unknown">Desconocido</option>
                </select>
              </label>
              <label>
                Fabricante
                <input
                  onChange={(event) => updateEditField("vendor", event.target.value)}
                  value={editForm.vendor}
                />
              </label>
              <label>
                Modelo
                <input
                  onChange={(event) => updateEditField("model", event.target.value)}
                  value={editForm.model}
                />
              </label>
              <label>
                Sistema operativo
                <input
                  onChange={(event) => updateEditField("operating_system", event.target.value)}
                  value={editForm.operating_system}
                />
              </label>
              <label className="form-wide">
                Ubicacion
                <input
                  onChange={(event) => updateEditField("location", event.target.value)}
                  value={editForm.location}
                />
              </label>
              <label className="form-wide">
                Notas
                <textarea
                  onChange={(event) => updateEditField("notes", event.target.value)}
                  value={editForm.notes}
                />
              </label>
              <button className="login-button form-wide" type="submit">
                Guardar cambios
              </button>
            </form>

            <div className="detail-section">
              <h3>Interfaces</h3>
              <div className="interface-list">
                {selectedDevice.interfaces.map((item) => (
                  <div className="interface-row" key={item.id}>
                    <strong>{item.name}</strong>
                    <span>{item.mac_address ?? "Sin MAC"}</span>
                    <small>
                      {item.ip_addresses.length
                        ? item.ip_addresses.map((ip) => ip.address).join(", ")
                        : "Sin IP"}
                    </small>
                  </div>
                ))}
              </div>
            </div>

            <form className="inventory-form detail-section" onSubmit={addInterface}>
              <h3 className="form-wide">Agregar interfaz</h3>
              <label>
                Nombre
                <input
                  onChange={(event) => updateInterfaceField("name", event.target.value)}
                  required
                  value={interfaceForm.name}
                />
              </label>
              <label>
                MAC
                <input
                  onChange={(event) => updateInterfaceField("mac_address", event.target.value)}
                  placeholder="00:11:22:33:44:aa"
                  value={interfaceForm.mac_address}
                />
              </label>
              <label>
                IP
                <input
                  onChange={(event) => updateInterfaceField("ip_address", event.target.value)}
                  placeholder="10.0.0.20"
                  value={interfaceForm.ip_address}
                />
              </label>
              <label>
                Subred
                <select
                  onChange={(event) => updateInterfaceField("network_id", event.target.value)}
                  value={interfaceForm.network_id}
                >
                  <option value="">Sin subred</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.cidr} - {network.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="login-button form-wide" type="submit">
                Agregar interfaz
              </button>
            </form>

            <button className="danger-action" onClick={deactivateSelectedDevice}>
              Desactivar dispositivo
            </button>
          </article>
        )}
      </section>
    </>
  );
}

function IpMacsView({
  csrfToken,
  ipMacs,
  interfaces,
  networks,
  onChanged,
}: {
  csrfToken: string;
  ipMacs: IpMacRecord[];
  interfaces: InterfaceRecord[];
  networks: NetworkRecord[];
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedIp, setSelectedIp] = useState<IpMacRecord | null>(null);
  const [form, setForm] = useState({
    address: "",
    assignment_type: "static",
    network_id: "",
    interface_id: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredIpMacs = ipMacs.filter((item) => {
    const matchesQuery =
      !normalizedQuery ||
      [
        item.address,
        item.mac_address,
        item.device_name,
        item.interface_name,
        item.network_cidr,
        item.vlan_name,
        item.assignment_type,
        item.state,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    const matchesState = stateFilter === "all" || item.state === stateFilter;
    return matchesQuery && matchesState;
  });

  const activeCount = ipMacs.filter((item) => item.state === "active").length;
  const reservedCount = ipMacs.filter((item) => item.state === "reserved").length;
  const unassignedCount = ipMacs.filter((item) => item.state === "unassigned").length;

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectIp(item: IpMacRecord) {
    setSelectedIp(item);
    setShowForm(true);
    setMessage("");
    setError("");
    setForm({
      address: item.address,
      assignment_type: item.assignment_type,
      network_id: item.network_id ? String(item.network_id) : "",
      interface_id: item.interface_id ? String(item.interface_id) : "",
    });
  }

  function resetForm() {
    setSelectedIp(null);
    setForm({ address: "", assignment_type: "static", network_id: "", interface_id: "" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);

    const payload = {
      address: form.address,
      assignment_type: form.assignment_type,
      network_id: form.network_id ? Number(form.network_id) : null,
      interface_id: form.interface_id ? Number(form.interface_id) : null,
    };
    const endpoint = selectedIp
      ? `${API_BASE_URL}/inventory/ip-addresses/${selectedIp.id}`
      : `${API_BASE_URL}/inventory/ip-addresses`;

    try {
      const response = await fetch(endpoint, {
        method: selectedIp ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError("No se pudo guardar la IP. Revisa duplicados, formato o asignacion.");
        return;
      }

      setMessage(selectedIp ? "IP actualizada." : "IP registrada.");
      resetForm();
      await onChanged();
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>IPs y MACs</h1>
          <p>Tabla operativa de direccionamiento, interfaces y asignaciones.</p>
        </div>
        <button
          className="primary-action"
          onClick={() => {
            setShowForm((value) => !value);
            if (!showForm) {
              resetForm();
            }
          }}
        >
          <PlusIcon size={18} strokeWidth={2} />
          {showForm ? "Ocultar formulario" : "Nueva IP"}
        </button>
      </div>

      <section className="ip-summary-grid" aria-label="Resumen de IPs y MACs">
        <article className="mini-stat">
          <strong>{ipMacs.length}</strong>
          <span>IPs registradas</span>
        </article>
        <article className="mini-stat green">
          <strong>{activeCount}</strong>
          <span>Activas</span>
        </article>
        <article className="mini-stat orange">
          <strong>{reservedCount}</strong>
          <span>Reservadas</span>
        </article>
        <article className="mini-stat gray">
          <strong>{unassignedCount}</strong>
          <span>Sin asignar</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por IP, MAC, dispositivo, subred..."
                value={query}
              />
            </label>
            <select
              className="filter-select"
              onChange={(event) => setStateFilter(event.target.value)}
              value={stateFilter}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activas</option>
              <option value="reserved">Reservadas</option>
              <option value="unassigned">Sin asignar</option>
            </select>
            <span>{filteredIpMacs.length} registros</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>IP</th>
                  <th>MAC</th>
                  <th>Dispositivo</th>
                  <th>Interfaz</th>
                  <th>Subred</th>
                  <th>VLAN</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredIpMacs.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button className="device-name row-action" onClick={() => selectIp(item)}>
                        {item.address}
                      </button>
                    </td>
                    <td>{item.mac_address ?? "-"}</td>
                    <td>{item.device_name ?? "-"}</td>
                    <td>{item.interface_name ?? "-"}</td>
                    <td>{item.network_cidr ?? "-"}</td>
                    <td>{item.vlan_id ? `${item.vlan_id} - ${item.vlan_name}` : "-"}</td>
                    <td>{titleCase(item.assignment_type)}</td>
                    <td>
                      <span className={`mini-pill ${stateTone(item.state)}`}>
                        {stateLabel(item.state)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {showForm && (
          <article className="panel device-form-panel">
            <h2>{selectedIp ? "Editar IP" : "Nueva IP"}</h2>
            <form className="inventory-form" onSubmit={handleSubmit}>
              <label className="form-wide">
                IP
                <input
                  onChange={(event) => updateField("address", event.target.value)}
                  placeholder="10.0.0.25"
                  required
                  value={form.address}
                />
              </label>
              <label>
                Tipo
                <select
                  onChange={(event) => updateField("assignment_type", event.target.value)}
                  value={form.assignment_type}
                >
                  <option value="static">Estatica</option>
                  <option value="dhcp">DHCP</option>
                  <option value="reserved">Reservada</option>
                </select>
              </label>
              <label>
                Subred
                <select
                  onChange={(event) => updateField("network_id", event.target.value)}
                  value={form.network_id}
                >
                  <option value="">Sin subred</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.cidr} - {network.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-wide">
                Interfaz
                <select
                  onChange={(event) => updateField("interface_id", event.target.value)}
                  value={form.interface_id}
                >
                  <option value="">Sin asignar</option>
                  {interfaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.device_name} / {item.name}
                      {item.mac_address ? ` - ${item.mac_address}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Guardando..." : selectedIp ? "Guardar IP" : "Registrar IP"}
              </button>
            </form>
            {selectedIp && (
              <button className="danger-action panel-action" onClick={deleteSelectedIp}>
                Eliminar IP
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}

function LoginScreen({
  message,
  onLogin,
}: {
  message?: string;
  onLogin: (user: User, csrfToken: string) => void;
}) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError(
          response.status === 423
            ? "La cuenta esta bloqueada temporalmente."
            : "Correo o contrasena invalidos.",
        );
        return;
      }

      const data = (await response.json()) as { user: User; csrf_token: string };
      onLogin(data.user, data.csrf_token);
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">
            <Network size={31} strokeWidth={1.8} />
          </span>
          <strong>AE NetScope</strong>
        </div>
        <div className="login-copy">
          <h1>Acceso seguro</h1>
          <p>Inicia sesion para administrar el inventario de red.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Correo
            <input
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Contrasena
            <input
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {message && <p className="login-notice">{message}</p>}
          {error && <p className="login-error">{error}</p>}
          <button className="login-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ChangePasswordScreen({
  csrfToken,
  onPasswordChanged,
}: {
  csrfToken: string;
  onPasswordChanged: (user: User) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        setError(
          response.status === 403
            ? "La sesion expiro. Inicia sesion nuevamente."
            : "No se pudo cambiar la contrasena.",
        );
        return;
      }

      const data = (await response.json()) as { user: User };
      onPasswordChanged(data.user);
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">
            <Network size={31} strokeWidth={1.8} />
          </span>
          <strong>AE NetScope</strong>
        </div>
        <div className="login-copy">
          <h1>Cambia tu contrasena</h1>
          <p>Debes reemplazar la contrasena inicial antes de entrar al panel.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Contrasena actual
            <input
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>
          <label>
            Nueva contrasena
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </label>
          <label>
            Confirmar contrasena
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button className="login-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Guardando..." : "Actualizar contrasena"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Card({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article className={`panel ${className ?? ""}`}>
      <h2>{title}</h2>
      {children}
    </article>
  );
}

function buildStats(dashboard: DashboardSummary | null) {
  return [
    {
      label: "Dispositivos",
      value: String(dashboard?.stats.devices ?? 0),
      icon: Monitor,
      tone: "blue" as const,
    },
    {
      label: "IPs registradas",
      value: String(dashboard?.stats.ip_addresses ?? 0),
      icon: Box,
      tone: "green" as const,
    },
    {
      label: "Subredes",
      value: String(dashboard?.stats.networks ?? 0),
      icon: Route,
      tone: "violet" as const,
    },
    {
      label: "VLANs",
      value: String(dashboard?.stats.vlans ?? 0),
      icon: Tag,
      tone: "orange" as const,
    },
    {
      label: "Servicios",
      value: String(dashboard?.stats.services ?? 0),
      icon: Layers3,
      tone: "cyan" as const,
    },
    {
      label: "Notas tecnicas",
      value: String(dashboard?.stats.notes ?? 0),
      icon: FileText,
      tone: "gray" as const,
    },
  ];
}

function buildChartData(dashboard: DashboardSummary | null) {
  return [
    { name: "Dispositivos", value: dashboard?.stats.devices ?? 0, color: "#3857f6" },
    { name: "IPs y MACs", value: dashboard?.stats.ip_addresses ?? 0, color: "#30b866" },
    { name: "Subredes", value: dashboard?.stats.networks ?? 0, color: "#7446dc" },
    { name: "VLANs", value: dashboard?.stats.vlans ?? 0, color: "#f39a16" },
    { name: "Servicios", value: dashboard?.stats.services ?? 0, color: "#12a7ad" },
  ];
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stateLabel(value: string) {
  if (value === "active") return "Activa";
  if (value === "reserved") return "Reservada";
  if (value === "unassigned") return "Sin asignar";
  return titleCase(value);
}

function stateTone(value: string) {
  if (value === "active") return "green";
  if (value === "reserved") return "orange";
  return "gray";
}

function isActiveNav(label: string, view: ViewName) {
  return (
    (label === "Dashboard" && view === "dashboard") ||
    (label === "Dispositivos" && view === "devices") ||
    (label === "IPs y MACs" && view === "ipMacs")
  );
}

function typeTone(type: string) {
  if (type === "Servidor") return "server";
  if (type === "Access Point") return "access";
  if (type === "Equipo") return "workstation";
  return "network";
}

function PlusIcon({ size = 17, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

function EditIcon({ size = 17, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m4 16.5-.7 4.2 4.2-.7L18.2 9.3l-3.5-3.5L4 16.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m13.7 6.8 3.5 3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

export default App;
