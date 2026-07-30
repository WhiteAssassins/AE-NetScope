import { Box, FileText, Layers3, Monitor, RefreshCcw, Route, Server, Tag } from "lucide-react";
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatDateTime } from "../dateTime";
import { auditEventMessage } from "../auditMessages";
import type { AuditEvent, DashboardSummary, User } from "../types";
import { deviceTypeLabel, stateLabel, typeTone } from "../utils";

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
  const { i18n, t } = useTranslation();
  const stats = buildStats(dashboard, t, {
    devices: onOpenDevices,
    ipMacs: onOpenIpMacs,
    networks: onOpenNetworks,
    vlans: onOpenVlans,
    services: onOpenServices,
  });
  const chartData = buildChartData(dashboard, t);
  const totalElements = chartData.reduce((sum, item) => sum + item.value, 0);
  const networks = dashboard?.networks ?? [];
  const busiestNetwork = networks.reduce<(typeof networks)[number] | null>(
    (current, network) => (!current || network.ip_count > current.ip_count ? network : current),
    null,
  );

  return (
    <>
      <div className="page-title">
        <h1>{t("dashboard.welcome", { username: user.username })}</h1>
        <p>{t("dashboard.description")}</p>
      </div>

      {showPreviewNotice && (
        <div className="preview-notice" role="status">
          <strong>{t("dashboard.previewLabel")}</strong>
          <span>
            {t("dashboard.previewDescription")}
          </span>
        </div>
      )}

      <section className="stats-grid" aria-label={t("dashboard.inventorySummary")}>
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
                  {t("common.viewAll")}
                </button>
              ) : (
                <span className="muted-line">{t("common.comingSoon")}</span>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <Card className="recent-devices span-7" title={t("dashboard.recentDevices")}>
          <button className="card-link top-link text-button" onClick={onOpenDevices}>
            {t("common.viewAll")}
          </button>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("common.type")}</th>
                  <th>{t("dashboard.primaryIp")}</th>
                  <th>MAC</th>
                  <th>{t("common.status")}</th>
                  <th>{t("dashboard.lastChange")}</th>
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
                        {deviceTypeLabel(device.device_type, t)}
                      </span>
                    </td>
                    <td>{device.primary_ip ?? "-"}</td>
                    <td>{device.primary_mac ?? "-"}</td>
                    <td>
                      <span className="status-dot" /> {stateLabel(device.status, t)}
                    </td>
                    <td>{device.last_change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="network-summary span-5" title={t("dashboard.networkSummary")}>
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
                <span>{t("dashboard.elements")}</span>
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
            {t("dashboard.lastUpdated")}: {lastUpdatedAt
              ? formatDateTime(lastUpdatedAt, i18n.resolvedLanguage)
              : t("common.noData")}
          </button>
        </Card>

        <Card className="span-4 subnet-card" title={t("dashboard.subnetMap")}>
          <div className="subnet-map">
            <div className="subnet-map-head">
              <div>
                <span>{t("dashboard.activeSubnets")}</span>
                <strong>{dashboard?.stats.networks ?? 0}</strong>
              </div>
              <div>
                <span>{t("dashboard.mostUsed")}</span>
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
                      <span>{t("dashboard.deviceAbbreviation", { count: network.device_count })}</span>
                      <span>{network.ip_count}/{network.usable_hosts || 0} IPs</span>
                      {network.vlan && <span>VLAN {network.vlan.vlan_id}</span>}
                    </span>
                    <span
                      className="subnet-usage"
                      aria-label={t("dashboard.percentUsed", { value: network.utilization_percent })}
                    >
                      <span style={{ width: `${Math.min(network.utilization_percent, 100)}%` }} />
                    </span>
                  </button>
                ))
              ) : (
                <p className="muted-line">{t("dashboard.noSubnets")}</p>
              )}
            </div>
          </div>
          <button className="card-link lower-link text-button" onClick={onOpenNetworks}>
            {t("dashboard.viewAllSubnets")}
          </button>
          <button className="card-link topology-link text-button" onClick={onOpenTopology}>
            {t("dashboard.openTopology")}
          </button>
        </Card>

        <Card className="span-3" title={t("dashboard.activeServices")}>
          <div className="service-list">
            {(dashboard?.services ?? []).map((service) => (
              <div className="service-row" key={service.name}>
                <Server size={18} strokeWidth={1.7} />
                <strong>{service.name}</strong>
                <span>{t("dashboard.deviceCount", { count: service.device_count })}</span>
                <em className={`mini-pill ${service.status === "active" ? "green" : "gray"}`}>
                  {stateLabel(service.status, t)}
                </em>
              </div>
            ))}
          </div>
          <button className="card-link lower-link text-button" onClick={onOpenServices}>
            {t("dashboard.viewAllServices")}
          </button>
        </Card>

        <Card className="span-5" title={t("dashboard.latestChanges")}>
          <div className="change-list">
            {auditEvents.length ? (
              auditEvents.slice(0, 5).map((event) => (
                <div className="change-row" key={event.id}>
                  <span className={`change-icon ${eventTone(event.event_type)}`}>
                    <FileText size={17} strokeWidth={2} />
                  </span>
                  <div className="change-content">
                    <button className="text-button" onClick={() => onOpenAuditEvent(event)}>
                      {auditEventMessage(event, t)}
                    </button>
                    <small>{event.actor_email ?? t("common.system")}</small>
                  </div>
                  <time>{formatDateTime(event.created_at, i18n.resolvedLanguage)}</time>
                </div>
              ))
            ) : (
              <p className="muted-line">{t("dashboard.noRecentChanges")}</p>
            )}
          </div>
          <button className="card-link lower-link text-button" onClick={onOpenAudit}>
            {t("dashboard.viewChangeHistory")}
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

function buildStats(
  dashboard: DashboardSummary | null,
  t: TFunction,
  handlers: Record<"devices" | "ipMacs" | "networks" | "vlans" | "services", () => void>,
) {
  return [
    { label: t("navigation.devices"), value: String(dashboard?.stats.devices ?? 0), icon: Monitor, tone: "blue" as const, onOpen: handlers.devices },
    { label: t("dashboard.registeredIps"), value: String(dashboard?.stats.ip_addresses ?? 0), icon: Box, tone: "green" as const, onOpen: handlers.ipMacs },
    { label: t("navigation.networks"), value: String(dashboard?.stats.networks ?? 0), icon: Route, tone: "violet" as const, onOpen: handlers.networks },
    { label: t("navigation.vlans"), value: String(dashboard?.stats.vlans ?? 0), icon: Tag, tone: "orange" as const, onOpen: handlers.vlans },
    { label: t("navigation.services"), value: String(dashboard?.stats.services ?? 0), icon: Layers3, tone: "cyan" as const, onOpen: handlers.services },
    { label: t("navigation.notes"), value: String(dashboard?.stats.notes ?? 0), icon: FileText, tone: "gray" as const },
  ];
}

function buildChartData(dashboard: DashboardSummary | null, t: TFunction) {
  return [
    { name: t("navigation.devices"), value: dashboard?.stats.devices ?? 0, color: "#3857f6" },
    { name: t("navigation.ipMacs"), value: dashboard?.stats.ip_addresses ?? 0, color: "#30b866" },
    { name: t("navigation.networks"), value: dashboard?.stats.networks ?? 0, color: "#7446dc" },
    { name: t("navigation.vlans"), value: dashboard?.stats.vlans ?? 0, color: "#f39a16" },
    { name: t("navigation.services"), value: dashboard?.stats.services ?? 0, color: "#12a7ad" },
  ];
}

function eventTone(eventType: string) {
  if (eventType.startsWith("users.")) return "violet";
  if (eventType.includes("deleted")) return "red";
  if (eventType.includes("created")) return "green";
  if (eventType.includes("updated")) return "blue";
  return "orange";
}
