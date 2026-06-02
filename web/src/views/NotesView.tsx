import { FileText, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE_URL } from "../api";
import type { DeviceRecord } from "../types";
import { hasPermission, typeTone } from "../utils";

type NotesViewProps = {
  csrfToken: string;
  devices: DeviceRecord[];
  onChanged: () => Promise<void>;
  onOpenDevice: (deviceId: number) => void;
  permissions: string[];
};

export default function NotesView({
  csrfToken,
  devices,
  onChanged,
  onOpenDevice,
  permissions,
}: NotesViewProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("with-notes");
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const canUpdateDevices = hasPermission(permissions, "devices:update");

  const normalizedQuery = query.trim().toLowerCase();
  const devicesWithNotes = devices.filter((device) => Boolean(device.notes?.trim())).length;
  const devicesWithoutNotes = devices.length - devicesWithNotes;
  const deviceTypes = Array.from(new Set(devices.map((device) => device.device_type))).sort();

  const filteredDevices = devices.filter((device) => {
    const hasNotes = Boolean(device.notes?.trim());
    const matchesFilter =
      filter === "all" ||
      (filter === "with-notes" && hasNotes) ||
      (filter === "without-notes" && !hasNotes) ||
      device.device_type === filter;

    const matchesQuery =
      !normalizedQuery ||
      [
        device.name,
        device.device_type,
        device.primary_ip,
        device.primary_mac,
        device.location,
        device.vendor,
        device.model,
        device.notes,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));

    return matchesFilter && matchesQuery;
  });

  function selectDevice(device: DeviceRecord) {
    setSelectedDevice(device);
    setNotes(device.notes ?? "");
    setMessage("");
    setError("");
  }

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDevice || !canUpdateDevices) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/inventory/devices/${selectedDevice.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ notes: notes.trim() ? notes : null }),
      });

      if (!response.ok) {
        setError("No se pudo guardar la nota técnica.");
        return;
      }

      setMessage(`Nota actualizada: ${selectedDevice.name}`);
      await onChanged();
      setSelectedDevice({ ...selectedDevice, notes: notes.trim() ? notes : null });
    } catch {
      setError("No se pudo conectar con la API.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>Notas técnicas</h1>
        <p>Notas operativas asociadas a dispositivos del inventario.</p>
      </div>

      <section className="ip-summary-grid" aria-label="Resumen de notas técnicas">
        <article className="mini-stat">
          <strong>{devices.length}</strong>
          <span>Dispositivos</span>
        </article>
        <article className="mini-stat green">
          <strong>{devicesWithNotes}</strong>
          <span>Con notas</span>
        </article>
        <article className="mini-stat gray">
          <strong>{devicesWithoutNotes}</strong>
          <span>Sin notas</span>
        </article>
        <article className="mini-stat orange">
          <strong>{deviceTypes.length}</strong>
          <span>Tipos de equipo</span>
        </article>
      </section>

      <section className="device-layout">
        <article className="panel device-table-panel">
          <div className="device-toolbar">
            <label className="inline-search">
              <Search size={18} strokeWidth={1.8} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por dispositivo, IP, ubicación o nota..."
                value={query}
              />
            </label>
            <select
              className="filter-select"
              onChange={(event) => setFilter(event.target.value)}
              value={filter}
            >
              <option value="all">Todas</option>
              <option value="with-notes">Con notas</option>
              <option value="without-notes">Sin notas</option>
              {deviceTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <span>{filteredDevices.length} registros</span>
          </div>

          <div className="notes-list">
            {filteredDevices.map((device) => (
              <article
                className={selectedDevice?.id === device.id ? "note-row selected" : "note-row"}
                key={device.id}
              >
                <button className="note-main button-reset" onClick={() => selectDevice(device)}>
                  <span className={`pill ${typeTone(device.device_type)}`}>{device.device_type}</span>
                  <strong>{device.name}</strong>
                  <small>
                    {device.primary_ip ?? "Sin IP"} · {device.location ?? "Sin ubicación"}
                  </small>
                  <p>{device.notes?.trim() || "Sin nota técnica registrada."}</p>
                </button>
                <button className="user-action" onClick={() => onOpenDevice(device.id)}>
                  Abrir dispositivo
                </button>
              </article>
            ))}
            {!filteredDevices.length && <p className="muted-line">No hay notas para mostrar.</p>}
          </div>
        </article>

        <article className="panel device-form-panel">
          <div className="detail-heading">
            <div>
              <h2>{selectedDevice ? selectedDevice.name : "Selecciona un dispositivo"}</h2>
              <p>{selectedDevice?.primary_ip ?? "Sin dispositivo seleccionado"}</p>
            </div>
            <FileText size={24} strokeWidth={1.8} />
          </div>

          {selectedDevice ? (
            <form className="inventory-form" onSubmit={saveNotes}>
              <label className="form-wide">
                Nota técnica
                <textarea
                  disabled={!canUpdateDevices}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ej: acceso físico, dependencia, configuración relevante, mantenimiento pendiente..."
                  value={notes}
                />
              </label>
              {message && <p className="form-success">{message}</p>}
              {error && <p className="login-error form-wide">{error}</p>}
              <button className="login-button form-wide" disabled={!canUpdateDevices || isSaving} type="submit">
                {isSaving ? "Guardando..." : "Guardar nota"}
              </button>
            </form>
          ) : (
            <p className="muted-line">
              Elige un registro de la lista para revisar o editar su nota técnica.
            </p>
          )}
        </article>
      </section>
    </>
  );
}
