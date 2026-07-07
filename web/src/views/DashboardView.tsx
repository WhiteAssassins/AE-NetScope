import { Box, FileText, Layers3, Monitor, RefreshCcw, Route, Server, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { AuditEvent, DashboardSummary, User } from "../types";
import { titleCase, typeTone } from "../utils";

type DashboardViewProps = {
  auditEvents: AuditEvent[];
  dashboard: DashboardSummary | null;
  lastUpdatedAt: Date | null;
  onOpenAudit: () => void;
  onOpenAuditEvent: (event: AuditEvent) => void;
  onOpenDevice: (deviceId: number) => void;
  onOpenDevices: () => void;
  onOpenIpMacs: () => void;
  onOpenNetworks: () => void;
  onOpenTopology: () => void;
  onOpenServices: () => void;
  onOpenVlans: () => void;
  onRefresh: () => void;
  showPreviewNotice: boolean;
  user: User;
};

export default function DashboardView({
  auditEvents,
  dashboard,
  lastUpdatedAt,
  onOpenAudit,
  onOpenAuditEvent,
  onOpenDevice,
  onOpenDevices,
  onOpenIpMacs,
  onOpenNetworks,
  onOpenTopology,
  onOpenServices,
  onOpenVlans,
  onRefresh,
  showPreviewNotice,
  user,
}: DashboardViewProps) {
  const stats = buildStats(dashboard, {
    Dispositivos: onOpenDevices,
    "IPs registradas": onOpenIpMacs,
    Subredes: onOpenNetworks,
    VLANs: onOpenVlans,
    Servicios: onOpenServices,
  });
  const chartData = buildChartData(dashboard);
  const totalElements = chartData.reduce((sum, item) => sum + item.value, 0);
  const networks = dashboard?.networks ?? [];
  const busiestNetwork = networks.reduce<(typeof networks)[number] | null>(
    (current, network) => (!current || network.ip_count > current.ip_count ? network : current),
    null,
  );

  return (
    <>
      <div className="page-title">
        <h1>Bienvenido, {user.username}</h1>
        <p>Resumen general de tu red</p>
      </div>

      {showPreviewNotice && (
        <div className="preview-notice" role="status">
          <strong>Early Public Preview</strong>
          <span>
            No uses AE NetScope todavía con datos sensibles de redes en producción. La API, el
            esquema y los controles de seguridad pueden cambiar antes de v1.0.
          </span>
        </div>
      )}

      <section className="stats-grid" aria-label="Resumen del inventario">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className={`stat-icon ${stat.tone}`}>
              <stat.icon size={25} strokeWidth={1.8} />
            </div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              {stat.onOpen ? (
                <button className="card-link text-button" onClick={stat.onOpen}>
                  Ver todos
                </button>
              ) : (
                <span className="muted-line">Próximamente</span>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <Card className="recent-devices span-7" title="Dispositivos recientes">
          <button className="card-link top-link text-button" onClick={onOpenDevices}>
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
                      <button
                        className="device-name row-action"
                        onClick={() => onOpenDevice(device.id)}
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
                  <Pie data={chartData} dataKey="value" innerRadius={72} outerRadius={102} paddingAngle={1} startAngle={90} endAngle={450}>
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
                    {entry.value} (
                    {totalElements ? ((entry.value / totalElements) * 100).toFixed(1) : "0.0"}%)
                  </strong>
                </div>
              ))}
            </div>
          </div>
          <button className="updated text-button" onClick={onRefresh}>
            <RefreshCcw size={18} strokeWidth={1.7} />
            Última actualización: {lastUpdatedAt ? lastUpdatedAt.toLocaleString() : "Sin datos"}
          </button>
        </Card>

        <Card className="span-4 subnet-card" title="Mapa de subredes">
          <div className="subnet-map">
            <div className="subnet-map-head">
              <div>
                <span>Subredes activas</span>
                <strong>{dashboard?.stats.networks ?? 0}</strong>
              </div>
              <div>
                <span>Más usada</span>
                <strong>{busiestNetwork?.cidr ?? "-"}</strong>
              </div>
            </div>

            <div className="subnet-list">
              {networks.length ? (
                networks.map((network) => (
                  <button
                    className="subnet-node"
                    key={network.cidr}
                    onClick={onOpenNetworks}
                    type="button"
                  >
                    <span className="subnet-node-main">
                      <strong>{network.name}</strong>
                      <em>{network.cidr}</em>
                    </span>
                    <span className="subnet-node-meta">
                      <span>{network.device_count} disp.</span>
                      <span>{network.ip_count}/{network.usable_hosts || 0} IPs</span>
                      {network.vlan && <span>VLAN {network.vlan.vlan_id}</span>}
                    </span>
                    <span className="subnet-usage" aria-label={`${network.utilization_percent}% usado`}>
                      <span style={{ width: `${Math.min(network.utilization_percent, 100)}%` }} />
                    </span>
                  </button>
                ))
              ) : (
                <p className="muted-line">No hay subredes registradas.</p>
              )}
            </div>
          </div>
          <button className="card-link lower-link text-button" onClick={onOpenNetworks}>
            Ver todas las subredes
          </button>
          <button className="card-link topology-link text-button" onClick={onOpenTopology}>
            Abrir topología
          </button>
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
          <button className="card-link lower-link text-button" onClick={onOpenServices}>
            Ver todos los servicios
          </button>
        </Card>

        <Card className="span-5" title="Últimos cambios">
          <div className="change-list">
            {auditEvents.length ? (
              auditEvents.slice(0, 5).map((event) => (
                <div className="change-row" key={event.id}>
                  <span className={`change-icon ${eventTone(event.event_type)}`}>
                    <FileText size={17} strokeWidth={2} />
                  </span>
                  <div className="change-content">
                    <button className="text-button" onClick={() => onOpenAuditEvent(event)}>
                      {event.message}
                    </button>
                    <small>{event.actor_email ?? "Sistema"}</small>
                  </div>
                  <time>{new Date(event.created_at).toLocaleString()}</time>
                </div>
              ))
            ) : (
              <p className="muted-line">No hay cambios recientes para mostrar.</p>
            )}
          </div>
          <button className="card-link lower-link text-button" onClick={onOpenAudit}>
            Ver todo el historial de cambios
          </button>
        </Card>
      </section>
    </>
  );
}

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function buildStats(dashboard: DashboardSummary | null, handlers: Record<string, () => void>) {
  return [
    { label: "Dispositivos", value: String(dashboard?.stats.devices ?? 0), icon: Monitor, tone: "blue" as const, onOpen: handlers.Dispositivos },
    { label: "IPs registradas", value: String(dashboard?.stats.ip_addresses ?? 0), icon: Box, tone: "green" as const, onOpen: handlers["IPs registradas"] },
    { label: "Subredes", value: String(dashboard?.stats.networks ?? 0), icon: Route, tone: "violet" as const, onOpen: handlers.Subredes },
    { label: "VLANs", value: String(dashboard?.stats.vlans ?? 0), icon: Tag, tone: "orange" as const, onOpen: handlers.VLANs },
    { label: "Servicios", value: String(dashboard?.stats.services ?? 0), icon: Layers3, tone: "cyan" as const, onOpen: handlers.Servicios },
    { label: "Notas técnicas", value: String(dashboard?.stats.notes ?? 0), icon: FileText, tone: "gray" as const },
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

function eventTone(eventType: string) {
  if (eventType.startsWith("users.")) return "violet";
  if (eventType.includes("deleted")) return "red";
  if (eventType.includes("created")) return "green";
  if (eventType.includes("updated")) return "blue";
  return "orange";
}
