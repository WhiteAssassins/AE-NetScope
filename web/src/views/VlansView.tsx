import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { VlanRecord } from "../types";
import { hasPermission } from "../utils";
export default function VlansView({
  csrfToken,
  focusVlanId,
  vlans,
  onChanged,
  permissions,
}: {
  csrfToken: string;
  focusVlanId?: number;
  vlans: VlanRecord[];
  onChanged: () => Promise<void>;
  permissions: string[];
}) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedVlan, setSelectedVlan] = useState<VlanRecord | null>(null);
  const [form, setForm] = useState({
    vlan_id: "",
    name: "",
    description: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canCreate = hasPermission(permissions, "vlans:create");
  const canUpdate = hasPermission(permissions, "vlans:update");
  const canDelete = hasPermission(permissions, "vlans:delete");

  useEffect(() => {
    if (!focusVlanId) {
      return;
    }
    const vlan = vlans.find((item) => item.id === focusVlanId);
    if (vlan) {
      queueMicrotask(() => {
        selectVlan(vlan);
        setQuery(String(vlan.vlan_id));
      });
    }
  }, [focusVlanId, vlans]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredVlans = vlans.filter((vlan) => {
    if (!normalizedQuery) {
      return true;
    }
    return [String(vlan.vlan_id), vlan.name, vlan.description]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });
  const totalNetworks = vlans.reduce((sum, vlan) => sum + vlan.network_count, 0);
  const totalIps = vlans.reduce((sum, vlan) => sum + vlan.ip_count, 0);
  const totalCapacity = vlans.reduce((sum, vlan) => sum + vlan.usable_hosts, 0);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setSelectedVlan(null);
    setForm({ vlan_id: "", name: "", description: "" });
  }

  function selectVlan(vlan: VlanRecord) {
    setSelectedVlan(vlan);
    setShowForm(true);
    setMessage("");
    setError("");
    setForm({
      vlan_id: String(vlan.vlan_id),
      name: vlan.name,
      description: vlan.description ?? "",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedVlan ? !canUpdate : !canCreate) {
      return;
    }
    setMessage("");
    setError("");
    setIsSubmitting(true);

    const payload = {
      vlan_id: Number(form.vlan_id),
      name: form.name,
      description: form.description || null,
    };
    const endpoint = selectedVlan
      ? `${API_BASE_URL}/inventory/vlans/${selectedVlan.id}`
      : `${API_BASE_URL}/inventory/vlans`;

    try {
      const response = await fetch(endpoint, {
        method: selectedVlan ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError("No se pudo guardar la VLAN. Revisa ID duplicado o campos inválidos.");
        return;
      }

      setMessage(selectedVlan ? "VLAN actualizada." : "VLAN creada.");
      resetForm();
      await onChanged();
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteSelectedVlan() {
    if (!selectedVlan || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      `Eliminar la VLAN "${selectedVlan.vlan_id} - ${selectedVlan.name}"? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) {
      return;
    }
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/inventory/vlans/${selectedVlan.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });

      if (!response.ok) {
        setError("No se pudo eliminar la VLAN.");
        return;
      }

      setMessage("VLAN eliminada.");
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
          <h1>VLANs</h1>
          <p>Segmentos lógicos, subredes asociadas y capacidad por VLAN.</p>
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
            {showForm ? "Ocultar formulario" : "Nueva VLAN"}
          </button>
        )}
      </div>

      <section className="ip-summary-grid" aria-label="Resumen de VLANs">
        <article className="mini-stat">
          <strong>{vlans.length}</strong>
          <span>VLANs</span>
        </article>
        <article className="mini-stat green">
          <strong>{totalNetworks}</strong>
          <span>Subredes asociadas</span>
        </article>
        <article className="mini-stat orange">
          <strong>{totalIps}</strong>
          <span>IPs usadas</span>
        </article>
        <article className="mini-stat gray">
          <strong>{totalCapacity}</strong>
          <span>Capacidad útil</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por ID, nombre o descripcion..."
                value={query}
              />
            </label>
            <span>{filteredVlans.length} VLANs</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th>Subredes</th>
                  <th>IPs</th>
                  <th>Capacidad</th>
                  <th>Uso</th>
                </tr>
              </thead>
              <tbody>
                {filteredVlans.map((vlan) => (
                  <tr key={vlan.id}>
                    <td>
                      <button className="device-name row-action" onClick={() => selectVlan(vlan)}>
                        {vlan.vlan_id}
                      </button>
                    </td>
                    <td>{vlan.name}</td>
                    <td>{vlan.description ?? "-"}</td>
                    <td>{vlan.network_count}</td>
                    <td>{vlan.ip_count}</td>
                    <td>{vlan.usable_hosts}</td>
                    <td>
                      <div className="usage-cell">
                        <meter max={100} min={0} value={Math.min(vlan.utilization_percent, 100)} />
                        <small>{vlan.utilization_percent}%</small>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

      {showForm && (selectedVlan ? canUpdate : canCreate) && (
          <article className="panel device-form-panel">
            <h2>{selectedVlan ? "Editar VLAN" : "Nueva VLAN"}</h2>
            <form className="inventory-form" onSubmit={handleSubmit}>
              <label>
                ID VLAN
                <input
                  max={4094}
                  min={1}
                  onChange={(event) => updateField("vlan_id", event.target.value)}
                  required
                  type="number"
                  value={form.vlan_id}
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
              <label className="form-wide">
                Descripción
                <textarea
                  onChange={(event) => updateField("description", event.target.value)}
                  value={form.description}
                />
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Guardando..." : selectedVlan ? "Guardar VLAN" : "Crear VLAN"}
              </button>
            </form>
            {selectedVlan && canDelete && (
              <button className="danger-action panel-action" onClick={deleteSelectedVlan}>
                Eliminar VLAN
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}
