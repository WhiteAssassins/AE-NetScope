import { Plus, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { DeviceRecord, ServiceRecord } from "../types";
import { hasPermission, stateLabel, stateTone } from "../utils";
export default function ServicesView({
  csrfToken,
  services,
  devices,
  onChanged,
  permissions,
}: {
  csrfToken: string;
  services: ServiceRecord[];
  devices: DeviceRecord[];
  onChanged: () => Promise<void>;
  permissions: string[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceRecord | null>(null);
  const [form, setForm] = useState({
    device_id: "",
    name: "",
    port: "",
    protocol: "tcp",
    status: "active",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canCreate = hasPermission(permissions, "services:create");
  const canUpdate = hasPermission(permissions, "services:update");
  const canDelete = hasPermission(permissions, "services:delete");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredServices = services.filter((service) => {
    const matchesQuery =
      !normalizedQuery ||
      [
        service.name,
        service.device_name,
        service.device_type,
        service.primary_ip,
        service.protocol,
        service.status,
        service.port ? String(service.port) : null,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    const matchesStatus = statusFilter === "all" || service.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const activeCount = services.filter((service) => service.status === "active").length;
  const warningCount = services.filter((service) => service.status === "warning").length;
  const inactiveCount = services.filter((service) => service.status === "inactive").length;

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setSelectedService(null);
    setForm({ device_id: "", name: "", port: "", protocol: "tcp", status: "active" });
  }

  function selectService(service: ServiceRecord) {
    setSelectedService(service);
    setShowForm(true);
    setMessage("");
    setError("");
    setForm({
      device_id: String(service.device_id),
      name: service.name,
      port: service.port ? String(service.port) : "",
      protocol: service.protocol,
      status: service.status,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedService ? !canUpdate : !canCreate) {
      return;
    }
    setMessage("");
    setError("");
    setIsSubmitting(true);

    const payload = {
      device_id: Number(form.device_id),
      name: form.name,
      port: form.port ? Number(form.port) : null,
      protocol: form.protocol,
      status: form.status,
    };
    const endpoint = selectedService
      ? `${API_BASE_URL}/inventory/services/${selectedService.id}`
      : `${API_BASE_URL}/inventory/services`;

    try {
      const response = await fetch(endpoint, {
        method: selectedService ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError("No se pudo guardar el servicio. Revisa dispositivo, puerto o campos.");
        return;
      }

      setMessage(selectedService ? "Servicio actualizado." : "Servicio creado.");
      resetForm();
      await onChanged();
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteSelectedService() {
    if (!selectedService || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      `Eliminar el servicio "${selectedService.name}" de "${selectedService.device_name}"? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) {
      return;
    }
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/inventory/services/${selectedService.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });

      if (!response.ok) {
        setError("No se pudo eliminar el servicio.");
        return;
      }

      setMessage("Servicio eliminado.");
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
          <h1>Servicios</h1>
          <p>Puertos, protocolos y servicios activos por dispositivo.</p>
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
            {showForm ? "Ocultar formulario" : "Nuevo servicio"}
          </button>
        )}
      </div>

      <section className="ip-summary-grid" aria-label="Resumen de servicios">
        <article className="mini-stat">
          <strong>{services.length}</strong>
          <span>Servicios</span>
        </article>
        <article className="mini-stat green">
          <strong>{activeCount}</strong>
          <span>Activos</span>
        </article>
        <article className="mini-stat orange">
          <strong>{warningCount}</strong>
          <span>Advertencias</span>
        </article>
        <article className="mini-stat gray">
          <strong>{inactiveCount}</strong>
          <span>Inactivos</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por servicio, puerto, dispositivo, IP..."
                value={query}
              />
            </label>
            <select
              className="filter-select"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="warning">Advertencias</option>
              <option value="inactive">Inactivos</option>
            </select>
            <span>{filteredServices.length} servicios</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Dispositivo</th>
                  <th>IP</th>
                  <th>Puerto</th>
                  <th>Protocolo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <button
                        className="device-name row-action"
                        onClick={() => selectService(service)}
                      >
                        {service.name}
                      </button>
                    </td>
                    <td>{service.device_name}</td>
                    <td>{service.primary_ip ?? "-"}</td>
                    <td>{service.port ?? "-"}</td>
                    <td>{service.protocol.toUpperCase()}</td>
                    <td>
                      <span className={`mini-pill ${stateTone(service.status)}`}>
                        {stateLabel(service.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

      {showForm && (selectedService ? canUpdate : canCreate) && (
          <article className="panel device-form-panel">
            <h2>{selectedService ? "Editar servicio" : "Nuevo servicio"}</h2>
            <form className="inventory-form" onSubmit={handleSubmit}>
              <label className="form-wide">
                Dispositivo
                <select
                  onChange={(event) => updateField("device_id", event.target.value)}
                  required
                  value={form.device_id}
                >
                  <option value="">Selecciona un dispositivo</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name} - {device.device_type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Servicio
                <input
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="SSH"
                  required
                  value={form.name}
                />
              </label>
              <label>
                Puerto
                <input
                  max={65535}
                  min={1}
                  onChange={(event) => updateField("port", event.target.value)}
                  placeholder="22"
                  type="number"
                  value={form.port}
                />
              </label>
              <label>
                Protocolo
                <select
                  onChange={(event) => updateField("protocol", event.target.value)}
                  value={form.protocol}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="icmp">ICMP</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label>
                Estado
                <select
                  onChange={(event) => updateField("status", event.target.value)}
                  value={form.status}
                >
                  <option value="active">Activo</option>
                  <option value="warning">Advertencia</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? "Guardando..."
                  : selectedService
                    ? "Guardar servicio"
                    : "Crear servicio"}
              </button>
            </form>
            {selectedService && canDelete && (
              <button className="danger-action panel-action" onClick={deleteSelectedService}>
                Eliminar servicio
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}
