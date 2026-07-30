import { Boxes, ChevronDown, ChevronRight, Monitor, Network, Route, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeviceRecord, IpMacRecord, NetworkRecord } from "../types";
import { deviceTypeLabel, stateLabel, stateTone } from "../utils";

type TopologyViewProps = {
  devices: DeviceRecord[];
  ipMacs: IpMacRecord[];
  networks: NetworkRecord[];
  onOpenDevice: (deviceId: number) => void;
  onOpenIp: (ipId: number) => void;
  onOpenNetwork: (networkId: number) => void;
  onOpenVlan: (vlanId: number) => void;
};

export default function TopologyView({
  devices,
  ipMacs,
  networks,
  onOpenDevice,
  onOpenIp,
  onOpenNetwork,
  onOpenVlan,
}: TopologyViewProps) {
  const { t } = useTranslation();
  const [expandedNetworks, setExpandedNetworks] = useState<Set<number>>(
    () => new Set(networks.slice(0, 2).map((network) => network.id)),
  );
  const deviceById = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );
  const topology = networks.map((network) => {
    const addresses = ipMacs.filter((ip) => ip.network_id === network.id);
    const deviceIds = Array.from(
      new Set(addresses.map((ip) => ip.device_id).filter((id): id is number => Boolean(id))),
    );
    return {
      network,
      addresses,
      devices: deviceIds.map((id) => deviceById.get(id)).filter(Boolean) as DeviceRecord[],
    };
  });
  const unassignedIps = ipMacs.filter((ip) => !ip.network_id);
  const totalCapacity = networks.reduce((sum, network) => sum + network.usable_hosts, 0);
  const totalIps = networks.reduce((sum, network) => sum + network.ip_count, 0);
  const averageUsage = totalCapacity ? Math.round((totalIps / totalCapacity) * 1000) / 10 : 0;

  function toggleNetwork(networkId: number) {
    setExpandedNetworks((current) => {
      const next = new Set(current);
      if (next.has(networkId)) {
        next.delete(networkId);
      } else {
        next.add(networkId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedNetworks(new Set(networks.map((network) => network.id)));
  }

  function collapseAll() {
    setExpandedNetworks(new Set());
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>{t("topology.title")}</h1>
          <p>{t("topology.description")}</p>
        </div>
        <div className="row-actions">
          <button className="user-action" onClick={expandAll}>
            {t("topology.expandAll")}
          </button>
          <button className="user-action" onClick={collapseAll}>
            {t("topology.collapseAll")}
          </button>
        </div>
      </div>

      <section className="topology-stats" aria-label={t("topology.summary")}>
        <article>
          <Route size={20} strokeWidth={1.8} />
          <strong>{networks.length}</strong>
          <span>{t("navigation.networks")}</span>
        </article>
        <article>
          <Monitor size={20} strokeWidth={1.8} />
          <strong>{devices.length}</strong>
          <span>{t("navigation.devices")}</span>
        </article>
        <article>
          <Network size={20} strokeWidth={1.8} />
          <strong>{ipMacs.length}</strong>
          <span>IPs</span>
        </article>
        <article>
          <Boxes size={20} strokeWidth={1.8} />
          <strong>{averageUsage}%</strong>
          <span>{t("topology.averageUsage")}</span>
        </article>
      </section>

      <section className="panel topology-canvas">
        <div className="topology-root">
          <strong>AE NetScope</strong>
          <span>{t("topology.documentedInventory")}</span>
        </div>

        <div className="topology-tree">
          {topology.length ? (
            topology.map(({ network, addresses, devices }) => {
              const isExpanded = expandedNetworks.has(network.id);
              return (
                <article className="topology-network" key={network.id}>
                  <button
                    className="topology-network-head"
                    onClick={() => toggleNetwork(network.id)}
                    type="button"
                  >
                    {isExpanded ? (
                      <ChevronDown size={18} strokeWidth={2} />
                    ) : (
                      <ChevronRight size={18} strokeWidth={2} />
                    )}
                    <span>
                      <strong>{network.name}</strong>
                      <em>{network.cidr}</em>
                    </span>
                    <span className={`mini-pill ${stateTone(network.status)}`}>
                      {stateLabel(network.status, t)}
                    </span>
                  </button>

                  <div className="topology-network-metrics">
                    <button className="topology-chip" onClick={() => onOpenNetwork(network.id)}>
                      <Route size={15} /> {network.ip_count}/{network.usable_hosts} IPs
                    </button>
                    <span>{t("topology.percentUsed", { value: network.utilization_percent.toFixed(1) })}</span>
                    {network.vlan && (
                      <button className="topology-chip" onClick={() => onOpenVlan(network.vlan!.id)}>
                        <Tag size={15} /> VLAN {network.vlan.vlan_id}
                      </button>
                    )}
                  </div>
                  <span className="topology-meter">
                    <span style={{ width: `${Math.min(network.utilization_percent, 100)}%` }} />
                  </span>

                  {isExpanded && (
                    <div className="topology-children">
                      <div className="topology-column">
                        <h2>{t("navigation.devices")}</h2>
                        {devices.length ? (
                          devices.map((device) => (
                            <button
                              className="topology-device"
                              key={device.id}
                              onClick={() => onOpenDevice(device.id)}
                            >
                              <Monitor size={16} strokeWidth={1.8} />
                              <span>
                                <strong>{device.name}</strong>
                                <em>{deviceTypeLabel(device.device_type, t)}</em>
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="muted-line">{t("topology.noLinkedDevices")}</p>
                        )}
                      </div>

                      <div className="topology-column">
                        <h2>{t("topology.registeredIps")}</h2>
                        {addresses.length ? (
                          addresses.slice(0, 8).map((ip) => (
                            <button
                              className="topology-address"
                              key={ip.id}
                              onClick={() => onOpenIp(ip.id)}
                            >
                              <span>
                                <strong>{ip.address}</strong>
                                <em>{ip.device_name ?? t("topology.withoutDevice")}</em>
                              </span>
                              <span className={`mini-pill ${stateTone(ip.state)}`}>
                                {stateLabel(ip.state, t)}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="muted-line">{t("topology.noRegisteredIps")}</p>
                        )}
                        {addresses.length > 8 && (
                          <button className="card-link text-button" onClick={() => onOpenNetwork(network.id)}>
                            {t("topology.viewMoreIps", { count: addresses.length - 8 })}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <p className="muted-line">{t("topology.noSubnets")}</p>
          )}
        </div>

        {unassignedIps.length > 0 && (
          <aside className="topology-unassigned">
            <strong>{t("topology.unassignedIps")}</strong>
            <span>{t("topology.needClassification", { count: unassignedIps.length })}</span>
          </aside>
        )}
      </section>
    </>
  );
}
