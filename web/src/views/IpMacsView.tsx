import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../api";
import type { InterfaceRecord, IpMacRecord, NetworkRecord } from "../types";
import { assignmentTypeLabel, hasPermission, stateLabel, stateTone } from "../utils";
export default function IpMacsView({
  csrfToken,
  focusIpId,
  ipMacs,
  interfaces,
  networks,
  onChanged,
  permissions,
}: {
  csrfToken: string;
  focusIpId?: number;
  ipMacs: IpMacRecord[];
  interfaces: InterfaceRecord[];
  networks: NetworkRecord[];
  onChanged: () => Promise<void>;
  permissions: string[];
}) {
  const { t } = useTranslation();
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
  const canCreate = hasPermission(permissions, "ip_addresses:create");
  const canUpdate = hasPermission(permissions, "ip_addresses:update");
  const canDelete = hasPermission(permissions, "ip_addresses:delete");

  useEffect(() => {
    if (!focusIpId) {
      return;
    }
    const item = ipMacs.find((record) => record.id === focusIpId);
    if (item) {
      queueMicrotask(() => {
        selectIp(item);
        setQuery(item.address);
      });
    }
  }, [focusIpId, ipMacs]);

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
    if (selectedIp ? !canUpdate : !canCreate) {
      return;
    }
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
        setError(t("ipMacs.errors.save"));
        return;
      }

      setMessage(t(selectedIp ? "ipMacs.updated" : "ipMacs.created"));
      resetForm();
      await onChanged();
    } catch {
      setError(t("auth.apiUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteSelectedIp() {
    if (!selectedIp || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      t("ipMacs.confirmDelete", { address: selectedIp.address }),
    );
    if (!confirmed) {
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
        setError(t("ipMacs.errors.delete"));
        return;
      }

      setMessage(t("ipMacs.deleted"));
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
          <h1>{t("ipMacs.title")}</h1>
          <p>{t("ipMacs.description")}</p>
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
            {showForm ? t("common.hideForm") : t("ipMacs.new")}
          </button>
        )}
      </div>

      <section className="ip-summary-grid" aria-label={t("ipMacs.summaryLabel")}>
        <article className="mini-stat">
          <strong>{ipMacs.length}</strong>
          <span>{t("ipMacs.registered")}</span>
        </article>
        <article className="mini-stat green">
          <strong>{activeCount}</strong>
          <span>{t("values.states.active")}</span>
        </article>
        <article className="mini-stat orange">
          <strong>{reservedCount}</strong>
          <span>{t("values.states.reserved")}</span>
        </article>
        <article className="mini-stat gray">
          <strong>{unassignedCount}</strong>
          <span>{t("values.states.unassigned")}</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("ipMacs.searchPlaceholder")}
                value={query}
              />
            </label>
            <select
              className="filter-select"
              onChange={(event) => setStateFilter(event.target.value)}
              value={stateFilter}
            >
              <option value="all">{t("ipMacs.allStates")}</option>
              <option value="active">{t("values.states.active")}</option>
              <option value="reserved">{t("values.states.reserved")}</option>
              <option value="unassigned">{t("values.states.unassigned")}</option>
            </select>
            <span>{t("ipMacs.count", { count: filteredIpMacs.length })}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>IP</th>
                  <th>MAC</th>
                  <th>{t("ipMacs.device")}</th>
                  <th>{t("devices.interface")}</th>
                  <th>{t("ipMacs.network")}</th>
                  <th>VLAN</th>
                  <th>{t("common.type")}</th>
                  <th>{t("common.status")}</th>
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
                    <td>{assignmentTypeLabel(item.assignment_type, t)}</td>
                    <td>
                      <span className={`mini-pill ${stateTone(item.state)}`}>
                        {stateLabel(item.state, t)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

      {showForm && (selectedIp ? canUpdate : canCreate) && (
          <article className="panel device-form-panel">
            <h2>{t(selectedIp ? "ipMacs.edit" : "ipMacs.new")}</h2>
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
                {t("common.type")}
                <select
                  onChange={(event) => updateField("assignment_type", event.target.value)}
                  value={form.assignment_type}
                >
                  <option value="static">{t("values.assignmentTypes.static")}</option>
                  <option value="dhcp">DHCP</option>
                  <option value="reserved">{t("values.assignmentTypes.reserved")}</option>
                </select>
              </label>
              <label>
                {t("ipMacs.network")}
                <select
                  onChange={(event) => updateField("network_id", event.target.value)}
                  value={form.network_id}
                >
                  <option value="">{t("devices.withoutSubnet")}</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.cidr} - {network.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-wide">
                {t("devices.interface")}
                <select
                  onChange={(event) => updateField("interface_id", event.target.value)}
                  value={form.interface_id}
                >
                  <option value="">{t("values.states.unassigned")}</option>
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
                {isSubmitting
                  ? t("common.saving")
                  : t(selectedIp ? "ipMacs.save" : "ipMacs.create")}
              </button>
            </form>
            {selectedIp && canDelete && (
              <button className="danger-action panel-action" onClick={deleteSelectedIp}>
                {t("ipMacs.delete")}
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}
