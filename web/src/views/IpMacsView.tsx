import { Plus, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { InterfaceRecord, IpMacRecord, NetworkRecord } from "../types";
import { hasPermission, stateLabel, stateTone, titleCase } from "../utils";
export default function IpMacsView({
  csrfToken,
  ipMacs,
  interfaces,
  networks,
  onChanged,
  permissions,
}: {
  csrfToken: string;
  ipMacs: IpMacRecord[];
  interfaces: InterfaceRecord[];
  networks: NetworkRecord[];
  onChanged: () => Promise<void>;
  permissions: string[];
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
  const canCreate = hasPermission(permissions, "ip_addresses:create");
  const canUpdate = hasPermission(permissions, "ip_addresses:update");
  const canDelete = hasPermission(permissions, "ip_addresses:delete");

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
        setError("No se pudo guardar la IP. Revisa duplicados, formato o asignación.");
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

  async function deleteSelectedIp() {
    if (!selectedIp || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      `Eliminar la IP "${selectedIp.address}"? Esta acción no se puede deshacer.`,
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
          <h1>IPs y MACs</h1>
          <p>Tabla operativa de direccionamiento, interfaces y asignaciónes.</p>
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
            {showForm ? "Ocultar formulario" : "Nueva IP"}
          </button>
        )}
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

      {showForm && (selectedIp ? canUpdate : canCreate) && (
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
                  <option value="static">Estática</option>
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
            {selectedIp && canDelete && (
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
