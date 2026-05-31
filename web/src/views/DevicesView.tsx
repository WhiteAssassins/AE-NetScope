import { Plus, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { DeviceDetail, DeviceRecord, NetworkRecord } from "../types";
import { hasPermission, titleCase, typeTone } from "../utils";
export default function DevicesView({
  csrfToken,
  devices,
  networks,
  onCreated,
  permissions,
}: {
  csrfToken: string;
  devices: DeviceRecord[];
  networks: NetworkRecord[];
  onCreated: () => Promise<void>;
  permissions: string[];
}) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    device_type: "Equipo",
    vendor: "",
    model: "",
    operating_system: "",
    location: "",
    notes: "",
    interface_name: "eth0",
    mac_address: "",
    ip_address: "",
    network_id: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    device_type: "Equipo",
    status: "active",
    vendor: "",
    model: "",
    operating_system: "",
    location: "",
    notes: "",
  });
  const [interfaceForm, setInterfaceForm] = useState({
    name: "eth1",
    mac_address: "",
    ip_address: "",
    network_id: "",
  });
  const canCreate = hasPermission(permissions, "devices:create");
  const canUpdate = hasPermission(permissions, "devices:update");
  const canDelete = hasPermission(permissions, "devices:delete");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredDevices = devices.filter((device) => {
    if (!normalizedQuery) {
      return true;
    }
    return [
      device.name,
      device.device_type,
      device.status,
      device.vendor,
      device.model,
      device.operating_system,
      device.location,
      device.primary_ip,
      device.primary_mac,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateEditField(field: keyof typeof editForm, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function updateInterfaceField(field: keyof typeof interfaceForm, value: string) {
    setInterfaceForm((current) => ({ ...current, [field]: value }));
  }

  async function loadDeviceDetail(deviceId: number) {
    setDetailError("");
    const response = await fetch(`${API_BASE_URL}/inventory/devices/${deviceId}`, {
      credentials: "include",
    });
    if (!response.ok) {
      setDetailError("No se pudo cargar el dispositivo.");
      return;
    }
    const device = (await response.json()) as DeviceDetail;
    setSelectedDevice(device);
    setEditForm({
      name: device.name,
      device_type: device.device_type,
      status: device.status,
      vendor: device.vendor ?? "",
      model: device.model ?? "",
      operating_system: device.operating_system ?? "",
      location: device.location ?? "",
      notes: device.notes ?? "",
    });
  }

  async function saveDeviceChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDevice || !canUpdate) {
      return;
    }
    setDetailError("");

    const response = await fetch(`${API_BASE_URL}/inventory/devices/${selectedDevice.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        name: editForm.name,
        device_type: editForm.device_type,
        status: editForm.status,
        vendor: editForm.vendor || null,
        model: editForm.model || null,
        operating_system: editForm.operating_system || null,
        location: editForm.location || null,
        notes: editForm.notes || null,
      }),
    });
    if (!response.ok) {
      setDetailError("No se pudo guardar. Revisa nombres duplicados o campos inválidos.");
      return;
    }
    setSelectedDevice((await response.json()) as DeviceDetail);
    await onCreated();
  }

  async function addInterface(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDevice || !canUpdate) {
      return;
    }
    setDetailError("");

    const response = await fetch(
      `${API_BASE_URL}/inventory/devices/${selectedDevice.id}/interfaces`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          name: interfaceForm.name,
          mac_address: interfaceForm.mac_address || null,
          ip_address: interfaceForm.ip_address || null,
          network_id: interfaceForm.network_id ? Number(interfaceForm.network_id) : null,
        }),
      },
    );
    if (!response.ok) {
      setDetailError("No se pudo agregar la interfaz. Revisa duplicados o formato.");
      return;
    }
    setInterfaceForm({ name: "eth1", mac_address: "", ip_address: "", network_id: "" });
    await loadDeviceDetail(selectedDevice.id);
    await onCreated();
  }

  async function deactivateSelectedDevice() {
    if (!selectedDevice || !canUpdate) {
      return;
    }
    setDetailError("");
    const response = await fetch(
      `${API_BASE_URL}/inventory/devices/${selectedDevice.id}/deactivate`,
      {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      },
    );
    if (!response.ok) {
      setDetailError("No se pudo desactivar el dispositivo.");
      return;
    }
    setSelectedDevice((await response.json()) as DeviceDetail);
    await onCreated();
  }

  async function deleteSelectedDevice() {
    if (!selectedDevice || !canDelete) {
      return;
    }
    const confirmed = window.confirm(
      `Eliminar el dispositivo "${selectedDevice.name}"? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) {
      return;
    }
    setDetailError("");
    const response = await fetch(`${API_BASE_URL}/inventory/devices/${selectedDevice.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-CSRF-Token": csrfToken },
    });
    if (!response.ok) {
      setDetailError("No se pudo eliminar el dispositivo.");
      return;
    }
    setSelectedDevice(null);
    await onCreated();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) {
      return;
    }
    setError("");
    setMessage("");
    setIsSubmitting(true);

    const payload = {
      name: form.name,
      device_type: form.device_type,
      vendor: form.vendor || null,
      model: form.model || null,
      operating_system: form.operating_system || null,
      location: form.location || null,
      notes: form.notes || null,
      interface:
        form.mac_address || form.ip_address
          ? {
              name: form.interface_name || "eth0",
              mac_address: form.mac_address || null,
              ip_address: form.ip_address || null,
              network_id: form.network_id ? Number(form.network_id) : null,
            }
          : null,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/inventory/devices`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError("No se pudo crear el dispositivo. Revisa campos duplicados o inválidos.");
        return;
      }

      setMessage("Dispositivo creado.");
      setForm({
        name: "",
        device_type: "Equipo",
        vendor: "",
        model: "",
        operating_system: "",
        location: "",
        notes: "",
        interface_name: "eth0",
        mac_address: "",
        ip_address: "",
        network_id: "",
      });
      await onCreated();
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-title page-title-row">
        <div>
          <h1>Dispositivos</h1>
          <p>Inventario operativo de hosts, equipos de red y servidores.</p>
        </div>
        {canCreate && (
          <button className="primary-action" onClick={() => setShowForm((value) => !value)}>
            <Plus size={18} strokeWidth={2} />
            {showForm ? "Ocultar formulario" : "Nuevo dispositivo"}
          </button>
        )}
      </div>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, IP, MAC, tipo..."
                value={query}
              />
            </label>
            <span>{filteredDevices.length} dispositivos</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>IP principal</th>
                  <th>MAC</th>
                  <th>Fabricante</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <button
                        className="device-name row-action"
                        onClick={() => loadDeviceDetail(device.id)}
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
                    <td>{device.vendor ?? "-"}</td>
                    <td>{device.location ?? "-"}</td>
                    <td>
                      <span className="status-dot" /> {titleCase(device.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {showForm && canCreate && (
          <article className="panel device-form-panel">
            <h2>Nuevo dispositivo</h2>
            <form className="inventory-form" onSubmit={handleSubmit}>
              <label>
                Nombre
                <input
                  onChange={(event) => updateField("name", event.target.value)}
                  required
                  value={form.name}
                />
              </label>
              <label>
                Tipo
                <select
                  onChange={(event) => updateField("device_type", event.target.value)}
                  value={form.device_type}
                >
                  <option>Equipo</option>
                  <option>Servidor</option>
                  <option>Switch</option>
                  <option>Router</option>
                  <option>Access Point</option>
                  <option>Impresora</option>
                  <option>Otro</option>
                </select>
              </label>
              <label>
                Fabricante
                <input
                  onChange={(event) => updateField("vendor", event.target.value)}
                  value={form.vendor}
                />
              </label>
              <label>
                Modelo
                <input
                  onChange={(event) => updateField("model", event.target.value)}
                  value={form.model}
                />
              </label>
              <label>
                Sistema operativo
                <input
                  onChange={(event) => updateField("operating_system", event.target.value)}
                  value={form.operating_system}
                />
              </label>
              <label>
                Ubicación
                <input
                  onChange={(event) => updateField("location", event.target.value)}
                  value={form.location}
                />
              </label>
              <label>
                Interfaz
                <input
                  onChange={(event) => updateField("interface_name", event.target.value)}
                  value={form.interface_name}
                />
              </label>
              <label>
                MAC
                <input
                  onChange={(event) => updateField("mac_address", event.target.value)}
                  placeholder="00:11:22:33:44:aa"
                  value={form.mac_address}
                />
              </label>
              <label>
                IP
                <input
                  onChange={(event) => updateField("ip_address", event.target.value)}
                  placeholder="10.0.0.10"
                  value={form.ip_address}
                />
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
                Notas
                <textarea
                  onChange={(event) => updateField("notes", event.target.value)}
                  value={form.notes}
                />
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Guardando..." : "Crear dispositivo"}
              </button>
            </form>
          </article>
        )}

        {selectedDevice && (
          <article className="panel device-detail-panel">
            <div className="detail-heading">
              <div>
                <h2>{selectedDevice.name}</h2>
                <p>{selectedDevice.primary_ip ?? "Sin IP principal"}</p>
              </div>
              <button className="text-button" onClick={() => setSelectedDevice(null)}>
                Cerrar
              </button>
            </div>

            {detailError && <p className="login-error">{detailError}</p>}

            {canUpdate && (
            <form className="inventory-form" onSubmit={saveDeviceChanges}>
              <label>
                Nombre
                <input
                  onChange={(event) => updateEditField("name", event.target.value)}
                  required
                  value={editForm.name}
                />
              </label>
              <label>
                Tipo
                <select
                  onChange={(event) => updateEditField("device_type", event.target.value)}
                  value={editForm.device_type}
                >
                  <option>Equipo</option>
                  <option>Servidor</option>
                  <option>Switch</option>
                  <option>Router</option>
                  <option>Access Point</option>
                  <option>Impresora</option>
                  <option>Otro</option>
                </select>
              </label>
              <label>
                Estado
                <select
                  onChange={(event) => updateEditField("status", event.target.value)}
                  value={editForm.status}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="reserved">Reservado</option>
                  <option value="unknown">Desconocido</option>
                </select>
              </label>
              <label>
                Fabricante
                <input
                  onChange={(event) => updateEditField("vendor", event.target.value)}
                  value={editForm.vendor}
                />
              </label>
              <label>
                Modelo
                <input
                  onChange={(event) => updateEditField("model", event.target.value)}
                  value={editForm.model}
                />
              </label>
              <label>
                Sistema operativo
                <input
                  onChange={(event) => updateEditField("operating_system", event.target.value)}
                  value={editForm.operating_system}
                />
              </label>
              <label className="form-wide">
                Ubicación
                <input
                  onChange={(event) => updateEditField("location", event.target.value)}
                  value={editForm.location}
                />
              </label>
              <label className="form-wide">
                Notas
                <textarea
                  onChange={(event) => updateEditField("notes", event.target.value)}
                  value={editForm.notes}
                />
              </label>
              <button className="login-button form-wide" type="submit">
                Guardar cambios
              </button>
            </form>
            )}

            <div className="detail-section">
              <h3>Interfaces</h3>
              <div className="interface-list">
                {selectedDevice.interfaces.map((item) => (
                  <div className="interface-row" key={item.id}>
                    <strong>{item.name}</strong>
                    <span>{item.mac_address ?? "Sin MAC"}</span>
                    <small>
                      {item.ip_addresses.length
                        ? item.ip_addresses.map((ip) => ip.address).join(", ")
                        : "Sin IP"}
                    </small>
                  </div>
                ))}
              </div>
            </div>

            {canUpdate && (
            <form className="inventory-form detail-section" onSubmit={addInterface}>
              <h3 className="form-wide">Agregar interfaz</h3>
              <label>
                Nombre
                <input
                  onChange={(event) => updateInterfaceField("name", event.target.value)}
                  required
                  value={interfaceForm.name}
                />
              </label>
              <label>
                MAC
                <input
                  onChange={(event) => updateInterfaceField("mac_address", event.target.value)}
                  placeholder="00:11:22:33:44:aa"
                  value={interfaceForm.mac_address}
                />
              </label>
              <label>
                IP
                <input
                  onChange={(event) => updateInterfaceField("ip_address", event.target.value)}
                  placeholder="10.0.0.20"
                  value={interfaceForm.ip_address}
                />
              </label>
              <label>
                Subred
                <select
                  onChange={(event) => updateInterfaceField("network_id", event.target.value)}
                  value={interfaceForm.network_id}
                >
                  <option value="">Sin subred</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.cidr} - {network.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="login-button form-wide" type="submit">
                Agregar interfaz
              </button>
            </form>
            )}

            {canUpdate && (
              <button className="danger-action" onClick={deactivateSelectedDevice}>
                Desactivar dispositivo
              </button>
            )}
            {canDelete && (
              <button className="danger-action" onClick={deleteSelectedDevice}>
                Eliminar dispositivo
              </button>
            )}
          </article>
        )}
      </section>
    </>
  );
}
