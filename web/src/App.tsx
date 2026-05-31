import {
  Bell,
  Cable,
  ChevronDown,
  CircleHelp,
  Clock3,
  DatabaseBackup,
  FileText,
  HardDrive,
  Home,
  Import,
  LogOut,
  Menu,
  Monitor,
  Network,
  Route,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { API_BASE_URL, fetchInventoryData } from "./api";
import "./App.css";
import type {
  DashboardSummary,
  DeviceRecord,
  InterfaceRecord,
  IpMacRecord,
  NetworkRecord,
  ServiceRecord,
  User,
  ViewName,
  VlanRecord,
} from "./types";

type NavItem = { label: string; icon: LucideIcon; active?: boolean };

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

const DashboardView = lazy(() => import("./views/DashboardView"));
const AuditView = lazy(() => import("./views/AuditView"));
const ChangePasswordScreen = lazy(() => import("./views/ChangePasswordScreen"));
const DevicesView = lazy(() => import("./views/DevicesView"));
const IpMacsView = lazy(() => import("./views/IpMacsView"));
const LoginScreen = lazy(() => import("./views/LoginScreen"));
const NetworksView = lazy(() => import("./views/NetworksView"));
const ServicesView = lazy(() => import("./views/ServicesView"));
const UsersView = lazy(() => import("./views/UsersView"));
const VlansView = lazy(() => import("./views/VlansView"));

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [networks, setNetworks] = useState<NetworkRecord[]>([]);
  const [vlans, setVlans] = useState<VlanRecord[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
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
            setSessionMessage("La sesión expiró. Inicia sesión nuevamente.");
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
          setServices(inventoryData.services);
          setIpMacs(inventoryData.ipMacs);
          setInterfaces(inventoryData.interfaces);
        }
      })
      .catch((error) => {
        setUser(null);
        if (error instanceof Error && error.message === "unauthorized") {
          setSessionMessage("La sesión expiró. Inicia sesión nuevamente.");
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
      setServices(inventoryData.services);
      setIpMacs(inventoryData.ipMacs);
      setInterfaces(inventoryData.interfaces);
    } catch (error) {
      if (error instanceof Error && error.message === "unauthorized") {
        setUser(null);
        setSessionMessage("La sesión expiró. Inicia sesión nuevamente.");
      }
    }
  }

  if (isLoading) {
    return <div className="auth-loading">AE NetScope</div>;
  }

  if (!user) {
    return (
      <Suspense fallback={<div className="auth-loading">AE NetScope</div>}>
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
      </Suspense>
    );
  }

  if (user.must_change_password) {
    return (
      <Suspense fallback={<div className="auth-loading">AE NetScope</div>}>
        <ChangePasswordScreen
          csrfToken={csrfToken}
          onPasswordChanged={(nextUser) => {
            setUser(nextUser);
            refreshInventory().catch(() => undefined);
          }}
        />
      </Suspense>
    );
  }


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
                    if (item.label === "VLANs") {
                      setView("vlans");
                    }
                    if (item.label === "Servicios") {
                      setView("services");
                    }
                    if (item.label === "Cambios") {
                      setView("audit");
                    }
                    if (item.label === "Usuarios") {
                      setView("users");
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
            <kbd>Ctrl K</kbd>
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
            <Suspense fallback={<div className="auth-loading">Cargando dashboard...</div>}>
              <DashboardView
                dashboard={dashboard}
                onOpenDevices={() => setView("devices")}
                user={user}
              />
            </Suspense>
          ) : view === "devices" ? (
            <Suspense fallback={<div className="auth-loading">Cargando dispositivos...</div>}>
              <DevicesView
                csrfToken={csrfToken}
                devices={devices}
                networks={networks}
                onCreated={refreshInventory}
                permissions={user.permissions}
              />
            </Suspense>
          ) : view === "ipMacs" ? (
            <Suspense fallback={<div className="auth-loading">Cargando IPs...</div>}>
              <IpMacsView
                csrfToken={csrfToken}
                interfaces={interfaces}
                ipMacs={ipMacs}
                networks={networks}
                onChanged={refreshInventory}
                permissions={user.permissions}
              />
            </Suspense>
          ) : view === "networks" ? (
            <Suspense fallback={<div className="auth-loading">Cargando subredes...</div>}>
              <NetworksView
                csrfToken={csrfToken}
                networks={networks}
                onChanged={refreshInventory}
                permissions={user.permissions}
                vlans={vlans}
              />
            </Suspense>
          ) : view === "vlans" ? (
            <Suspense fallback={<div className="auth-loading">Cargando VLANs...</div>}>
              <VlansView
                csrfToken={csrfToken}
                onChanged={refreshInventory}
                permissions={user.permissions}
                vlans={vlans}
              />
            </Suspense>
          ) : view === "services" ? (
            <Suspense fallback={<div className="auth-loading">Cargando servicios...</div>}>
              <ServicesView
                csrfToken={csrfToken}
                devices={devices}
                onChanged={refreshInventory}
                permissions={user.permissions}
                services={services}
              />
            </Suspense>
          ) : view === "audit" ? (
            <Suspense fallback={<div className="auth-loading">Cargando cambios...</div>}>
              <AuditView permissions={user.permissions} />
            </Suspense>
          ) : (
            <Suspense fallback={<div className="auth-loading">Cargando usuarios...</div>}>
              <UsersView csrfToken={csrfToken} currentUser={user} />
            </Suspense>
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

function isActiveNav(label: string, view: ViewName) {
  return (
    (label === "Dashboard" && view === "dashboard") ||
    (label === "Dispositivos" && view === "devices") ||
    (label === "IPs y MACs" && view === "ipMacs") ||
    (label === "Subredes" && view === "networks") ||
    (label === "VLANs" && view === "vlans") ||
    (label === "Servicios" && view === "services") ||
    (label === "Cambios" && view === "audit") ||
    (label === "Usuarios" && view === "users")
  );
}

export default App;

