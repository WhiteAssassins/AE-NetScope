import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import type { NetworkRecord, VlanRecord } from "../types";
import { hasPermission, stateLabel, stateTone } from "../utils";
export default function NetworksView({
  csrfToken,
  focusNetworkId,
  networks,
  vlans,
  onChanged,
  permissions,
}: {
  csrfToken: string;
  focusNetworkId?: number;
  networks: NetworkRecord[];
  vlans: VlanRecord[];
  onChanged: () => Promise<void>;
  permissions: string[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkRecord | null>(null);
  const [form, setForm] = useState({
    cidr: "",
    name: "",
    gateway: "",
    location: "",
    status: "active",
    vlan_id: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canCreate = hasPermission(permissions, "networks:create");
  const canUpdate = hasPermission(permissions, "networks:update");
  const canDelete = hasPermission(permissions, "networks:delete");

  useEffect(() => {
    if (!focusNetworkId) {
      return;
    }
    const network = networks.find((item) => item.id === focusNetworkId);
    if (network) {
      queueMicrotask(() => {
        selectNetwork(network);
        setQuery(network.cidr);
      });
    }
  }, [focusNetworkId, networks]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredNetworks = networks.filter((network) => {
    const matchesQuery =
      !normalizedQuery ||
      [
        network.cidr,
        network.name,
        network.gateway,
        network.location,
        network.status,
        network.vlan?.name,
        network.vlan ? String(network.vlan.vlan_id) : null,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    const matchesStatus = statusFilter === "all" || network.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const totalIps = networks.reduce((sum, network) => sum + network.ip_count, 0);
  const totalCapacity = networks.reduce((sum, network) => sum + network.usable_hosts, 0);
  const averageUsage = totalCapacity ? Math.round((totalIps / totalCapacity) * 1000) / 10 : 0;

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setSelectedNetwork(null);
    setForm({
      cidr: "",
      name: "",
      gateway: "",
      location: "",
      status: "active",
      vlan_id: "",
    });
  }

  function selectNetwork(network: NetworkRecord) {
    setSelectedNetwork(network);
    setShowForm(true);
    setMessage("");
    setError("");
    setForm({
      cidr: network.cidr,
      name: network.name,
      gateway: network.gateway ?? "",
      location: network.location ?? "",
      status: network.status,
      vlan_id: network.vlan ? String(network.vlan.id) : "",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedNetwork ? !canUpdate : !canCreate) {
      return;
    }
    setMessage("");
    setError("");
    setIsSubmitting(true);

    const payload = {
      cidr: form.cidr,
      name: form.name,
      gateway: form.gateway || null,
      location: form.location || null,
      status: form.status,
      vlan_id: form.vlan_id ? Number(form.vlan_id) : null,
    };
    const endpoint = selectedNetwork
      ? `${API_BASE_URL}/inventory/networks/${selectedNetwork.id}`
      : `${API_BASE_URL}/inventory/networks`;

    try {
      const response = await fetch(endpoint, {
        method: selectedNetwork ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(t("networks.errors.save"));
        return;
      }

      setMessage(t(selectedNetwork ? "networks.updated" : "networks.created"));
      resetForm();
      await onChanged();
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteSelectedNetwork() {
    if (!selectedNetwork || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      t("networks.confirmDelete", { cidr: selectedNetwork.cidr }),
    );
    if (!confirmed) {
      return;
    }
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/inventory/networks/${selectedNetwork.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });

      if (!response.ok) {
        setError(t("networks.errors.delete"));
        return;
      }

      setMessage(t("networks.deleted"));
      resetForm();
      setShowForm(false);
      await onChanged();
    } catch {
      setError(t("auth.apiUnavailable"));
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>{t("networks.title")}</h1>
          <p>{t("networks.description")}</p>
        </div>
        {canCreate && (
          <button
            className="primary-action"
            onClick={() => {
              setShowForm((value) => !value);
              if (!showForm) {
                resetForm();
              }
            }}
          >
            <Plus size={18} strokeWidth={2} />
            {showForm ? t("common.hideForm") : t("networks.new")}
          </button>
        )}
      </div>

      <section className="ip-summary-grid" aria-label={t("networks.summaryLabel")}>
        <article className="mini-stat">
          <strong>{networks.length}</strong>
          <span>{t("networks.title")}</span>
        </article>
        <article className="mini-stat green">
          <strong>{totalIps}</strong>
          <span>{t("networks.usedIps")}</span>
        </article>
        <article className="mini-stat orange">
          <strong>{totalCapacity}</strong>
          <span>{t("networks.capacity")}</span>
        </article>
        <article className="mini-stat gray">
          <strong>{averageUsage}%</strong>
          <span>{t("networks.averageUsage")}</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("networks.searchPlaceholder")}
                value={query}
              />
            </label>
            <select
              className="filter-select"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">{t("networks.allStates")}</option>
              <option value="active">{t("values.states.active")}</option>
              <option value="inactive">{t("values.states.inactive")}</option>
              <option value="reserved">{t("values.states.reserved")}</option>
            </select>
            <span>{t("networks.count", { count: filteredNetworks.length })}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CIDR</th>
                  <th>{t("common.name")}</th>
                  <th>{t("common.gateway")}</th>
                  <th>VLAN</th>
                  <th>{t("devices.fields.location")}</th>
                  <th>{t("networks.usage")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredNetworks.map((network) => (
                  <tr key={network.id}>
                    <td>
                      <button
                        className="device-name row-action"
                        onClick={() => selectNetwork(network)}
                      >
                        {network.cidr}
                      </button>
                    </td>
                    <td>{network.name}</td>
                    <td>{network.gateway ?? "-"}</td>
                    <td>
                      {network.vlan
                        ? `${network.vlan.vlan_id} - ${network.vlan.name}`
                        : "-"}
                    </td>
                    <td>{network.location ?? "-"}</td>
                    <td>
                      <div className="usage-cell">
                        <span>
                          {network.ip_count}/{network.usable_hosts}
                        </span>
                        <meter
                          max={100}
                          min={0}
                          value={Math.min(network.utilization_percent, 100)}
                        />
                        <small>{network.utilization_percent}%</small>
                      </div>
                    </td>
                    <td>
                      <span className={`mini-pill ${stateTone(network.status)}`}>
                        {stateLabel(network.status, t)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

      {showForm && (selectedNetwork ? canUpdate : canCreate) && (
          <article className="panel device-form-panel">
            <h2>{t(selectedNetwork ? "networks.edit" : "networks.new")}</h2>
            <form className="inventory-form" onSubmit={handleSubmit}>
              <label>
                CIDR
                <input
                  onChange={(event) => updateField("cidr", event.target.value)}
                  placeholder="10.0.3.0/24"
                  required
                  value={form.cidr}
                />
              </label>
              <label>
                {t("common.name")}
                <input
                  onChange={(event) => updateField("name", event.target.value)}
                  required
                  value={form.name}
                />
              </label>
              <label>
                Gateway
                <input
                  onChange={(event) => updateField("gateway", event.target.value)}
                  placeholder="10.0.3.1"
                  value={form.gateway}
                />
              </label>
              <label>
                {t("common.status")}
                <select
                  onChange={(event) => updateField("status", event.target.value)}
                  value={form.status}
                >
                  <option value="active">{t("values.states.active")}</option>
                  <option value="inactive">{t("values.states.inactive")}</option>
                  <option value="reserved">{t("values.states.reserved")}</option>
                </select>
              </label>
              <label>
                VLAN
                <select
                  onChange={(event) => updateField("vlan_id", event.target.value)}
                  value={form.vlan_id}
                >
                  <option value="">{t("networks.withoutVlan")}</option>
                  {vlans.map((vlan) => (
                    <option key={vlan.id} value={vlan.id}>
                      {vlan.vlan_id} - {vlan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("devices.fields.location")}
                <input
                  onChange={(event) => updateField("location", event.target.value)}
                  value={form.location}
                />
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? t("common.saving")
                  : selectedNetwork
                    ? t("networks.save")
                    : t("networks.create")}
              </button>
            </form>
            {selectedNetwork && canDelete && (
              <button className="danger-action panel-action" onClick={deleteSelectedNetwork}>
                {t("networks.delete")}
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}
