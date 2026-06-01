import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { DeviceDetail, DeviceRecord, NetworkRecord } from "../types";
import { hasPermission, titleCase, typeTone } from "../utils";

const deviceTypes = [
  "Equipo",
  "Servidor",
  "Switch",
  "Router",
  "Firewall",
  "Access Point",
  "Cámara IP",
  "NVR",
  "DVR",
  "NAS",
  "SAN",
  "Impresora",
  "VoIP",
  "UPS",
  "IoT",
  "Virtualización",
  "Contenedor",
  "Sensor",
  "Control de acceso",
  "Otro",
];

const emptyDeviceForm = {
  name: "",
  device_type: "Equipo",
  status: "active",
  vendor: "",
  model: "",
  serial_number: "",
  asset_tag: "",
  operating_system: "",
  firmware_version: "",
  cpu: "",
  memory: "",
  storage: "",
  warranty_expires: "",
  owner: "",
  rack_position: "",
  location: "",
  notes: "",
};

const emptyCreateForm = {
  ...emptyDeviceForm,
  interface_name: "eth0",
  mac_address: "",
  ip_address: "",
  network_id: "",
};

type DeviceForm = typeof emptyDeviceForm;
type CreateForm = typeof emptyCreateForm;

export default function DevicesView({
  csrfToken,
  devices,
  focusDeviceId,
  networks,
  onCreated,
  permissions,
}: {
  csrfToken: string;
  devices: DeviceRecord[];
  focusDeviceId?: number;
  networks: NetworkRecord[];
  onCreated: () => Promise<void>;
  permissions: string[];
}) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreateForm);
  const [editForm, setEditForm] = useState<DeviceForm>(emptyDeviceForm);
  const [interfaceForm, setInterfaceForm] = useState({
    name: "eth1",
    mac_address: "",
    ip_address: "",
    network_id: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceDetail | null>(null);
  const [detailError, setDetailError] = useState("");

  const canCreate = hasPermission(permissions, "devices:create");
  const canUpdate = hasPermission(permissions, "devices:update");
  const canDelete = hasPermission(permissions, "devices:delete");

  useEffect(() => {
    if (focusDeviceId) {
      loadDeviceDetail(focusDeviceId).catch(() => undefined);
    }
  }, [focusDeviceId]);

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
      device.serial_number,
      device.asset_tag,
      device.operating_system,
      device.firmware_version,
      device.cpu,
      device.memory,
      device.storage,
      device.warranty_expires,
      device.owner,
      device.rack_position,
      device.location,
      device.primary_ip,
      device.primary_mac,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });

  function updateField(field: keyof CreateForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateEditField(field: keyof DeviceForm, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function updateInterfaceField(field: keyof typeof interfaceForm, value: string) {
    setInterfaceForm((current) => ({ ...current, [field]: value }));
  }

  function devicePayload(values: DeviceForm) {
    return {
      name: values.name,
      device_type: values.device_type,
      status: values.status,
      vendor: values.vendor || null,
      model: values.model || null,
      serial_number: values.serial_number || null,
      asset_tag: values.asset_tag || null,
      operating_system: values.operating_system || null,
      firmware_version: values.firmware_version || null,
      cpu: values.cpu || null,
      memory: values.memory || null,
      storage: values.storage || null,
      warranty_expires: values.warranty_expires || null,
      owner: values.owner || null,
      rack_position: values.rack_position || null,
      location: values.location || null,
      notes: values.notes || null,
    };
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
      serial_number: device.serial_number ?? "",
      asset_tag: device.asset_tag ?? "",
      operating_system: device.operating_system ?? "",
      firmware_version: device.firmware_version ?? "",
      cpu: device.cpu ?? "",
      memory: device.memory ?? "",
      storage: device.storage ?? "",
      warranty_expires: device.warranty_expires ?? "",
      owner: device.owner ?? "",
      rack_position: device.rack_position ?? "",
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
      body: JSON.stringify(devicePayload(editForm)),
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
      ...devicePayload(form),
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
      setForm(emptyCreateForm);
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
                placeholder="Buscar por nombre, IP, MAC, serial, asset tag..."
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
                  <th>Serial</th>
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
                    <td>{device.serial_number ?? "-"}</td>
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
              <DeviceFields mode="create" values={form} onChange={updateField} />
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
              <NetworkSelect
                networks={networks}
                onChange={(value) => updateField("network_id", value)}
                value={form.network_id}
              />
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
                <DeviceFields mode="edit" values={editForm} onChange={updateEditField} />
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
                <NetworkSelect
                  networks={networks}
                  onChange={(value) => updateInterfaceField("network_id", value)}
                  value={interfaceForm.network_id}
                />
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

function DeviceFields({
  mode,
  onChange,
  values,
}: {
  mode: "create" | "edit";
  onChange: (field: keyof DeviceForm, value: string) => void;
  values: DeviceForm;
}) {
  return (
    <>
      <label>
        Nombre
        <input onChange={(event) => onChange("name", event.target.value)} required value={values.name} />
      </label>
      <label>
        Tipo
        <select onChange={(event) => onChange("device_type", event.target.value)} value={values.device_type}>
          {deviceTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      {mode === "edit" && (
        <label>
          Estado
          <select onChange={(event) => onChange("status", event.target.value)} value={values.status}>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
            <option value="reserved">Reservado</option>
            <option value="unknown">Desconocido</option>
          </select>
        </label>
      )}
      <TextField field="vendor" label="Fabricante" onChange={onChange} value={values.vendor} />
      <TextField field="model" label="Modelo" onChange={onChange} value={values.model} />
      <TextField field="serial_number" label="Serial" onChange={onChange} value={values.serial_number} />
      <TextField field="asset_tag" label="Asset tag" onChange={onChange} value={values.asset_tag} />
      <TextField
        field="operating_system"
        label="Sistema operativo"
        onChange={onChange}
        value={values.operating_system}
      />
      <TextField
        field="firmware_version"
        label="Firmware"
        onChange={onChange}
        value={values.firmware_version}
      />
      <TextField field="cpu" label="CPU" onChange={onChange} value={values.cpu} />
      <TextField field="memory" label="RAM" onChange={onChange} value={values.memory} />
      <TextField field="storage" label="Almacenamiento" onChange={onChange} value={values.storage} />
      <TextField
        field="warranty_expires"
        label="Garantía"
        onChange={onChange}
        placeholder="2028-12-31"
        value={values.warranty_expires}
      />
      <TextField field="owner" label="Responsable" onChange={onChange} value={values.owner} />
      <TextField
        field="rack_position"
        label="Rack / posición"
        onChange={onChange}
        value={values.rack_position}
      />
      <TextField field="location" label="Ubicación" onChange={onChange} value={values.location} />
      <label className="form-wide">
        Notas
        <textarea onChange={(event) => onChange("notes", event.target.value)} value={values.notes} />
      </label>
    </>
  );
}

function TextField({
  field,
  label,
  onChange,
  placeholder,
  value,
}: {
  field: keyof DeviceForm;
  label: string;
  onChange: (field: keyof DeviceForm, value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label>
      {label}
      <input
        onChange={(event) => onChange(field, event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function NetworkSelect({
  networks,
  onChange,
  value,
}: {
  networks: NetworkRecord[];
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      Subred
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Sin subred</option>
        {networks.map((network) => (
          <option key={network.id} value={network.id}>
            {network.cidr} - {network.name}
          </option>
        ))}
      </select>
    </label>
  );
}
