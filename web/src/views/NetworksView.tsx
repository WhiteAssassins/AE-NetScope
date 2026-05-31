import { Plus, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { NetworkRecord, VlanRecord } from "../types";
import { hasPermission, stateLabel, stateTone } from "../utils";
export default function NetworksView({
  csrfToken,
  networks,
  vlans,
  onChanged,
  permissions,
}: {
  csrfToken: string;
  networks: NetworkRecord[];
  vlans: VlanRecord[];
  onChanged: () => Promise<void>;
  permissions: string[];
}) {
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
        setError("No se pudo guardar la subred. Revisa CIDR, gateway, VLAN o duplicados.");
        return;
      }

      setMessage(selectedNetwork ? "Subred actualizada." : "Subred creada.");
      resetForm();
      await onChanged();
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteSelectedNetwork() {
    if (!selectedNetwork || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      `Eliminar la subred "${selectedNetwork.cidr}"? Esta acción no se puede deshacer.`,
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
        setError("No se pudo eliminar la subred.");
        return;
      }

      setMessage("Subred eliminada.");
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
          <h1>Subredes</h1>
          <p>Rangos CIDR, gateways, VLANs y ocupación de direcciones.</p>
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
            {showForm ? "Ocultar formulario" : "Nueva subred"}
          </button>
        )}
      </div>

      <section className="ip-summary-grid" aria-label="Resumen de subredes">
        <article className="mini-stat">
          <strong>{networks.length}</strong>
          <span>Subredes</span>
        </article>
        <article className="mini-stat green">
          <strong>{totalIps}</strong>
          <span>IPs usadas</span>
        </article>
        <article className="mini-stat orange">
          <strong>{totalCapacity}</strong>
          <span>Capacidad útil</span>
        </article>
        <article className="mini-stat gray">
          <strong>{averageUsage}%</strong>
          <span>Uso promedio</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por CIDR, VLAN, gateway, ubicacion..."
                value={query}
              />
            </label>
            <select
              className="filter-select"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
              <option value="reserved">Reservadas</option>
            </select>
            <span>{filteredNetworks.length} subredes</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CIDR</th>
                  <th>Nombre</th>
                  <th>Gateway</th>
                  <th>VLAN</th>
                  <th>Ubicación</th>
                  <th>Uso</th>
                  <th>Estado</th>
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
                        {stateLabel(network.status)}
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
            <h2>{selectedNetwork ? "Editar subred" : "Nueva subred"}</h2>
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
                Nombre
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
                Estado
                <select
                  onChange={(event) => updateField("status", event.target.value)}
                  value={form.status}
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                  <option value="reserved">Reservada</option>
                </select>
              </label>
              <label>
                VLAN
                <select
                  onChange={(event) => updateField("vlan_id", event.target.value)}
                  value={form.vlan_id}
                >
                  <option value="">Sin VLAN</option>
                  {vlans.map((vlan) => (
                    <option key={vlan.id} value={vlan.id}>
                      {vlan.vlan_id} - {vlan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ubicación
                <input
                  onChange={(event) => updateField("location", event.target.value)}
                  value={form.location}
                />
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? "Guardando..."
                  : selectedNetwork
                    ? "Guardar subred"
                    : "Crear subred"}
              </button>
            </form>
            {selectedNetwork && canDelete && (
              <button className="danger-action panel-action" onClick={deleteSelectedNetwork}>
                Eliminar subred
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}
