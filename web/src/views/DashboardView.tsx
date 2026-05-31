import {
  Box,
  FileText,
  Layers3,
  Monitor,
  RefreshCcw,
  Route,
  Server,
  Tag,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { DashboardSummary, User } from "../types";
import { titleCase, typeTone } from "../utils";

type DashboardViewProps = {
  dashboard: DashboardSummary | null;
  user: User;
  onOpenDevices: () => void;
};

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

export default function DashboardView({ dashboard, user, onOpenDevices }: DashboardViewProps) {
  const stats = buildStats(dashboard);
  const chartData = buildChartData(dashboard);
  const totalElements = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <>
      <div className="page-title">
        <h1>Bienvenido, {user.username}</h1>
        <p>Resumen general de tu red</p>
      </div>

      <div className="preview-notice" role="status">
        <strong>Early Public Preview</strong>
        <span>
          No uses AE NetScope todavía con datos sensibles de redes en producción. La API, el
          esquema y los controles de seguridad pueden cambiar antes de v1.0.
        </span>
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
                    {entry.value} (
                    {totalElements ? ((entry.value / totalElements) * 100).toFixed(1) : "0.0"}%)
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
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
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
      label: "Notas técnicas",
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
        d="m13.8 6.7 3.5 3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
