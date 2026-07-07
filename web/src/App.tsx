import {
  Bell,
  Cable,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  HardDrive,
  HeartPulse,
  Home,
  Import,
  LogOut,
  Menu,
  Monitor,
  Network,
  PackageCheck,
  Route,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { API_BASE_URL, fetchInventoryData, fetchVersionInfo } from "./api";
import "./App.css";
import type {
  AuditEvent,
  DashboardSummary,
  DeviceRecord,
  InterfaceRecord,
  IpMacRecord,
  ManagedUser,
  NetworkRecord,
  ServiceRecord,
  User,
  VersionInfo,
  ViewName,
  VlanRecord,
} from "./types";

type NavItem = { label: string; icon: LucideIcon };
type TopbarMenu = "notifications" | "help" | "user" | null;
type SearchTarget = { view: ViewName; id?: number; query?: string };
type SearchResult = {
  title: string;
  meta: string;
  target: SearchTarget;
};
type LocalSettings = {
  compactTables: boolean;
  defaultView: string;
  showPreviewNotice: boolean;
};

const defaultLocalSettings: LocalSettings = {
  compactTables: false,
  defaultView: "dashboard",
  showPreviewNotice: true,
};

function readLocalSettings() {
  const stored = window.localStorage.getItem("ae-netscope-settings");
  if (!stored) {
    return defaultLocalSettings;
  }
  return { ...defaultLocalSettings, ...(JSON.parse(stored) as Partial<LocalSettings>) };
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: "", items: [{ label: "Dashboard", icon: Home }] },
  {
    label: "Inventario",
    items: [
      { label: "Dispositivos", icon: Monitor },
      { label: "IPs y MACs", icon: Network },
      { label: "Subredes", icon: Route },
      { label: "Topología", icon: Route },
      { label: "VLANs", icon: Cable },
      { label: "Servicios", icon: ShieldCheck },
      { label: "Hardware", icon: HardDrive },
      { label: "Notas técnicas", icon: FileText },
    ],
  },
  { label: "Historial", items: [{ label: "Cambios", icon: Clock3 }] },
  {
    label: "Herramientas",
    items: [{ label: "Datos", icon: Import }],
  },
  {
    label: "Configuración",
    items: [
      { label: "Usuarios", icon: UsersRound },
      { label: "Roles y permisos", icon: ShieldCheck },
      { label: "Estado", icon: HeartPulse },
      { label: "Actualizaciones", icon: PackageCheck },
      { label: "Ajustes", icon: Settings },
    ],
  },
];

const DashboardView = lazy(() => import("./views/DashboardView"));
const AuditView = lazy(() => import("./views/AuditView"));
const ChangePasswordScreen = lazy(() => import("./views/ChangePasswordScreen"));
const DevicesView = lazy(() => import("./views/DevicesView"));
const HardwareView = lazy(() => import("./views/HardwareView"));
const HealthView = lazy(() => import("./views/HealthView"));
const ImportExportView = lazy(() => import("./views/ImportExportView"));
const IpMacsView = lazy(() => import("./views/IpMacsView"));
const LoginScreen = lazy(() => import("./views/LoginScreen"));
const NetworksView = lazy(() => import("./views/NetworksView"));
const NotesView = lazy(() => import("./views/NotesView"));
const ProfileView = lazy(() => import("./views/ProfileView"));
const RolesPermissionsView = lazy(() => import("./views/RolesPermissionsView"));
const ServicesView = lazy(() => import("./views/ServicesView"));
const SettingsView = lazy(() => import("./views/SettingsView"));
const SetupScreen = lazy(() => import("./views/SetupScreen"));
const SupportView = lazy(() => import("./views/SupportView"));
const TopologyView = lazy(() => import("./views/TopologyView"));
const UpdateView = lazy(() => import("./views/UpdateView"));
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
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [localSettings, setLocalSettings] = useState<LocalSettings>(readLocalSettings);
  const [view, setView] = useState<ViewName>(() => localSettings.defaultView as ViewName);
  const [focusTarget, setFocusTarget] = useState<SearchTarget | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [activeTopbarMenu, setActiveTopbarMenu] = useState<TopbarMenu>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchVersionInfo()
      .then(setVersionInfo)
      .catch(() => undefined);

    fetch(`${API_BASE_URL}/auth/setup`, { credentials: "include" })
      .then(async (response) => {
        if (response.ok) {
          const setupData = (await response.json()) as { setup_required: boolean };
          if (setupData.setup_required) {
            setSetupRequired(true);
            setUser(null);
            return;
          }
        }

        const meResponse = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
        if (!meResponse.ok) {
          setUser(null);
          if (meResponse.status === 401) {
            setSessionMessage("La sesión expiró. Inicia sesión nuevamente.");
          }
          return;
        }

        const data = (await meResponse.json()) as { user: User };
        setUser(data.user);
        await refreshCsrfToken().catch(() => setCsrfToken(""));
        if (!data.user.must_change_password) {
          await refreshInventory().catch(() => {
            setSessionMessage("No se pudo cargar el inventario. Actualiza de nuevo en unos segundos.");
          });
        }
      })
      .catch(() => {
        setUser(null);
        setSessionMessage("La sesión expiró. Inicia sesión nuevamente.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    function syncSettings() {
      setLocalSettings(readLocalSettings());
    }
    window.addEventListener("ae-netscope-settings-changed", syncSettings);
    return () => window.removeEventListener("ae-netscope-settings-changed", syncSettings);
  }, []);

  useEffect(() => {
    if (!user || user.must_change_password) {
      return;
    }
    if (user.permissions.includes("users:manage")) {
      refreshManagedUsers().catch(() => undefined);
    }
    if (user.permissions.includes("audit:read")) {
      refreshAuditEvents().catch(() => undefined);
    }
  }, [user]);

  async function refreshInventory() {
    const inventoryData = await fetchInventoryData();
    setDashboard(inventoryData.dashboard);
    setDevices(inventoryData.devices);
    setNetworks(inventoryData.networks);
    setVlans(inventoryData.vlans);
    setServices(inventoryData.services);
    setIpMacs(inventoryData.ipMacs);
    setInterfaces(inventoryData.interfaces);
    setLastUpdatedAt(new Date());
  }

  async function refreshCsrfToken() {
    const csrfResponse = await fetch(`${API_BASE_URL}/auth/csrf`, { credentials: "include" });
    if (csrfResponse.ok) {
      const csrfData = (await csrfResponse.json()) as { csrf_token: string };
      setCsrfToken(csrfData.csrf_token);
      return;
    }
    setCsrfToken("");
  }

  async function refreshManagedUsers() {
    const response = await fetch(`${API_BASE_URL}/users`, { credentials: "include" });
    if (response.ok) {
      setManagedUsers((await response.json()) as ManagedUser[]);
    }
  }

  async function refreshAuditEvents() {
    const response = await fetch(`${API_BASE_URL}/audit/events?limit=8`, {
      credentials: "include",
    });
    if (response.ok) {
      setAuditEvents((await response.json()) as AuditEvent[]);
    }
  }

  async function handleLogout() {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrfToken },
    });
    setUser(null);
    setCsrfToken("");
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchResults: SearchResult[] = normalizedSearch
    ? [
        ...devices.map((device) => ({
          title: device.name,
          meta: [
            device.device_type,
            device.primary_ip ?? "sin IP",
            device.primary_mac ?? "sin MAC",
            device.serial_number ? `SN ${device.serial_number}` : null,
            device.asset_tag ? `Asset ${device.asset_tag}` : null,
            device.owner,
            device.rack_position,
          ]
            .filter(Boolean)
            .join(" - "),
          target: { view: "devices" as ViewName, id: device.id },
        })),
        ...devices
          .filter((device) =>
            [
              device.vendor,
              device.model,
              device.serial_number,
              device.asset_tag,
              device.operating_system,
              device.firmware_version,
              device.cpu,
              device.memory,
              device.storage,
              device.warranty_expires,
              device.location,
            ].some(Boolean),
          )
          .map((device) => ({
            title: `Hardware: ${device.name}`,
            meta: [
              device.vendor,
              device.model,
              device.serial_number ? `SN ${device.serial_number}` : null,
              device.asset_tag ? `Asset ${device.asset_tag}` : null,
              device.operating_system,
              device.location,
            ]
              .filter(Boolean)
              .join(" - "),
            target: { view: "devices" as ViewName, id: device.id },
          })),
        ...devices
          .filter((device) => device.notes?.trim())
          .map((device) => ({
            title: `Nota: ${device.name}`,
            meta: device.notes ?? "",
            target: { view: "notes" as ViewName, id: device.id },
          })),
        ...ipMacs.map((record) => ({
          title: record.address,
          meta: `${record.device_name ?? "Sin dispositivo"} - ${record.mac_address ?? "sin MAC"}`,
          target: { view: "ipMacs" as ViewName, id: record.id },
        })),
        ...networks.map((network) => ({
          title: network.cidr,
          meta: `${network.name} - ${network.location ?? "sin ubicacion"}`,
          target: { view: "networks" as ViewName, id: network.id },
        })),
        ...vlans.map((vlan) => ({
          title: `VLAN ${vlan.vlan_id}`,
          meta: `${vlan.name} - ${vlan.network_count} subredes`,
          target: { view: "vlans" as ViewName, id: vlan.id },
        })),
        ...services.map((service) => ({
          title: service.name,
          meta: `${service.device_name} - ${service.port ?? "sin puerto"}/${service.protocol}`,
          target: { view: "services" as ViewName, id: service.id },
        })),
        ...managedUsers.map((managedUser) => ({
          title: managedUser.email,
          meta: `${managedUser.username} - ${managedUser.role}`,
          target: { view: "users" as ViewName, id: managedUser.id },
        })),
        ...auditEvents.map((event) => ({
          title: event.message,
          meta: `${event.event_type} - ${event.actor_email ?? "Sistema"} - ${new Date(
            event.created_at,
          ).toLocaleString()}`,
          target: { view: "audit" as ViewName, query: event.message },
        })),
        ...[
          { title: "Dashboard", meta: "Resumen general de la red", view: "dashboard" },
          { title: "Topologia", meta: "Mapa expandible de subredes, VLANs, IPs y dispositivos", view: "topology" },
          { title: "Datos", meta: "Backups, restauracion, JSON y CSV", view: "importExport" },
          { title: "Cambios", meta: "Auditoria e historial de actividad", view: "audit" },
          { title: "Usuarios", meta: "Roles, bloqueos y sesiones", view: "users" },
          { title: "Perfil", meta: "Cuenta, correo, contrasena y permisos", view: "profile" },
          { title: "Roles y permisos", meta: "Matriz de permisos", view: "roles" },
          { title: "Estado", meta: "Health checks de API, base de datos y Redis", view: "health" },
          { title: "Actualizaciones", meta: "Version instalada y releases", view: "updates" },
          { title: "Ajustes", meta: "Preferencias locales y correo", view: "settings" },
          { title: "Soporte", meta: "Contacto, web y GitHub", view: "support" },
        ].map((item) => ({
          title: item.title,
          meta: item.meta,
          target: { view: item.view as ViewName },
        })),
      ]
        .filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(normalizedSearch))
        .slice(0, 8)
    : [];

  useEffect(() => {
    function handleGlobalShortcuts(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveTopbarMenu(null);
        searchInputRef.current?.focus();
      }
      if (event.key === "Escape" && normalizedSearch) {
        event.preventDefault();
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    }

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [normalizedSearch]);

  function openTopbarMenu(menu: Exclude<TopbarMenu, null>) {
    setActiveTopbarMenu((current) => (current === menu ? null : menu));
  }

  function goToView(nextView: ViewName, target?: SearchTarget) {
    setView(nextView);
    setFocusTarget(target ?? null);
    setSearchQuery("");
    setActiveTopbarMenu(null);
  }

  function openSearchResult(result: SearchResult) {
    goToView(result.target.view, result.target);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!searchResults.length) {
      return;
    }
    const selectedSearchIndex = Math.min(activeSearchIndex, searchResults.length - 1);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchIndex((current) => (current + 1) % searchResults.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchIndex((current) => (current - 1 + searchResults.length) % searchResults.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openSearchResult(searchResults[selectedSearchIndex] ?? searchResults[0]);
    }
  }

  function navLabelToView(label: string): ViewName | null {
    const map: Record<string, ViewName> = {
      Dashboard: "dashboard",
      Dispositivos: "devices",
      "IPs y MACs": "ipMacs",
      Subredes: "networks",
      Topología: "topology",
      VLANs: "vlans",
      Servicios: "services",
      Hardware: "hardware",
      "Notas técnicas": "notes",
      Cambios: "audit",
      Datos: "importExport",
      "Roles y permisos": "roles",
      Usuarios: "users",
      Estado: "health",
      Actualizaciones: "updates",
      Ajustes: "settings",
    };
    return map[label] ?? null;
  }

  if (isLoading) {
    return <div className="auth-loading">AE NetScope</div>;
  }

  if (setupRequired) {
    return (
      <Suspense fallback={<div className="auth-loading">AE NetScope</div>}>
        <SetupScreen
          onSetupComplete={(nextUser, nextCsrfToken) => {
            setSetupRequired(false);
            setUser(nextUser);
            setCsrfToken(nextCsrfToken);
            refreshInventory().catch(() => undefined);
          }}
        />
      </Suspense>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<div className="auth-loading">AE NetScope</div>}>
        <LoginScreen
          message={sessionMessage}
          onLogin={(nextUser, nextCsrfToken) => {
            setUser(nextUser);
            setCsrfToken(nextCsrfToken);
            setSetupRequired(false);
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

  const currentUser = user;

  return (
    <div
      className={[
        "app-shell",
        isSidebarCollapsed ? "sidebar-collapsed" : "",
        localSettings.compactTables ? "compact-tables" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <aside className="sidebar">
        <button
          className="brand button-reset"
          onClick={() => goToView("dashboard")}
          aria-label="AE NetScope"
        >
          <span className="brand-mark">
            <Network size={29} strokeWidth={1.8} />
          </span>
          <span>AE NetScope</span>
        </button>

        <nav className="nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label || "main"}>
              {group.label && <p className="nav-label">{group.label}</p>}
              {group.items.map((item) => {
                const nextView = navLabelToView(item.label);
                return (
                  <button
                    className={
                      isActiveNav(item.label, view)
                        ? "nav-item active button-reset"
                        : "nav-item button-reset"
                    }
                    key={item.label}
                    onClick={() => {
                      if (nextView) {
                        goToView(nextView);
                      }
                    }}
                  >
                    <item.icon size={19} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout button-reset" onClick={handleLogout}>
            <LogOut size={18} strokeWidth={1.8} />
            <span>Cerrar sesión</span>
          </button>
          <button className="help-card button-reset" onClick={() => goToView("support")}>
            <CircleHelp size={20} strokeWidth={1.8} />
            <span>
              ¿Necesitas ayuda?
              <strong>Contáctanos</strong>
            </span>
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button
            className="icon-button"
            aria-label={isSidebarCollapsed ? "Mostrar menú" : "Ocultar menú"}
            onClick={() => setIsSidebarCollapsed((value) => !value)}
          >
            <Menu size={24} strokeWidth={1.7} />
          </button>

          <div className="top-search">
            <label className="search-box">
              <Search size={20} strokeWidth={1.8} />
              <input
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setActiveSearchIndex(0);
                }}
                onFocus={() => setActiveTopbarMenu(null)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar dispositivos, IPs, VLANs, usuarios..."
                ref={searchInputRef}
                value={searchQuery}
              />
              <kbd>Ctrl K</kbd>
            </label>
            {normalizedSearch && (
              <div className="topbar-panel search-panel">
                {searchResults.length ? (
                  searchResults.map((result, index) => (
                    <button
                      className={
                        index === Math.min(activeSearchIndex, searchResults.length - 1)
                          ? "topbar-menu-item search-result-active"
                          : "topbar-menu-item"
                      }
                      key={`${result.target.view}-${result.title}-${result.meta}`}
                      onClick={() => openSearchResult(result)}
                    >
                      <strong>{result.title}</strong>
                      <span>{result.meta}</span>
                    </button>
                  ))
                ) : (
                  <div className="topbar-empty">
                    <strong>Sin resultados</strong>
                    <span>No hay coincidencias en el inventario cargado.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="top-actions">
            <div className="top-action-wrap">
              <button
                className="icon-button"
                aria-expanded={activeTopbarMenu === "notifications"}
                aria-label="Notificaciones"
                onClick={() => openTopbarMenu("notifications")}
              >
                <Bell size={22} strokeWidth={1.7} />
              </button>
              {activeTopbarMenu === "notifications" && (
                <div className="topbar-panel topbar-panel-right">
                  {auditEvents.length ? (
                    auditEvents.slice(0, 5).map((event) => (
                      <button
                        className="topbar-menu-item"
                        key={event.id}
                        onClick={() => goToView("audit", { view: "audit", query: event.message })}
                      >
                        <strong>{event.message}</strong>
                        <span>{new Date(event.created_at).toLocaleString()}</span>
                      </button>
                    ))
                  ) : (
                    <div className="topbar-empty">
                      <strong>Sin notificaciones</strong>
                      <span>Los eventos importantes aparecerán aquí.</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="top-action-wrap">
              <button
                className="icon-button"
                aria-expanded={activeTopbarMenu === "help"}
                aria-label="Ayuda"
                onClick={() => openTopbarMenu("help")}
              >
                <CircleHelp size={22} strokeWidth={1.7} />
              </button>
              {activeTopbarMenu === "help" && (
                <div className="topbar-panel topbar-panel-right">
                  <button className="topbar-menu-item" onClick={() => goToView("support")}>
                    <strong>Soporte</strong>
                    <span>Correos, web oficial y GitHub.</span>
                  </button>
                  <button className="topbar-menu-item" onClick={() => goToView("importExport")}>
                    <strong>Datos</strong>
                    <span>Backups, restauracion y exportaciones.</span>
                  </button>
                  <button className="topbar-menu-item" onClick={() => goToView("audit")}>
                    <strong>Historial de cambios</strong>
                    <span>Auditoría y actividad reciente.</span>
                  </button>
                </div>
              )}
            </div>

            <div className="top-action-wrap">
              <button
                className="user-menu"
                aria-expanded={activeTopbarMenu === "user"}
                onClick={() => openTopbarMenu("user")}
              >
                {currentUser.username} <ChevronDown size={17} />
              </button>
              {activeTopbarMenu === "user" && (
                <div className="topbar-panel topbar-panel-right user-panel">
                  <div className="user-panel-header">
                    <strong>{currentUser.username}</strong>
                    <span>{currentUser.email}</span>
                    <small>{currentUser.role}</small>
                  </div>
                  <button className="topbar-menu-item" onClick={() => goToView("profile")}>
                    <strong>Perfil</strong>
                    <span>Cuenta, correo y permisos.</span>
                  </button>
                  <button
                    className="topbar-menu-item"
                    onClick={() => {
                      setActiveTopbarMenu(null);
                      setUser({ ...currentUser, must_change_password: true });
                    }}
                  >
                    <strong>Cambiar contraseña</strong>
                    <span>Actualiza la clave de tu cuenta.</span>
                  </button>
                  {currentUser.permissions.includes("users:manage") && (
                    <button className="topbar-menu-item" onClick={() => goToView("users")}>
                      <strong>Usuarios</strong>
                      <span>Roles, bloqueos y sesiones.</span>
                    </button>
                  )}
                  <button className="topbar-menu-item danger-menu-item" onClick={handleLogout}>
                    <strong>Cerrar sesión</strong>
                    <span>Salir de AE NetScope.</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="content">{renderView()}</section>

        <footer className="footer">
          <span>AE NetScope {versionInfo ? `v${versionInfo.version}` : ""}</span>
          <div>
            <a
              className="footer-link"
              href="https://github.com/WhiteAssassins/AE-NetScope#readme"
              rel="noreferrer"
              target="_blank"
            >
              <FileText size={17} /> Documentación
            </a>
            <button className="footer-link button-reset" onClick={() => goToView("support")}>
              <CircleHelp size={17} /> Soporte
            </button>
          </div>
        </footer>
      </main>
    </div>
  );

  function renderView() {
    if (view === "dashboard") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando dashboard...</div>}>
          <DashboardView
            auditEvents={auditEvents}
            dashboard={dashboard}
            lastUpdatedAt={lastUpdatedAt}
            onOpenAudit={() => goToView("audit")}
            onOpenAuditEvent={(event) => goToView("audit", { view: "audit", query: event.message })}
            onOpenDevice={(deviceId) => goToView("devices", { view: "devices", id: deviceId })}
            onOpenDevices={() => goToView("devices")}
            onOpenIpMacs={() => goToView("ipMacs")}
            onOpenNetworks={() => goToView("networks")}
            onOpenTopology={() => goToView("topology")}
            onOpenServices={() => goToView("services")}
            onOpenVlans={() => goToView("vlans")}
            onRefresh={() => {
              refreshInventory().catch(() => undefined);
              refreshAuditEvents().catch(() => undefined);
            }}
            showPreviewNotice={localSettings.showPreviewNotice}
            user={currentUser}
          />
        </Suspense>
      );
    }
    if (view === "devices") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando dispositivos...</div>}>
          <DevicesView
            csrfToken={csrfToken}
            devices={devices}
            focusDeviceId={focusTarget?.view === "devices" ? focusTarget.id : undefined}
            networks={networks}
            onCreated={refreshInventory}
            permissions={currentUser.permissions}
          />
        </Suspense>
      );
    }
    if (view === "ipMacs") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando IPs...</div>}>
          <IpMacsView
            csrfToken={csrfToken}
            focusIpId={focusTarget?.view === "ipMacs" ? focusTarget.id : undefined}
            interfaces={interfaces}
            ipMacs={ipMacs}
            networks={networks}
            onChanged={refreshInventory}
            permissions={currentUser.permissions}
          />
        </Suspense>
      );
    }
    if (view === "networks") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando subredes...</div>}>
          <NetworksView
            csrfToken={csrfToken}
            focusNetworkId={focusTarget?.view === "networks" ? focusTarget.id : undefined}
            networks={networks}
            onChanged={refreshInventory}
            permissions={currentUser.permissions}
            vlans={vlans}
          />
        </Suspense>
      );
    }
    if (view === "topology") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando topología...</div>}>
          <TopologyView
            devices={devices}
            ipMacs={ipMacs}
            networks={networks}
            onOpenDevice={(deviceId) => goToView("devices", { view: "devices", id: deviceId })}
            onOpenIp={(ipId) => goToView("ipMacs", { view: "ipMacs", id: ipId })}
            onOpenNetwork={(networkId) => goToView("networks", { view: "networks", id: networkId })}
            onOpenVlan={(vlanId) => goToView("vlans", { view: "vlans", id: vlanId })}
          />
        </Suspense>
      );
    }
    if (view === "vlans") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando VLANs...</div>}>
          <VlansView
            csrfToken={csrfToken}
            focusVlanId={focusTarget?.view === "vlans" ? focusTarget.id : undefined}
            onChanged={refreshInventory}
            permissions={currentUser.permissions}
            vlans={vlans}
          />
        </Suspense>
      );
    }
    if (view === "services") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando servicios...</div>}>
          <ServicesView
            csrfToken={csrfToken}
            devices={devices}
            focusServiceId={focusTarget?.view === "services" ? focusTarget.id : undefined}
            onChanged={refreshInventory}
            permissions={currentUser.permissions}
            services={services}
          />
        </Suspense>
      );
    }
    if (view === "hardware") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando hardware...</div>}>
          <HardwareView
            devices={devices}
            onOpenDevice={(deviceId) => goToView("devices", { view: "devices", id: deviceId })}
          />
        </Suspense>
      );
    }
    if (view === "notes") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando notas...</div>}>
          <NotesView
            key={`notes-${focusTarget?.view === "notes" ? focusTarget.id ?? "all" : "all"}`}
            csrfToken={csrfToken}
            devices={devices}
            focusDeviceId={focusTarget?.view === "notes" ? focusTarget.id : undefined}
            onChanged={refreshInventory}
            onOpenDevice={(deviceId) => goToView("devices", { view: "devices", id: deviceId })}
            permissions={currentUser.permissions}
          />
        </Suspense>
      );
    }
    if (view === "audit") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando cambios...</div>}>
          <AuditView
            initialQuery={focusTarget?.view === "audit" ? focusTarget.query : undefined}
            permissions={currentUser.permissions}
          />
        </Suspense>
      );
    }
    if (view === "backups") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando respaldos...</div>}>
          <ImportExportView
            csrfToken={csrfToken}
            onImported={refreshInventory}
            permissions={currentUser.permissions}
          />
        </Suspense>
      );
    }
    if (view === "importExport") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando exportación...</div>}>
          <ImportExportView
            csrfToken={csrfToken}
            onImported={refreshInventory}
            permissions={currentUser.permissions}
          />
        </Suspense>
      );
    }
    if (view === "roles") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando roles...</div>}>
          <RolesPermissionsView />
        </Suspense>
      );
    }
    if (view === "users") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando usuarios...</div>}>
          <UsersView
            csrfToken={csrfToken}
            currentUser={currentUser}
            focusUserId={focusTarget?.view === "users" ? focusTarget.id : undefined}
          />
        </Suspense>
      );
    }
    if (view === "profile") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando perfil...</div>}>
          <ProfileView
            csrfToken={csrfToken}
            onChangePassword={() => setUser({ ...currentUser, must_change_password: true })}
            onUserChanged={setUser}
            user={currentUser}
          />
        </Suspense>
      );
    }
    if (view === "health") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando estado...</div>}>
          <HealthView />
        </Suspense>
      );
    }
    if (view === "updates") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando actualizaciones...</div>}>
          <UpdateView
            csrfToken={csrfToken}
            initialVersionInfo={versionInfo}
            permissions={currentUser.permissions}
          />
        </Suspense>
      );
    }
    if (view === "settings") {
      return (
        <Suspense fallback={<div className="auth-loading">Cargando ajustes...</div>}>
          <SettingsView />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<div className="auth-loading">Cargando soporte...</div>}>
        <SupportView />
      </Suspense>
    );
  }
}

function isActiveNav(label: string, view: ViewName) {
  return (
    (label === "Dashboard" && view === "dashboard") ||
    (label === "Dispositivos" && view === "devices") ||
    (label === "IPs y MACs" && view === "ipMacs") ||
    (label === "Subredes" && view === "networks") ||
    (label === "Topología" && view === "topology") ||
    (label === "VLANs" && view === "vlans") ||
    (label === "Servicios" && view === "services") ||
    (label === "Hardware" && view === "hardware") ||
    (label === "Notas técnicas" && view === "notes") ||
    (label === "Cambios" && view === "audit") ||
    (label === "Datos" && (view === "importExport" || view === "backups")) ||
    (label === "Roles y permisos" && view === "roles") ||
    (label === "Usuarios" && view === "users") ||
    (label === "Estado" && view === "health") ||
    (label === "Actualizaciones" && view === "updates") ||
    (label === "Ajustes" && view === "settings")
  );
}

export default App;
